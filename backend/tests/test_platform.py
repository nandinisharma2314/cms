"""Settings, public configuration, sessions, password resets, locations,
departments, attachments limits and the dashboard."""
import pytest

from conftest import (
    ADMIN, CLIENT_HEADERS, ELEC_AGENT, ELEC_MANAGER, SUPER_ADMIN, WATER_AGENT, first_login, new_client, staff_login,
)
from factories import PASSWORD, SETTINGS, email
from test_workflow import category_id, file_complaint, items, location_id

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64


def test_attachment_links_stay_the_same_between_refreshes(monkeypatch):
    """Pages poll the complaint; stable links let the browser reuse the files it already loaded."""
    from types import SimpleNamespace
    from urllib.parse import parse_qs, urlparse

    import config
    from services import attachment_service

    attachment = SimpleNamespace(id=7)
    ttl = config.ATTACHMENT_URL_TTL_SECONDS
    step = max(1, ttl // 3)
    start = 1_800_000_000 - (1_800_000_000 % step)  # the beginning of a step
    links = []
    for now in (start + 1, start + step - 1, start + step + 1):
        monkeypatch.setattr(attachment_service, "unix_now", lambda now=now: now)
        links.append(attachment_service.signed_url(attachment))
    assert links[0] == links[1] and links[1] != links[2]
    expires = int(parse_qs(urlparse(links[0]).query)["expires"][0])
    assert ttl <= expires - (start + step - 1)  # still valid for the whole TTL when handed out


def settings_form(client, headers, **changes):
    current = client.get("/settings/", headers=headers).json()
    form = {k: current[k] for k in (
        "organisation_name", "product_name", "support_email", "support_phone", "support_hours", "timezone",
        "complaint_id_prefix", "complaint_next_number", "reopen_window_days", "max_reopens",
        "max_attachments_per_complaint", "max_attachment_mb", "allowed_attachment_types", "phone_country_code",
        "phone_number_length", "phone_expected_prefixes", "sms_notifications_enabled", "email_notifications_enabled",
    )}
    # null keeps the current next number (it moves on as complaints come in)
    form["complaint_next_number"] = None
    form.update(changes)
    return form


# ---------------------------------------------------------------------------
# Public configuration, health, schema
# ---------------------------------------------------------------------------

def test_public_config_needs_no_sign_in_and_carries_branding(client):
    config = client.get("/public/config").json()
    assert config["organisation_name"] == SETTINGS["organisation_name"]
    assert config["product_name"] == SETTINGS["product_name"]
    assert config["support"] == {"email": SETTINGS["support_email"], "phone": SETTINGS["support_phone"],
                                 "hours": SETTINGS["support_hours"]}
    assert config["phone"] == {"country_code": "+91", "number_length": 10}
    assert config["attachments"]["max_per_complaint"] == 5 and "jpg" in config["attachments"]["allowed_types"]
    assert config["ui"]["default_page_size"] == 25 and config["otp"]["length"] == 6
    assert config["otp"]["channels"] == ["sms", "email"]


def test_health_and_security_headers(client):
    response = client.get("/health/")
    assert response.json() == {"server": "running", "database": "connected"}
    for header, value in (("x-content-type-options", "nosniff"), ("x-frame-options", "DENY"),
                          ("referrer-policy", "no-referrer"), ("cache-control", "no-store")):
        assert response.headers[header] == value


def test_expected_schema_revision_is_the_migration_head(client):
    from alembic.script import ScriptDirectory

    from database import engine
    from manage import _alembic_config
    from schema_version import EXPECTED_REVISION, schema_problem

    assert ScriptDirectory.from_config(_alembic_config()).get_current_head() == EXPECTED_REVISION
    assert schema_problem(engine) is None


def test_migrate_removes_permissions_the_code_no_longer_has(client):
    from database import SessionLocal
    from models import Permission, Role
    from services.bootstrap_service import sync_system_data, system_data_problems

    with SessionLocal() as db:
        retired = Permission(key="legacy.retired", group="Legacy", description="No longer in the code")
        admin = db.query(Role).filter(Role.key == "admin").one()
        admin.permissions.append(retired)
        db.commit()
        assert system_data_problems(db) == ["permissions no longer in the code: legacy.retired"]
        assert sync_system_data(db) == ["removed permission legacy.retired"]
        assert system_data_problems(db) == []
        db.refresh(admin)
        assert "legacy.retired" not in {p.key for p in admin.permissions}


def test_cors_allows_only_configured_origins(client):
    allowed = client.options("/auth/login", headers={"Origin": "http://admin.test",
                                                     "Access-Control-Request-Method": "POST"})
    assert allowed.headers["access-control-allow-origin"] == "http://admin.test"
    assert allowed.headers["access-control-allow-credentials"] == "true"
    other = client.options("/auth/login", headers={"Origin": "http://evil.test",
                                                   "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in other.headers


def test_a_switched_off_channel_is_not_offered_or_used(client, login, end_user_login, monkeypatch):
    import config
    from database import SessionLocal
    from models import DELIVERY_FAILED, EndUser, MessageDelivery, Notification, SystemSettings
    from services import notification_service

    end_user = end_user_login("9876543211")
    with SessionLocal() as db:
        settings = db.get(SystemSettings, 1)
        amit = db.query(EndUser).filter(EndUser.mobile == "9876543211").one()
        before = (settings.sms_notifications_enabled, amit.notify_sms, amit.notify_email)
        settings.sms_notifications_enabled, amit.notify_sms, amit.notify_email = True, True, False
        notification_service.notify(db, [amit], "complaint.status", "Queued while SMS was on")
        db.commit()
        amit_id = amit.id
    try:
        monkeypatch.setattr(config, "SMS_DELIVERY", "off")
        public = client.get("/public/config").json()
        assert public["otp"]["channels"] == ["email"] and public["notifications"]["sms"] is False
        assert client.post("/portal/auth/request-otp",
                           json={"channel": "sms", "identifier": "9876543211"}).status_code == 400
        assert client.post("/portal/profile/contact/request", headers=end_user,
                           json={"channel": "sms", "value": "9876500000"}).status_code == 400

        root = login(SUPER_ADMIN)
        assert client.get("/settings/", headers=root).json()["available_channels"] == ["email"]
        refused = client.put("/settings/", headers=root, json=settings_form(client, root, sms_notifications_enabled=True))
        assert refused.status_code == 400 and "SMS_DELIVERY" in refused.json()["detail"]

        with SessionLocal() as db:
            amit = db.get(EndUser, amit_id)
            notification_service.notify(db, [amit], "complaint.status", "Nothing goes out by SMS now")
            db.commit()
            notification_service.deliver_due(db, 100)

            def deliveries(title):
                return (db.query(MessageDelivery).join(Notification)
                        .filter(Notification.title == title, Notification.recipient_id == amit_id).all())

            assert deliveries("Nothing goes out by SMS now") == []
            [queued] = deliveries("Queued while SMS was on")
            assert queued.status == DELIVERY_FAILED and queued.attempts == 0
    finally:
        with SessionLocal() as db:
            settings = db.get(SystemSettings, 1)
            amit = db.get(EndUser, amit_id)
            settings.sms_notifications_enabled, amit.notify_sms, amit.notify_email = before
            db.commit()


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

def test_settings_are_super_admin_business(client, login):
    assert client.get("/settings/", headers=login(ADMIN)).status_code == 403
    root = login(SUPER_ADMIN)
    current = client.get("/settings/", headers=root).json()
    assert current["organisation_name"] == SETTINGS["organisation_name"]
    assert "Asia/Kolkata" in current["timezones"] and "pdf" in current["supported_attachment_types"]
    assert client.get("/settings/status", headers=root).json() == {"problems": []}


@pytest.mark.parametrize("changes", [
    {"support_email": "not-an-email"},
    {"timezone": "Mars/Olympus"},
    {"complaint_id_prefix": "cmp"},
    {"phone_country_code": "91"},
    {"phone_expected_prefixes": "6-9"},
    {"allowed_attachment_types": ["jpg", "exe"]},
    {"max_attachment_mb": 0},
    {"phone_number_length": 3},
    {"complaint_next_number": 0},
    {"complaint_next_number": 1},  # already used
])
def test_settings_validation(client, login, changes):
    root = login(SUPER_ADMIN)
    response = client.put("/settings/", headers=root, json=settings_form(client, root, **changes))
    assert response.status_code == 400, response.text


def test_complaint_numbers_cannot_be_reused(client, login, end_user_login):
    root = login(SUPER_ADMIN)
    cid = file_complaint(client, end_user_login(), title="Numbering")
    prefix, number = cid.rsplit("-", 1)
    reused = client.put("/settings/", headers=root, json=settings_form(client, root, complaint_next_number=int(number)))
    assert reused.status_code == 400 and cid in reused.json()["detail"]
    # a new prefix starts its own sequence
    fresh = client.put("/settings/", headers=root,
                       json=settings_form(client, root, complaint_id_prefix="TKT", complaint_next_number=1))
    assert fresh.status_code == 200, fresh.text
    try:
        assert file_complaint(client, end_user_login(), title="New prefix") == "TKT-1"
    finally:
        restored = client.put("/settings/", headers=root, json=settings_form(
            client, root, complaint_id_prefix=prefix, complaint_next_number=int(number) + 1_000))
        assert restored.status_code == 200, restored.text


def test_missing_settings_stop_what_depends_on_them(client, login, end_user_login):
    root = login(SUPER_ADMIN)
    end_user = end_user_login()
    before = settings_form(client, root)
    cleared = client.put("/settings/", headers=root, json={**before, "support_phone": "", "max_reopens": None,
                                                            "complaint_id_prefix": None})
    assert cleared.status_code == 200
    try:
        assert client.get("/public/config").json()["support"]["phone"] is None  # hidden, not invented
        problems = {p["field"] for p in client.get("/settings/status", headers=root).json()["problems"]}
        assert problems == {"max_reopens", "complaint_id_prefix"}
        department = client.get("/portal/departments", headers=end_user).json()[0]
        blocked = client.post("/portal/complaints", headers=end_user, data={
            "department_id": department["id"], "category_id": department["categories"][0]["id"],
            "location_id": client.get("/portal/me", headers=end_user).json()["location"]["id"],
            "title": "Unconfigured", "description": "x",
        })
        assert blocked.status_code == 503 and "Complaint ID prefix" in blocked.json()["detail"]
    finally:
        assert client.put("/settings/", headers=root, json=before).status_code == 200


# ---------------------------------------------------------------------------
# Staff sessions
# ---------------------------------------------------------------------------

def test_refresh_rotates_and_detects_reuse(client, monkeypatch):
    from services import token_service

    own = new_client()
    staff_login(own, WATER_AGENT)
    first = own.cookies.get("cms_refresh_staff")
    assert first
    refreshed = own.post("/auth/refresh", params={"principal": "staff"}, headers=CLIENT_HEADERS)
    assert refreshed.status_code == 200 and refreshed.json()["access_token"]
    second = own.cookies.get("cms_refresh_staff")
    assert second and second != first

    # a second tab refreshing with the old cookie at the same moment is fine (grace window) ...
    tab = new_client()
    tab.cookies.set("cms_refresh_staff", first, path="/auth")
    assert tab.post("/auth/refresh", params={"principal": "staff"}, headers=CLIENT_HEADERS).status_code == 200
    # ... but replaying it later means it was stolen: the whole session ends
    monkeypatch.setattr(token_service, "REFRESH_TOKEN_REUSE_GRACE_SECONDS", -1)
    replay = new_client()
    replay.cookies.set("cms_refresh_staff", first, path="/auth")
    assert replay.post("/auth/refresh", params={"principal": "staff"}, headers=CLIENT_HEADERS).status_code == 401
    assert own.post("/auth/refresh", params={"principal": "staff"}, headers=CLIENT_HEADERS).status_code == 401

    # the cookie is only accepted for its own kind of account and with the client header
    staff_login(own, WATER_AGENT)
    assert own.post("/auth/refresh", params={"principal": "staff"}).status_code == 403
    assert own.post("/auth/refresh", params={"principal": "end_user"}, headers=CLIENT_HEADERS).status_code == 401
    assert own.post("/auth/refresh", params={"principal": "robot"}, headers=CLIENT_HEADERS).status_code == 400


def test_logout_ends_the_session(client):
    own = new_client()
    staff_login(own, WATER_AGENT)
    assert own.post("/auth/logout", params={"principal": "staff"}, headers=CLIENT_HEADERS).status_code == 200
    assert own.cookies.get("cms_refresh_staff") is None
    assert own.post("/auth/refresh", params={"principal": "staff"}, headers=CLIENT_HEADERS).status_code == 401


def test_a_just_rotated_token_does_not_outlive_sign_out(client):
    own = new_client()
    staff_login(own, WATER_AGENT)
    first = own.cookies.get("cms_refresh_staff")
    assert own.post("/auth/refresh", params={"principal": "staff"}, headers=CLIENT_HEADERS).status_code == 200
    assert own.post("/auth/logout", params={"principal": "staff"}, headers=CLIENT_HEADERS).status_code == 200
    # still inside the grace window, but the session it belonged to has ended
    stale = new_client()
    stale.cookies.set("cms_refresh_staff", first, path="/")
    refused = stale.post("/auth/refresh", params={"principal": "staff"}, headers=CLIENT_HEADERS)
    assert refused.status_code == 401
    # the dead cookie is removed, so the app stops trying it on every load
    assert "cms_refresh_staff=" in refused.headers["set-cookie"] and "Max-Age=0" in refused.headers["set-cookie"]


def test_login_cookie_is_http_only_and_scoped_to_auth(client):
    own = new_client()
    response = own.post("/auth/login", json={"identifier": WATER_AGENT, "password": PASSWORD})
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "Path=/" in cookie and "samesite=lax" in cookie.lower()
    assert "refresh_token" not in response.json()


def test_password_rules(client, login):
    root = login(SUPER_ADMIN)
    roles = {r["key"]: r["id"] for r in client.get("/users/assignable-roles", headers=root).json()}
    for weak in ("short1!", "alllowercaseletters", "a" * 80 + "A1!"):
        response = client.post("/users/", headers=root, json={
            "name": "Weak", "email": email("weak"), "role_id": roles["agent"], "password": weak, "scopes": [],
        })
        assert response.status_code == 400, weak


# ---------------------------------------------------------------------------
# Password reset tickets
# ---------------------------------------------------------------------------

def test_reset_requests_do_not_reveal_accounts(client):
    known = client.post("/auth/reset-query", json={"identifier": email("roads.agent"), "reason": "Forgot it"})
    unknown = client.post("/auth/reset-query", json={"identifier": "nobody@example.test", "reason": "Forgot it"})
    assert known.status_code == unknown.status_code == 200
    assert set(known.json()) == set(unknown.json()) == {"ticket_id", "status"}
    assert len(known.json()["ticket_id"]) >= 12
    assert client.post("/auth/reset-query", json={"identifier": " ", "reason": "x"}).status_code == 400


@pytest.fixture
def managers_handle_resets(client, login):
    root = login(SUPER_ADMIN)
    manager_role = next(r for r in client.get("/roles/", headers=root).json() if r["key"] == "manager")
    granted = manager_role["permissions"] + ["user.reset_password"]
    assert client.patch(f"/roles/{manager_role['id']}", headers=root, json={"permissions": granted}).status_code == 200
    yield
    client.patch(f"/roles/{manager_role['id']}", headers=root, json={"permissions": manager_role["permissions"]})


def test_reset_ticket_is_handled_by_someone_above(client, login, managers_handle_resets):
    ticket = client.post("/auth/reset-query", json={"identifier": "+91 98765 00007", "reason": "Locked out"}).json()
    # Neha (water agent) reports to Suresh (water manager), who reports to the admin
    manager = login("water.manager@example.test")
    visible = items(client.get("/auth/reset-queries", params={"pending_only": True}, headers=manager))
    mine = next(t for t in visible if t["ticket_id"] == ticket["ticket_id"])
    assert mine["matched_user"]["name"] == "Neha Singh"
    # the electricity manager doesn't manage Neha
    other = items(client.get("/auth/reset-queries", headers=login(ELEC_MANAGER)))
    assert ticket["ticket_id"] not in {t["ticket_id"] for t in other}
    assert client.post(f"/auth/reset-queries/{ticket['ticket_id']}/approve",
                       headers=login(ELEC_MANAGER)).status_code == 404

    session = new_client()
    old_token = staff_login(session, WATER_AGENT)
    approved = client.post(f"/auth/reset-queries/{ticket['ticket_id']}/approve", headers=manager)
    assert approved.status_code == 200
    temporary = approved.json()["temporary_password"]
    assert client.post(f"/auth/reset-queries/{ticket['ticket_id']}/approve", headers=manager).status_code == 409
    # the user's existing sessions end, and the temporary password must be replaced first
    assert session.get("/auth/me", headers=old_token).status_code == 401
    assert session.post("/auth/refresh", params={"principal": "staff"}, headers=CLIENT_HEADERS).status_code == 401
    temp_headers = staff_login(session, WATER_AGENT, temporary)
    me = session.get("/auth/me", headers=temp_headers).json()
    assert me["must_change_password"] is True
    assert session.get("/complaints/", headers=temp_headers).status_code == 403
    first_login(session, WATER_AGENT, temporary, PASSWORD + "x")
    # put the shared test password back
    headers = staff_login(session, WATER_AGENT, PASSWORD + "x")
    assert session.post("/auth/change-password", headers=headers,
                        json={"current_password": PASSWORD + "x", "new_password": PASSWORD}).status_code == 200


def test_reset_ticket_can_be_rejected(client, login):
    root = login(SUPER_ADMIN)
    unmatched = client.post("/auth/reset-query", json={"identifier": "ghost@example.test", "reason": "Help"}).json()
    listed = items(client.get("/auth/reset-queries", params={"page_size": 100}, headers=root))
    entry = next(t for t in listed if t["ticket_id"] == unmatched["ticket_id"])
    assert entry["matched_user"] is None  # only the Super Admin sees tickets that matched nobody
    assert client.post(f"/auth/reset-queries/{unmatched['ticket_id']}/approve", headers=root).status_code == 409
    url = f"/auth/reset-queries/{unmatched['ticket_id']}/reject"
    assert client.post(url, headers=root, json={"note": "  "}).status_code == 400
    rejected = client.post(url, headers=root, json={"note": "No such account"}).json()
    assert (rejected["status"], rejected["decided_by"], rejected["decision_note"]) == \
        ("REJECTED", "Rahul Sharma", "No such account")
    assert client.post(url, headers=root, json={"note": "Again"}).status_code == 409
    page = client.get("/auth/reset-queries", params={"page_size": 1}, headers=root).json()
    assert len(page["items"]) == 1 and page["total"] >= 3


# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------

def test_location_levels(client, login):
    root = login(SUPER_ADMIN)
    levels = client.get("/locations/types", headers=root).json()
    assert [lvl["key"] for lvl in levels] == ["country", "state", "district", "city", "area"]
    assert all(lvl["locations"] > 0 for lvl in levels)
    # only the deepest level can be removed, and only while nothing uses it
    assert client.delete(f"/locations/types/{levels[0]['id']}", headers=root).status_code == 409
    assert client.delete(f"/locations/types/{levels[-1]['id']}", headers=root).status_code == 409
    added = client.post("/locations/types", headers=root, json={"key": "ward", "name": "Ward"})
    assert added.status_code == 201 and added.json()["depth"] == 5
    assert client.post("/locations/types", headers=root, json={"key": "ward2", "name": "ward"}).status_code == 409
    renamed = client.patch(f"/locations/types/{added.json()['id']}", headers=root, json={"name": "Sector"})
    assert renamed.json()["name"] == "Sector"
    assert client.post("/locations/types", headers=login(ELEC_MANAGER),
                       json={"key": "block", "name": "Block"}).status_code == 403
    assert client.delete(f"/locations/types/{added.json()['id']}", headers=root).status_code == 200


def test_deactivating_a_location_closes_everything_below(client, login, end_user_login):
    root = login(SUPER_ADMIN)
    jodhpur = location_id(client, root, "India", "Rajasthan", "Jodhpur", portal=False)
    ratanada = location_id(client, root, "India", "Rajasthan", "Jodhpur", "Jodhpur", "Ratanada", portal=False)
    assert client.patch(f"/locations/{jodhpur}", headers=root, json={"is_active": False}).status_code == 200
    try:
        # nothing can be filed, added or scoped underneath
        blocked = client.post("/portal/complaints", headers=end_user_login(), data={
            "department_id": category_id(client, root, "Roads", "Potholes")[0],
            "category_id": category_id(client, root, "Roads", "Potholes")[1],
            "location_id": ratanada, "title": "Pothole", "description": "x",
        })
        assert blocked.status_code == 400
        assert client.post("/locations/", headers=root, json={"name": "Paota", "parent_id": ratanada}).status_code == 400
        # a child can't be switched back on while its parent is off
        assert client.patch(f"/locations/{ratanada}", headers=root, json={"is_active": True}).status_code == 409
        rajasthan_id = location_id(client, end_user_login(), "India", "Rajasthan")
        tree_names = {n["name"] for n in client.get(f"/portal/locations/nodes?parent_id={rajasthan_id}",
                                                    headers=end_user_login()).json()}
        assert "Jodhpur" not in tree_names
        exported = client.get("/locations/export", headers=root).text
        assert "Ratanada" not in exported
    finally:
        assert client.patch(f"/locations/{jodhpur}", headers=root, json={"is_active": True}).status_code == 200


def test_only_unused_locations_can_be_deleted(client, login):
    root = login(SUPER_ADMIN)
    mansarovar = location_id(client, root, "India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar", portal=False)
    assert client.delete(f"/locations/{mansarovar}", headers=root).status_code == 409
    city = location_id(client, root, "India", "Rajasthan", "Jaipur", "Jaipur", portal=False)
    typo = client.post("/locations/", headers=root, json={"name": "  Mansrovar  ", "parent_id": city}).json()
    assert typo["name"] == "Mansrovar"
    assert client.post("/locations/", headers=root, json={"name": "mansrovar", "parent_id": city}).status_code == 409
    assert client.delete(f"/locations/{typo['id']}", headers=root).status_code == 200


# ---------------------------------------------------------------------------
# Departments and categories
# ---------------------------------------------------------------------------

def test_categories_carry_a_default_priority(client, login):
    root = login(SUPER_ADMIN)
    priorities = {p["name"]: p["id"] for p in client.get("/priorities/", headers=root).json()}
    missing = client.post("/departments/", headers=root, json={
        "name": "Libraries", "code": "LIB", "categories": [{"name": "Late opening"}]})
    assert missing.status_code == 422
    none = client.post("/departments/", headers=root, json={"name": "Libraries", "code": "LIB", "categories": []})
    assert none.status_code == 400
    created = client.post("/departments/", headers=root, json={
        "name": "Libraries", "code": "LIB",
        "categories": [{"name": "Late opening", "default_priority_id": priorities["Low"]}]}).json()
    category = created["categories"][0]
    assert category["default_priority"]["name"] == "Low"

    url = f"/departments/{created['id']}/categories/{category['id']}"
    changed = client.patch(url, headers=root, json={"default_priority_id": priorities["Medium"]})
    assert changed.status_code == 200, changed.text
    # the last active category can't be switched off: nobody could file anything
    assert client.patch(url, headers=root, json={"is_active": False}).status_code == 409
    second = client.post(f"/departments/{created['id']}/categories", headers=root,
                         json={"name": "Damaged books", "default_priority_id": priorities["Low"]})
    assert second.status_code == 201
    assert client.patch(url, headers=root, json={"is_active": False}).status_code == 200


def test_text_limits_come_from_the_columns_and_are_enforced(client, login):
    from models import EndUser, User, max_length
    from utils.security import EMAIL_MAX_LENGTH  # can't import models (models imports it)

    assert EMAIL_MAX_LENGTH == max_length(User.email) == max_length(EndUser.email)
    limits = client.get("/public/config").json()["limits"]
    assert (limits["title"], limits["person_name"], limits["feedback"], limits["department_code"]) == (200, 150, 1000, 20)
    root = login(SUPER_ADMIN)
    priorities = {p["name"]: p["id"] for p in client.get("/priorities/", headers=root).json()}
    department = {"name": "Limit Check", "code": "LIMITS",
                  "categories": [{"name": "Broken bench", "default_priority_id": priorities["Low"]}]}
    # too long is refused (it used to be cut short without a word)
    for changes in ({"description": "x" * (limits["department_description"] + 1)},
                    {"code": "P" * (limits["department_code"] + 1)},
                    {"name": "x" * (limits["department_name"] + 1)}):
        response = client.post("/departments/", headers=root, json={**department, **changes})
        field = next(iter(changes))
        assert response.status_code == 400 and str(limits[f"department_{field}"]) in response.json()["detail"], response.text
    exact = client.post("/departments/", headers=root,
                        json={**department, "description": "x" * limits["department_description"]})
    assert exact.status_code == 201, exact.text


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------

def test_attachment_count_and_size_limits(client, login, end_user_login):
    root = login(SUPER_ADMIN)
    end_user = end_user_login()
    cid = file_complaint(client, end_user, title="Many photos")
    url = f"/portal/complaints/{cid}/comments"
    five = [("files", (f"p{i}.jpg", JPEG, "image/jpeg")) for i in range(5)]
    assert client.post(url, headers=end_user, data={"body": "Photos"}, files=five).status_code == 201
    sixth = client.post(url, headers=end_user, data={"body": "One more"},
                        files={"files": ("p6.jpg", JPEG, "image/jpeg")})
    assert sixth.status_code == 400 and "at most 5" in sixth.json()["detail"]

    form = settings_form(client, root)
    assert client.put("/settings/", headers=root, json={**form, "max_attachment_mb": 1}).status_code == 200
    try:
        other = file_complaint(client, end_user, title="Big photo")
        big = JPEG + b"0" * (1024 * 1024)
        too_big = client.post(f"/portal/complaints/{other}/comments", headers=end_user, data={"body": "Big"},
                              files={"files": ("big.jpg", big, "image/jpeg")})
        assert too_big.status_code == 400 and "larger than 1 MB" in too_big.json()["detail"]
        empty = client.post(f"/portal/complaints/{other}/comments", headers=end_user, data={"body": "Empty"},
                            files={"files": ("empty.jpg", b"", "image/jpeg")})
        assert empty.status_code == 400
    finally:
        client.put("/settings/", headers=root, json=form)
    # nothing was left behind by the refused uploads
    assert len(client.get(f"/portal/complaints/{other}", headers=end_user).json()["attachments"]) == 0


def test_attachment_previews_can_be_framed_by_the_apps_only(client, end_user_login):
    end_user = end_user_login()
    cid = file_complaint(client, end_user, title="Documents")
    long_name = "x" * 300 + ".PDF"
    files = [("files", (long_name, b"%PDF-1.4\n%%EOF\n", "application/pdf")),
             ("files", ("photo.jpg", JPEG, "image/jpeg"))]
    reply = client.post(f"/portal/complaints/{cid}/comments", headers=end_user, data={"body": "Papers"}, files=files)
    assert reply.status_code == 201, reply.text
    pdf, photo = reply.json()["comments"][-1]["attachments"]
    assert len(pdf["file_name"]) == 200 and pdf["file_name"].endswith(".pdf")  # shortened, extension kept

    frame_ancestors = "frame-ancestors http://admin.test http://portal.test"
    pdf_response = client.get(pdf["url"])
    assert pdf_response.headers["content-security-policy"] == frame_ancestors  # no sandbox: PDF viewers need scripts
    assert "x-frame-options" not in pdf_response.headers
    photo_response = client.get(photo["url"])
    assert photo_response.headers["content-security-policy"] == f"sandbox; {frame_ancestors}"
    assert client.get("/health/").headers["x-frame-options"] == "DENY"


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

def test_dashboard_changes_say_which_way_is_good(client, login):
    stats = client.get("/complaints/admin/stats", headers=login(SUPER_ADMIN)).json()
    metrics = stats["metrics"]
    for key in ("total_change", "open_change", "in_progress_change", "resolved_change", "rejected_change"):
        change = metrics[key]
        if change is None:
            continue
        assert change["direction"] in ("up", "down", "flat")
        assert change["sentiment"] in ("good", "bad", "neutral")
        assert (change["percent"] > 0) == (change["direction"] == "up")
    if metrics["open_change"] and metrics["open_change"]["direction"] == "up":
        assert metrics["open_change"]["sentiment"] == "bad"
    assert metrics["total_change"] is None or metrics["total_change"]["sentiment"] == "neutral"
    assert len(stats["trend"]) == 7
    assert sum(s["count"] for s in stats["by_status"]) == metrics["total"]


def test_change_helper():
    from services.complaint_service import _change

    assert _change(10, 0, "down") is None
    assert _change(15, 10, "down") == {"percent": 50, "direction": "up", "sentiment": "bad"}
    assert _change(5, 10, "down") == {"percent": -50, "direction": "down", "sentiment": "good"}
    assert _change(10, 10, "up") == {"percent": 0, "direction": "flat", "sentiment": "neutral"}
    assert _change(20, 10, "neutral")["sentiment"] == "neutral"


def test_agent_dashboard_counts_only_their_scope(client, login):
    agent = client.get("/complaints/admin/stats", headers=login(ELEC_AGENT)).json()
    everything = client.get("/complaints/admin/stats", headers=login(SUPER_ADMIN)).json()
    assert 0 < agent["metrics"]["total"] < everything["metrics"]["total"]
    # cards the agent can't act on are left out rather than shown as zero
    assert agent["pending_summary"]["total_users"] is None and agent["pending_summary"]["pending_resets"] is None


def test_search_wildcards_are_literal(client, login):
    root = login(SUPER_ADMIN)
    assert client.get("/users/", params={"search": "%"}, headers=root).json()["total"] == 0
    assert client.get("/end-users/", params={"search": "_"}, headers=root).json()["total"] == 0
    assert client.get("/complaints/", params={"search": "%"}, headers=root).json()["total"] == 0
    assert client.get("/users/", params={"search": "PRIYA"}, headers=root).json()["total"] == 1


def test_department_open_counts_follow_scope(client, login):
    def counts(identifier):
        return {d["name"]: d["open_complaints"] for d in client.get("/departments/", headers=login(identifier)).json()}

    everywhere, jaipur_electricity = counts(SUPER_ADMIN), counts(ELEC_MANAGER)
    assert everywhere["Water"] > 0 and jaipur_electricity["Water"] == 0
    assert 0 < jaipur_electricity["Electricity"] < everywhere["Electricity"]


def test_saving_settings_keeps_the_advancing_complaint_number(client, login, end_user_login):
    root = login(SUPER_ADMIN)
    loaded = client.get("/settings/", headers=root).json()["complaint_next_number"]
    cid = file_complaint(client, end_user_login(), title="Filed while the form was open")
    saved = client.put("/settings/", headers=root, json=settings_form(client, root, support_hours="Always"))
    assert saved.status_code == 200, saved.text
    assert saved.json()["complaint_next_number"] == int(cid.rsplit("-", 1)[1]) + 1 > loaded
    client.put("/settings/", headers=root, json=settings_form(client, root, support_hours=SETTINGS["support_hours"]))


def test_audit_dates_must_be_realistic(client, login):
    root = login(SUPER_ADMIN)
    assert client.get("/audit-logs/", headers=root, params={"date_from": "0001-01-01"}).status_code == 400
    assert client.get("/audit-logs/", headers=root, params={"date_to": "9999-12-31"}).status_code == 400


def test_location_level_keys_cannot_reuse_import_columns(client, login):
    root = login(SUPER_ADMIN)
    for key in ("name", "email", "user_id"):
        refused = client.post("/locations/types", headers=root, json={"key": key, "name": f"Level {key}"})
        assert refused.status_code == 400 and "end-user import" in refused.json()["detail"]


def test_check_identifier_flow(client, login):
    # Empty or whitespace returns not_found
    res = client.post("/public/auth/check-identifier", json={"identifier": ""})
    assert res.status_code == 200
    assert res.json() == {"status": "not_found", "method": None, "role": None}

    # Unknown identifier returns not_found
    res = client.post("/public/auth/check-identifier", json={"identifier": "nonexistent@user.test"})
    assert res.status_code == 200
    assert res.json() == {"status": "not_found", "method": None, "role": None}

    # Staff user returns found, staff, password
    res = client.post("/public/auth/check-identifier", json={"identifier": SUPER_ADMIN})
    assert res.status_code == 200
    assert res.json() == {"status": "found", "method": "password", "role": "staff"}

    # End user by mobile returns found, end_user, otp, sms
    res = client.post("/public/auth/check-identifier", json={"identifier": "9876543210"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "found" and data["role"] == "end_user" and data["method"] == "otp"
    assert data.get("channel") == "sms"


