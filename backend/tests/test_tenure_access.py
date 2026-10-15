from datetime import date, timedelta
import uuid
from conftest import ADMIN, SUPER_ADMIN, first_login, staff_login
from database import SessionLocal
from factories import PASSWORD, email
from models import EndUser, User


def _get_scope(client, headers):
    departments = client.get("/departments/", headers=headers).json()
    dep_id = departments[0]["id"] if departments else None
    nodes = client.get("/locations/nodes", headers=headers).json()
    loc_id = nodes[0]["id"] if nodes else None
    return {"department_id": dep_id, "location_id": loc_id}


def test_tenure_validation_end_date_before_join_date(client, login):
    """Creating a staff user with end_date < join_date must be rejected with 400."""
    today = date.today()
    admin_headers = login(ADMIN)
    roles = client.get("/users/assignable-roles", headers=admin_headers).json()
    role_id = roles[0]["id"]
    uid = uuid.uuid4().hex[:8]
    scope = _get_scope(client, admin_headers)

    res = client.post(
        "/users/",
        json={
            "name": "Invalid Tenure User",
            "email": email(f"invalid.{uid}"),
            "role_id": role_id,
            "password": PASSWORD,
            "scopes": [scope],
            "join_date": today.isoformat(),
            "end_date": (today - timedelta(days=1)).isoformat(),
        },
        headers=admin_headers,
    )
    assert res.status_code == 400
    assert "End date cannot be earlier than join date" in res.text


