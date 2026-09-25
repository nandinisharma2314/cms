"""SLA clocks, warnings, breaches, the escalation chain and notifications."""
from datetime import datetime, timedelta

from conftest import ADMIN, ELEC_AGENT, ELEC_MANAGER, ELEC_SUPERVISOR, SUPER_ADMIN
from database import SessionLocal
from models import Complaint, EndUser, User
from services import sla_service, workflow_service
from services.access_service import AccessContext
from test_workflow import act, departments, detail, file_complaint, location_id


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
    return client.get("/portal/notifications" if portal else "/notifications/", headers=headers).json()


def test_new_complaint_gets_default_targets(client, login, citizen_login):
    cid = file_complaint(client, citizen_login(), title="SLA defaults")
    d = detail(client, login(ELEC_AGENT), cid)
    assigned = parse(d["assigned_at"])
    assert parse(d["sla_due"]["response_due_at"]) == assigned + timedelta(hours=24)
    assert parse(d["sla_due"]["resolution_due_at"]) == parse(d["created_at"]) + timedelta(hours=72)  # High
    assert d["sla"] == {"response": "on_track", "resolution": "on_track"}

    citizen_view = client.get(f"/portal/complaints/{cid}", headers=citizen_login()).json()
    assert citizen_view["response_due_at"] and citizen_view["resolution_due_at"]
    assert "sla" not in citizen_view  # breach details stay internal


def test_department_override_applies_to_new_complaints(client, login, citizen_login):
    root, citizen = login(SUPER_ADMIN), citizen_login()
    electricity = departments(client, citizen)["Electricity"]["id"]
    rule = client.put("/sla/rules", headers=root, json={
        "priority": "High", "department_id": electricity, "response_hours": 4, "resolution_hours": 12,
        "warning_minutes": 30,
    })
    assert rule.status_code == 200, rule.text
    try:
        d = detail(client, login(ELEC_AGENT), file_complaint(client, citizen, title="SLA override"))
        assert parse(d["sla_due"]["response_due_at"]) == parse(d["assigned_at"]) + timedelta(hours=4)
    finally:
        client.delete(f"/sla/rules/{rule.json()['id']}", headers=root)


def test_warning_breach_and_escalation_up_the_reporting_line(client, login, citizen_login):
    citizen = citizen_login()
    cid = file_complaint(client, citizen, title="Nobody picked this up")
    agent = login(ELEC_AGENT)
    due = parse(detail(client, agent, cid)["sla_due"]["response_due_at"])

    assert check(cid, due - timedelta(minutes=30)) == ["response_warning"]
    assert any(cid in n["title"] and "due soon" in n["title"] for n in notifications(client, agent)["items"])

    assert check(cid, due + timedelta(minutes=1)) == ["response_breach"]
    supervisor = login(ELEC_SUPERVISOR)
    d = detail(client, supervisor, cid)
    assert d["escalation"]["to"]["name"] == "Priya Patel" and d["escalation"]["level"] == 1
    assert d["sla"]["response"] == "breached"
    assert cid in {c["id"] for c in client.get("/complaints/", params={"escalated": "me"}, headers=supervisor).json()}
    assert cid in {c["id"] for c in client.get("/complaints/", params={"sla": "breached"}, headers=supervisor).json()}
    assert any(n["kind"] == "complaint.escalated" and cid in n["title"] for n in notifications(client, supervisor)["items"])
    # the manager above the supervisor hears about the breach
    assert any(n["kind"] == "sla.breached" and cid in n["title"] for n in notifications(client, login(ELEC_MANAGER))["items"])
    # the citizen sees that it was escalated, not to whom
    citizen_timeline = client.get(f"/portal/complaints/{cid}", headers=citizen).json()["timeline"]
    assert any("senior officer" in e["message"] for e in citizen_timeline)

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

    # responding deals with the breach and ends the escalation
    acknowledged = act(client, agent, cid, "acknowledge").json()
    assert acknowledged["escalation"] is None
    assert all(e["resolved_at"] for e in acknowledged["escalations"]) and len(acknowledged["escalations"]) == 4
    assert acknowledged["sla"]["response"] == "met_late"


def test_unassigned_complaint_escalates_to_the_nearest_supervisor_in_scope(client, login):
    admin = login(ADMIN)
    education = next(d["id"] for d in client.get("/departments/", headers=admin).json() if d["name"] == "Education")
    mansarovar = location_id(client, admin, "India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar", portal=False)
    cid = client.post("/complaints/quick-create", headers=admin, json={
        "title": "School wall collapsed", "department_id": education, "location_id": mansarovar,
    }).json()["id"]
    due = parse(detail(client, admin, cid)["sla_due"]["response_due_at"])
    check(cid, due + timedelta(minutes=5))
    # nobody in Education covers Mansarovar below the admin
    assert detail(client, admin, cid)["escalation"]["to"]["name"] == "Ananya Verma"


