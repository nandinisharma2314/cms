"""SLA clocks, warnings, breaches, the escalation chain, notifications and the background worker."""
from datetime import datetime, timedelta

from conftest import ADMIN, ELEC_AGENT, ELEC_MANAGER, ELEC_SUPERVISOR, SUPER_ADMIN
from database import SessionLocal
from models import DELIVERY_FAILED, DELIVERY_PENDING, Complaint, EndUser, MessageDelivery, SystemSettings, User
from services import notification_service, sla_service, worker_service, workflow_service
from services.access_service import AccessContext
from test_workflow import act, category_id, departments, detail, file_complaint, items, location_id


def parse(iso: str) -> datetime:
    return datetime.fromisoformat(iso)


def check(complaint_id: str, now: datetime) -> list[str]:
    """Runs the periodic SLA check for one complaint at a simulated time."""
    with SessionLocal() as db:
        complaint = db.query(Complaint).filter(Complaint.generated_id == complaint_id).one()
        happened = sla_service.check_complaint(db, complaint, now)
        db.commit()
        return happened


def notifications(client, headers, portal=False):
    response = client.get("/portal/notifications" if portal else "/notifications/", headers=headers,
                          params={"page_size": 100})
    assert response.status_code == 200, response.text
    return response.json()


def priority_id(client, headers, name):
    return next(p["id"] for p in client.get("/priorities/", headers=headers).json() if p["name"] == name)


def test_new_complaint_gets_the_category_priority_targets(client, login, end_user_login):
    cid = file_complaint(client, end_user_login(), title="SLA defaults")  # Street Light -> High
    d = detail(client, login(ELEC_AGENT), cid)
    assert d["priority"]["name"] == "High"
    assigned = parse(d["assigned_at"])
    assert parse(d["sla_due"]["response_due_at"]) == assigned + timedelta(hours=24)
    assert parse(d["sla_due"]["resolution_due_at"]) == parse(d["created_at"]) + timedelta(hours=72)
    assert d["sla"] == {"response": "on_track", "resolution": "on_track"}

    end_user_view = client.get(f"/portal/complaints/{cid}", headers=end_user_login()).json()
    assert end_user_view["response_due_at"] and end_user_view["resolution_due_at"]
    assert "sla" not in end_user_view  # breach details stay internal


def test_department_override_applies_to_new_complaints(client, login, end_user_login):
    root, end_user = login(SUPER_ADMIN), end_user_login()
    electricity = departments(client, end_user)["Electricity"]["id"]
    rule = client.put("/sla/rules", headers=root, json={
        "priority_id": priority_id(client, root, "High"), "department_id": electricity,
        "response_hours": 4, "resolution_hours": 12, "warning_minutes": 30,
    })
    assert rule.status_code == 200, rule.text
    try:
        d = detail(client, login(ELEC_AGENT), file_complaint(client, end_user, title="SLA override"))
        assert parse(d["sla_due"]["response_due_at"]) == parse(d["assigned_at"]) + timedelta(hours=4)
    finally:
        assert client.delete(f"/sla/rules/{rule.json()['id']}", headers=root).status_code == 200