def test_tenure_active_staff_can_login_and_access(client, login):
    """Staff user within active tenure period can log in and call APIs."""
    today = date.today()
    admin_headers = login(ADMIN)
    roles = client.get("/users/assignable-roles", headers=admin_headers).json()
    role_id = roles[0]["id"]
    uid = uuid.uuid4().hex[:8]
    user_email = email(f"active.{uid}")
    new_password = "NewPassword123!"
    scope = _get_scope(client, admin_headers)

    create_res = client.post(
        "/users/",
        json={
            "name": "Active Tenure Staff",
            "email": user_email,
            "role_id": role_id,
            "password": PASSWORD,
            "scopes": [scope],
            "join_date": (today - timedelta(days=10)).isoformat(),
            "end_date": (today + timedelta(days=30)).isoformat(),
        },
        headers=admin_headers,
    )
    assert create_res.status_code == 201, create_res.text
    user_data = create_res.json()
    assert user_data["tenure_status"] == "active"
    assert user_data["join_date"] == (today - timedelta(days=10)).isoformat()
    assert user_data["end_date"] == (today + timedelta(days=30)).isoformat()

    # Sign in and change password on first login
    headers = first_login(client, user_email, PASSWORD, new_password)
    me_res = client.get("/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["name"] == "Active Tenure Staff"
    assert me_res.json()["tenure_status"] == "active"


def test_tenure_pending_staff_blocked(client, login):
    """Staff user with future join_date is blocked at login with 403."""
    today = date.today()
    admin_headers = login(ADMIN)
    roles = client.get("/users/assignable-roles", headers=admin_headers).json()
    role_id = roles[0]["id"]
    uid = uuid.uuid4().hex[:8]
    user_email = email(f"future.{uid}")
    scope = _get_scope(client, admin_headers)

    create_res = client.post(
        "/users/",
        json={
            "name": "Future Staff",
            "email": user_email,
            "role_id": role_id,
            "password": PASSWORD,
            "scopes": [scope],
            "join_date": (today + timedelta(days=5)).isoformat(),
            "end_date": (today + timedelta(days=60)).isoformat(),
        },
        headers=admin_headers,
    )
    assert create_res.status_code == 201
    assert create_res.json()["tenure_status"] == "pending"

    # Attempt sign in
    login_res = client.post(
        "/auth/login",
        json={"identifier": user_email, "password": PASSWORD},
    )
    assert login_res.status_code == 403
    assert "scheduled to begin on" in login_res.json()["detail"].lower()


def test_tenure_expired_staff_blocked_and_unblocked_on_extension(client, login):
    """Staff user whose end_date has passed is blocked; extending end_date immediately restores access."""
    today = date.today()
    admin_headers = login(ADMIN)
    roles = client.get("/users/assignable-roles", headers=admin_headers).json()
    role_id = roles[0]["id"]
    uid = uuid.uuid4().hex[:8]
    user_email = email(f"expiring.{uid}")
    new_password = "NewPassword123!"
    scope = _get_scope(client, admin_headers)

    # Create active user first
    create_res = client.post(
        "/users/",
        json={
            "name": "Expiring Staff",
            "email": user_email,
            "role_id": role_id,
            "password": PASSWORD,
            "scopes": [scope],
            "join_date": (today - timedelta(days=10)).isoformat(),
            "end_date": (today + timedelta(days=1)).isoformat(),
        },
        headers=admin_headers,
    )
    assert create_res.status_code == 201
    user_id = create_res.json()["id"]

    # Login and obtain token
    headers = first_login(client, user_email, PASSWORD, new_password)
    assert client.get("/auth/me", headers=headers).status_code == 200

    # Simulate tenure expiry by updating end_date to yesterday in database
    with SessionLocal() as db:
        user = db.get(User, user_id)
        user.end_date = today - timedelta(days=1)
        db.commit()

    # Active token should now be rejected by auth middleware on next request
    me_after_expiry = client.get("/auth/me", headers=headers)
    assert me_after_expiry.status_code in (401, 403)
    assert "expired" in me_after_expiry.json()["detail"].lower()

    # Login should also be rejected
    login_attempt = client.post(
        "/auth/login",
        json={"identifier": user_email, "password": new_password},
    )
    assert login_attempt.status_code == 403
    assert "expired" in login_attempt.json()["detail"].lower()

    # Admin updates end_date to future date via PATCH /users/{id}
    patch_res = client.patch(
        f"/users/{user_id}",
        json={"end_date": (today + timedelta(days=90)).isoformat()},
        headers=admin_headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["tenure_status"] == "active"
    assert patch_res.json()["end_date"] == (today + timedelta(days=90)).isoformat()

    # User can now login immediately without manual activation toggle!
    new_headers = staff_login(client, user_email, new_password)
    me_restored = client.get("/auth/me", headers=new_headers)
    assert me_restored.status_code == 200
    assert me_restored.json()["name"] == "Expiring Staff"


def test_tenure_clear_end_date_makes_permanent(client, login):
    """Admin clearing end_date via clear_end_date makes user permanent."""
    today = date.today()
    admin_headers = login(ADMIN)
    roles = client.get("/users/assignable-roles", headers=admin_headers).json()
    role_id = roles[0]["id"]
    uid = uuid.uuid4().hex[:8]
    user_email = email(f"perm.{uid}")
    scope = _get_scope(client, admin_headers)

    create_res = client.post(
        "/users/",
        json={
            "name": "Temporary To Permanent",
            "email": user_email,
            "role_id": role_id,
            "password": PASSWORD,
            "scopes": [scope],
            "join_date": today.isoformat(),
            "end_date": (today + timedelta(days=5)).isoformat(),
        },
        headers=admin_headers,
    )
    assert create_res.status_code == 201
    user_id = create_res.json()["id"]
    assert create_res.json()["end_date"] is not None

    patch_res = client.patch(
        f"/users/{user_id}",
        json={"clear_end_date": True},
        headers=admin_headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["end_date"] is None
    assert patch_res.json()["tenure_status"] == "active"


def test_end_user_tenure_access_and_expiry(client, login):
    """EndUser respects tenure dates; expired end users are blocked from portal OTP and APIs."""
    today = date.today()
    admin_headers = login(ADMIN)
    uid = uuid.uuid4().hex[:8]
    e_email = email(f"portal.{uid}")
    e_mobile = f"98{int(uuid.uuid4().int % 100000000):08d}"

    create_res = client.post(
        "/end-users/",
        json={
            "name": "Portal Citizen",
            "email": e_email,
            "mobile": e_mobile,
            "aadhar": "123456789012",
            "pan_card": "ABCDE1234F",
            "join_date": (today - timedelta(days=5)).isoformat(),
            "end_date": (today + timedelta(days=10)).isoformat(),
        },
        headers=admin_headers,
    )
    assert create_res.status_code == 201
    end_user_id = create_res.json()["id"]
    assert create_res.json()["tenure_status"] == "active"

    # Request OTP with exposed dev otp
    otp_res = client.post("/portal/auth/request-otp", json={"channel": "sms", "identifier": e_mobile})
    assert otp_res.status_code == 200
    body = otp_res.json()
    challenge_id = body["challenge_id"]
    dev_otp = body["dev_otp"]

    session_res = client.post(
        "/portal/auth/verify-otp",
        json={"challenge_id": challenge_id, "otp": dev_otp},
    )
    assert session_res.status_code == 200
    data = session_res.json()
    if "selection_token" in data:
        chosen = client.post(
            "/portal/auth/select-account",
            json={"selection_token": data["selection_token"], "end_user_id": end_user_id},
        )
        assert chosen.status_code == 200
        access_token = chosen.json()["access_token"]
    else:
        access_token = data["access_token"]

    portal_headers = {"Authorization": f"Bearer {access_token}", "X-Requested-With": "cms"}

    # Portal profile check via GET /portal/me
    profile_res = client.get("/portal/me", headers=portal_headers)
    assert profile_res.status_code == 200
    profile_data = profile_res.json()
    assert profile_data["join_date"] == (today - timedelta(days=5)).isoformat()
    assert profile_data["end_date"] == (today + timedelta(days=10)).isoformat()
    assert profile_data["tenure_status"] == "active"

    # Now expire the end user in the DB
    with SessionLocal() as db:
        end_user = db.get(EndUser, end_user_id)
        end_user.end_date = today - timedelta(days=1)
        db.commit()

    # Portal API call should now be blocked with 401
    blocked_profile = client.get("/portal/me", headers=portal_headers)
    assert blocked_profile.status_code in (401, 403)
    assert "expired" in blocked_profile.json()["detail"].lower()