def test_reassignment_restarts_the_response_clock(client, login, citizen_login):
    cid = file_complaint(client, citizen_login(), title="Stuck with one agent")
    supervisor = login(ELEC_SUPERVISOR)
    due = parse(detail(client, supervisor, cid)["sla_due"]["response_due_at"])
    check(cid, due + timedelta(minutes=1))
    assert detail(client, supervisor, cid)["escalation"]["to"]["name"] == "Priya Patel"

    rohit = next(o for o in client.get(f"/complaints/{cid}/assignee-options", headers=supervisor).json()
                 if o["name"] == "Rohit Jain")
    moved = client.post(f"/complaints/{cid}/assign", headers=supervisor, json={"assignee_id": rohit["id"]}).json()
    assert moved["escalation"] is None
    assert moved["sla"]["response"] == "on_track"
    assert parse(moved["sla_due"]["response_due_at"]) == parse(moved["assigned_at"]) + timedelta(hours=24)


def test_resolution_clock_pauses_while_waiting_for_the_citizen(client, citizen_login):
    cid = file_complaint(client, citizen_login(), title="Pause the clock")
    with SessionLocal() as db:
        complaint = db.query(Complaint).filter(Complaint.generated_id == cid).one()
        agent = AccessContext(db, db.query(User).filter(User.email == ELEC_AGENT).one())
        citizen = db.query(EndUser).filter(EndUser.external_id == "USR001").one()
        start = complaint.created_at + timedelta(hours=1)
        workflow_service.apply_staff_action(agent, complaint, "start", None, at=start)
        due_before = complaint.resolution_due_at
        workflow_service.apply_staff_action(agent, complaint, "request_info", "Photo please?", at=start + timedelta(hours=1))
        assert complaint.sla_paused_at is not None
        assert sla_service.check_complaint(db, complaint, due_before + timedelta(hours=1)) == []  # paused: no breach
        workflow_service.add_comment(db, complaint, citizen, "Here it is", at=start + timedelta(hours=11))
        assert complaint.status == "IN_PROGRESS" and complaint.sla_paused_at is None
        assert complaint.resolution_due_at == due_before + timedelta(hours=10)
        db.commit()


def test_notifications_reach_citizens_and_can_be_marked_read(client, login, citizen_login):
    citizen, agent = citizen_login(), login(ELEC_AGENT)
    cid = file_complaint(client, citizen, title="Notify me")
    act(client, agent, cid, "acknowledge")
    act(client, agent, cid, "request_info", "Which lane exactly?")

    inbox = notifications(client, citizen, portal=True)
    mine = [n for n in inbox["items"] if n["complaint_id"] == cid]
    assert any("waiting for information" in n["title"] and "Which lane" in n["body"] for n in mine)
    unread = inbox["unread_count"]
    client.post(f"/portal/notifications/{mine[0]['id']}/read", headers=citizen)
    assert notifications(client, citizen, portal=True)["unread_count"] == unread - 1

    # the citizen's reply notifies the handler
    client.post(f"/portal/complaints/{cid}/comments", headers=citizen, data={"body": "Lane 4"})
    assert any(n["title"] == f"Citizen replied on {cid}" for n in notifications(client, agent)["items"])
    client.post("/notifications/read-all", headers=agent)
    assert notifications(client, agent)["unread_count"] == 0


def test_sla_configuration_is_super_admin_only(client, login):
    assert client.get("/sla/config", headers=login(ELEC_MANAGER)).status_code == 403
    root = login(SUPER_ADMIN)
    config = client.get("/sla/config", headers=root).json()
    assert {r["priority"] for r in config["sla_rules"] if r["department"] is None} == {"Low", "Medium", "High", "Critical"}
    assert all(r["response_hours"] == 24 for r in config["sla_rules"] if r["department"] is None)
    assert client.put("/sla/rules", headers=root, json={
        "priority": "Urgent", "response_hours": 1, "resolution_hours": 2,
    }).status_code == 400
    assert client.put("/sla/rules", headers=root, json={
        "priority": "Low", "response_hours": 48, "resolution_hours": 24,
    }).status_code == 400  # response longer than resolution
    stats = client.get("/complaints/admin/stats", headers=root).json()
    assert {"sla_breached", "sla_at_risk", "escalated"} <= set(stats["metrics"])