def test_warning_breach_and_escalation_up_the_reporting_line(client, login, end_user_login):
    end_user = end_user_login()
    cid = file_complaint(client, end_user, title="Nobody picked this up")
    agent = login(ELEC_AGENT)
    due = parse(detail(client, agent, cid)["sla_due"]["response_due_at"])

    assert check(cid, due - timedelta(minutes=30)) == ["response_warning"]
    assert any(cid in n["title"] and "due soon" in n["title"] for n in notifications(client, agent)["items"])

    assert check(cid, due + timedelta(minutes=1)) == ["response_breach"]
    supervisor = login(ELEC_SUPERVISOR)
    d = detail(client, supervisor, cid)
    assert d["escalation"]["to"]["name"] == "Priya Patel" and d["escalation"]["level"] == 1
    assert d["sla"]["response"] == "breached"
    escalated = items(client.get("/complaints/", params={"escalated": "me", "page_size": 100}, headers=supervisor))
    assert cid in {c["id"] for c in escalated}
    breached = items(client.get("/complaints/", params={"sla": "breached", "page_size": 100}, headers=supervisor))
    assert cid in {c["id"] for c in breached}
    assert any(n["kind"] == "complaint.escalated" and cid in n["title"]
               for n in notifications(client, supervisor)["items"])
    # the manager above the supervisor hears about the breach
    assert any(n["kind"] == "sla.breached" and cid in n["title"]
               for n in notifications(client, login(ELEC_MANAGER))["items"])
    # the end user sees that it was escalated, not to whom
    end_user_timeline = client.get(f"/portal/complaints/{cid}", headers=end_user).json()["timeline"]
    assert any(e["message"] == "Escalated for priority handling" for e in end_user_timeline)

    # each level gets 24h before it climbs: supervisor -> manager -> admin -> super admin, then stops
    chain = []
    for hours in (25, 49, 73):
        # (the 72h resolution target also passes along the way; it is recorded but
        # does not start a second escalation while the response one is running)
        assert "response_escalation" in check(cid, due + timedelta(hours=hours))
        chain.append(detail(client, login(SUPER_ADMIN), cid)["escalation"]["to"]["name"])
    assert chain == ["Vikram Rathore", "Ananya Verma", "Rahul Sharma"]
    assert check(cid, due + timedelta(hours=97)) == ["response_escalation"]
    d = detail(client, login(SUPER_ADMIN), cid)
    assert d["escalation"]["level"] == 4 and d["escalation"]["next_at"] is None
    assert d["timeline"][-1]["type"] == "escalation_stopped"
    assert check(cid, due + timedelta(hours=200)) == []  # nothing further, no repeated entries
    # escalations are audited as system actions
    log = items(client.get("/audit-logs/", params={"action": "complaint.escalate", "entity_id": cid},
                           headers=login(SUPER_ADMIN)))
    assert len(log) == 4 and all(e["actor_type"] == "system" for e in log)

    # responding deals with the breach and ends the escalation
    acknowledged = act(client, agent, cid, "acknowledge").json()
    assert acknowledged["escalation"] is None
    assert all(e["resolved_at"] for e in acknowledged["escalations"]) and len(acknowledged["escalations"]) == 4
    assert acknowledged["sla"]["response"] == "met_late"


def test_unassigned_complaint_escalates_to_the_nearest_supervisor_in_scope(client, login):
    admin = login(ADMIN)
    education, category = category_id(client, admin, "Education", "School Infrastructure")
    mansarovar = location_id(client, admin, "India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar", portal=False)
    created = client.post("/complaints/quick-create", headers=admin, json={
        "title": "School wall collapsed", "description": "The side wall fell overnight",
        "department_id": education, "category_id": category, "location_id": mansarovar,
        "end_user_name": "Walk-in visitor",
    })
    assert created.status_code == 201, created.text
    cid = created.json()["id"]
    d = detail(client, admin, cid)
    assert d["priority"]["name"] == "Medium" and d["assignee"] is None  # nobody in Education covers it
    check(cid, parse(d["sla_due"]["response_due_at"]) + timedelta(minutes=5))
    # nobody in Education covers Mansarovar below the admin
    assert detail(client, admin, cid)["escalation"]["to"]["name"] == "Ananya Verma"


def test_reassigning_before_the_target_gives_a_fresh_window(client, login, end_user_login):
    cid = file_complaint(client, end_user_login(), title="Handed over early")
    supervisor = login(ELEC_SUPERVISOR)
    rohit = next(o for o in client.get(f"/complaints/{cid}/assignee-options", headers=supervisor).json()
                 if o["name"] == "Rohit Jain")
    moved = client.post(f"/complaints/{cid}/assign", headers=supervisor, json={"assignee_id": rohit["id"]}).json()
    assert moved["assignee"]["name"] == "Rohit Jain" and moved["sla"]["response"] == "on_track"
    assert parse(moved["sla_due"]["response_due_at"]) == parse(moved["assigned_at"]) + timedelta(hours=24)


def test_reassigning_after_a_breach_does_not_hide_it(client, login, end_user_login):
    cid = file_complaint(client, end_user_login(), title="Stuck with one agent")
    supervisor = login(ELEC_SUPERVISOR)
    due = parse(detail(client, supervisor, cid)["sla_due"]["response_due_at"])
    check(cid, due + timedelta(minutes=1))
    assert detail(client, supervisor, cid)["escalation"]["to"]["name"] == "Priya Patel"

    rohit = next(o for o in client.get(f"/complaints/{cid}/assignee-options", headers=supervisor).json()
                 if o["name"] == "Rohit Jain")
    moved = client.post(f"/complaints/{cid}/assign", headers=supervisor, json={"assignee_id": rohit["id"]}).json()
    # the missed target stays missed and the escalation keeps running until someone responds
    assert moved["sla"]["response"] == "breached"
    assert parse(moved["sla_due"]["response_due_at"]) == due
    assert moved["escalation"]["to"]["name"] == "Priya Patel"
    responded = act(client, login("city.agent@example.test"), cid, "acknowledge").json()
    assert responded["escalation"] is None and responded["sla"]["response"] == "met_late"


def test_reclassifying_shifts_the_running_clocks(client, login, end_user_login):
    cid = file_complaint(client, end_user_login(), title="Actually a fallen pole")
    supervisor = login(ELEC_SUPERVISOR)
    before = detail(client, supervisor, cid)
    electricity, fallen = category_id(client, login(SUPER_ADMIN), "Electricity", "Fallen Pole")
    changed = client.post(f"/complaints/{cid}/reclassify", headers=supervisor, json={
        "department_id": electricity, "category_id": fallen, "location_id": before["location_detail"]["id"],
        "priority_id": priority_id(client, supervisor, "Critical"), "reason": "Photo shows the pole is down",
    })
    assert changed.status_code == 200, changed.text
    after = changed.json()
    assert after["priority"]["name"] == "Critical"
    # High resolves in 72h, Critical in 24h: the due time moves 48h earlier
    assert parse(after["sla_due"]["resolution_due_at"]) == \
        parse(before["sla_due"]["resolution_due_at"]) - timedelta(hours=48)
    assert parse(after["sla_due"]["response_due_at"]) == parse(before["sla_due"]["response_due_at"])


def test_resolution_clock_pauses_while_waiting_for_the_end_user(client, end_user_login):
    cid = file_complaint(client, end_user_login(), title="Pause the clock")
    with SessionLocal() as db:
        complaint = db.query(Complaint).filter(Complaint.generated_id == cid).one()
        agent = AccessContext(db, db.query(User).filter(User.email == ELEC_AGENT).one())
        end_user = db.query(EndUser).filter(EndUser.external_id == "USR001").one()
        start = complaint.created_at + timedelta(hours=1)
        workflow_service.apply_staff_action(agent, complaint, "start", None, at=start)
        due_before = complaint.resolution_due_at
        workflow_service.apply_staff_action(agent, complaint, "request_info", "Photo please?",
                                            at=start + timedelta(hours=1))
        assert complaint.sla_paused_at is not None
        assert sla_service.check_complaint(db, complaint, due_before + timedelta(hours=1)) == []  # paused: no breach
        workflow_service.add_comment(db, complaint, end_user, "Here it is", at=start + timedelta(hours=11))
        assert complaint.status == "IN_PROGRESS" and complaint.sla_paused_at is None
        assert complaint.resolution_due_at == due_before + timedelta(hours=10)
        db.commit()


def test_notifications_reach_end_users_and_can_be_marked_read(client, login, end_user_login):
    end_user, agent = end_user_login(), login(ELEC_AGENT)
    cid = file_complaint(client, end_user, title="Notify me")
    act(client, agent, cid, "acknowledge")
    act(client, agent, cid, "request_info", "Which lane exactly?")

    inbox = notifications(client, end_user, portal=True)
    mine = [n for n in inbox["items"] if n["complaint_id"] == cid]
    assert any("waiting for information" in n["title"] and "Which lane" in n["body"] for n in mine)
    unread = inbox["unread_count"]
    client.post(f"/portal/notifications/{mine[0]['id']}/read", headers=end_user)
    assert notifications(client, end_user, portal=True)["unread_count"] == unread - 1

    # the end user's reply notifies the handler
    client.post(f"/portal/complaints/{cid}/comments", headers=end_user, data={"body": "Lane 4"})
    assert any(n["title"] == f"End user replied on {cid}" for n in notifications(client, agent)["items"])
    client.post("/notifications/read-all", headers=agent)
    assert notifications(client, agent)["unread_count"] == 0
    assert notifications(client, agent)["items"][0]["read_at"]


def test_messages_are_queued_per_channel_and_sent_by_the_worker(client, login, end_user_login, monkeypatch):
    from services import messaging

    sent = []
    monkeypatch.setattr(messaging, "send_sms", lambda to, body: sent.append(("sms", to)))
    monkeypatch.setattr(messaging, "send_email", lambda to, subject, body: sent.append(("email", to)))

    with SessionLocal() as db:
        settings = db.get(SystemSettings, 1)
        settings.sms_notifications_enabled = settings.email_notifications_enabled = True
        db.commit()
    try:
        end_user = end_user_login("9876543211")  # Amit, Malviya Nagar
        client.put("/portal/profile", headers=end_user, json={"notify_sms": True, "notify_email": False})
        cid = file_complaint(client, end_user, title="Tell me by SMS")
        act(client, login(CITY_AGENT_EMAIL), cid, "acknowledge")
        with SessionLocal() as db:
            queued = db.query(MessageDelivery).filter(MessageDelivery.status == DELIVERY_PENDING).all()
            assert queued and {d.channel for d in queued} == {"sms"}
        summary = worker_service.run_once()
        assert summary["messages_sent"] >= 1
        assert ("sms", "+919876543211") in sent and not any(channel == "email" for channel, _ in sent)

        # failures are retried with a delay, then given up
        def broken(to, body):
            raise messaging.MessageError("provider down")

        monkeypatch.setattr(messaging, "send_sms", broken)
        act(client, login(CITY_AGENT_EMAIL), cid, "start")
        with SessionLocal() as db:
            first = notification_service.deliver_due(db, 10)
            assert first["retrying"] == 1
            delivery = db.query(MessageDelivery).filter(MessageDelivery.status == DELIVERY_PENDING).one()
            assert delivery.attempts == 1 and delivery.last_error == "provider down"
            for _ in range(2):
                delivery.next_attempt_at = delivery.next_attempt_at - timedelta(days=1)
                db.commit()
                notification_service.deliver_due(db, 10)
            db.refresh(delivery)
            assert delivery.status == DELIVERY_FAILED and delivery.attempts == 3
    finally:
        with SessionLocal() as db:
            settings = db.get(SystemSettings, 1)
            settings.sms_notifications_enabled = settings.email_notifications_enabled = False
            db.commit()


CITY_AGENT_EMAIL = "city.agent@example.test"  # Rohit covers all of Jaipur city, including Malviya Nagar


def test_sla_run_uses_the_worker_lock(client, login):
    from sqlalchemy import text

    from database import engine

    root = login(SUPER_ADMIN)
    assert client.post("/sla/run", headers=login(ELEC_MANAGER)).status_code == 403
    ran = client.post("/sla/run", headers=root)
    assert ran.status_code == 200 and "checked" in ran.json()
    with engine.connect() as holder:
        assert holder.execute(text("SELECT GET_LOCK(:n, 0)"), {"n": worker_service.LOCK_NAME}).scalar() == 1
        try:
            assert client.post("/sla/run", headers=root).status_code == 409
            assert worker_service.run_once() == {"skipped": 1}
        finally:
            holder.execute(text("SELECT RELEASE_LOCK(:n)"), {"n": worker_service.LOCK_NAME})


def test_sla_configuration(client, login):
    assert client.get("/sla/config", headers=login(ELEC_MANAGER)).status_code == 403
    root = login(SUPER_ADMIN)
    config = client.get("/sla/config", headers=root).json()
    defaults = [r for r in config["sla_rules"] if r["department"] is None]
    assert {r["priority"]["name"] for r in defaults} == {"Low", "Medium", "High", "Critical"}
    assert all(r["response_hours"] == 24 for r in defaults)
    low = priority_id(client, root, "Low")
    assert client.put("/sla/rules", headers=root, json={
        "priority_id": 999999, "department_id": None, "response_hours": 1, "resolution_hours": 2, "warning_minutes": 0,
    }).status_code == 400
    assert client.put("/sla/rules", headers=root, json={
        "priority_id": low, "department_id": None, "response_hours": 48, "resolution_hours": 24, "warning_minutes": 0,
    }).status_code == 400  # response longer than resolution
    assert client.put("/sla/rules", headers=root, json={
        "priority_id": low, "department_id": None, "response_hours": 2, "resolution_hours": 24, "warning_minutes": 120,
    }).status_code == 400  # warning after the target
    default_rule = next(r for r in defaults if r["priority"]["name"] == "Low")
    assert client.delete(f"/sla/rules/{default_rule['id']}", headers=root).status_code == 400

    # escalation: defaults can't be switched off, overrides can be removed
    assert client.put("/sla/escalation-rules", headers=root, json={
        "breach_type": "response", "department_id": None, "level_hours": 24, "max_level": 4, "is_active": False,
    }).status_code == 400
    roads = next(d["id"] for d in client.get("/departments/", headers=root).json() if d["name"] == "Roads")
    override = client.put("/sla/escalation-rules", headers=root, json={
        "breach_type": "response", "department_id": roads, "level_hours": 12, "max_level": 2, "is_active": False,
    })
    assert override.status_code == 200 and override.json()["is_active"] is False
    assert client.delete(f"/sla/escalation-rules/{override.json()['id']}", headers=root).status_code == 200

    stats = client.get("/complaints/admin/stats", headers=root).json()
    assert {"sla_breached", "sla_at_risk", "escalated"} <= set(stats["metrics"])


def test_priorities_are_managed_with_their_sla_targets(client, login):
    root = login(SUPER_ADMIN)
    assert client.post("/priorities/", headers=login(ELEC_MANAGER), json={
        "key": "minor", "name": "Minor", "tone": "neutral", "response_hours": 48, "resolution_hours": 336,
        "warning_minutes": 60,
    }).status_code == 403
    bad = [
        {"key": "Minor!", "name": "Minor", "tone": "neutral"},
        {"key": "minor", "name": "Minor", "tone": "purple"},
        {"key": "high", "name": "Minor", "tone": "neutral"},
        {"key": "minor", "name": "high", "tone": "neutral"},
    ]
    for payload in bad:
        response = client.post("/priorities/", headers=root, json={
            **payload, "response_hours": 48, "resolution_hours": 336, "warning_minutes": 60,
        })
        assert response.status_code in (400, 409), payload
    created = client.post("/priorities/", headers=root, json={
        "key": "minor", "name": "Minor", "tone": "neutral", "response_hours": 48, "resolution_hours": 336,
        "warning_minutes": 60,
    })
    assert created.status_code == 201, created.text
    minor = created.json()
    listed = client.get("/priorities/", headers=login(ELEC_AGENT)).json()
    assert listed[-1]["id"] == minor["id"] and minor["rank"] == len(listed)
    rule = next(r for r in client.get("/sla/config", headers=root).json()["sla_rules"]
                if r["priority"]["id"] == minor["id"])
    assert (rule["department"], rule["response_hours"], rule["resolution_hours"]) == (None, 48, 336)

    order = [p["id"] for p in listed]
    moved = [minor["id"], *order[:-1]]
    assert [p["id"] for p in client.put("/priorities/order", headers=root, json={"ids": moved}).json()] == moved
    assert client.put("/priorities/order", headers=root, json={"ids": moved[1:]}).status_code == 400
    client.put("/priorities/order", headers=root, json={"ids": order})

    # a priority still used as a category default can't be retired
    high = priority_id(client, root, "High")
    assert client.patch(f"/priorities/{high}", headers=root, json={"is_active": False}).status_code == 409
    retired = client.patch(f"/priorities/{minor['id']}", headers=root, json={"is_active": False, "tone": "info"})
    assert retired.status_code == 200 and not retired.json()["is_active"]
    assert minor["id"] not in {p["id"] for p in client.get("/priorities/", headers=root).json()}


def test_a_failing_background_job_does_not_stop_the_others(client, monkeypatch):
    from services import token_service

    def broken(db):
        raise RuntimeError("boom")

    monkeypatch.setattr(token_service, "prune", broken)  # the job list is built on every run
    summary = worker_service.run_once()
    assert summary["failed_jobs"] == ["pruned_refresh_tokens"]
    assert "sla_checked" in summary and "pruned_otp_challenges" in summary and "cleared_import_rows" in summary
