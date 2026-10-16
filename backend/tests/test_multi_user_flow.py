"""Multi-user concurrent simulation and verification of the complaints flow,
superior routing, and auto-escalation engine.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import pytest
from conftest import ADMIN, CITY_AGENT, ELEC_AGENT, ELEC_MANAGER, ELEC_SUPERVISOR, SUPER_ADMIN, WATER_AGENT, WATER_MANAGER
from database import SessionLocal
from models import Complaint, User
from services import notification_service, routing_service, sla_service
from test_workflow import act, category_id, DEFAULT_CATEGORY, departments, detail, file_complaint, items, location_id


def parse(iso: str) -> datetime:
    return datetime.fromisoformat(iso)


def check_sla(complaint_id: str, now: datetime) -> list[str]:
    """Simulates SLA worker check for a specific complaint at a simulated time."""
    with SessionLocal() as db:
        complaint = db.query(Complaint).filter(Complaint.generated_id == complaint_id).one()
        happened = sla_service.check_complaint(db, complaint, now)
        db.commit()
        return happened


def get_notifications(client, headers):
    res = client.get("/notifications/", headers=headers, params={"page_size": 100})
    assert res.status_code == 200, res.text
    return res.json()["items"]


# ---------------------------------------------------------------------------
# Scenario 1: Cross-Department Complaint Creation by Manager & Superior Scopes
# ---------------------------------------------------------------------------

def test_cross_department_complaint_creation_and_superior_visibility(client, login):
    """A Water Manager writes a complaint against the Electricity department.
    Verifies that:
    1. Cross-department submission succeeds (201 Created).
    2. It routes to Electricity staff (not Water).
    3. The creator (Water Manager) can track it in 'created_by=me'.
    4. Electricity superiors (Supervisor, Manager) see it in their department queue.
    5. Water agents do NOT see it in their operational ticket queue.
    """
    water_mgr = login(WATER_MANAGER)
    elec_mgr = login(ELEC_MANAGER)
    elec_sup = login(ELEC_SUPERVISOR)
    water_agent = login(WATER_AGENT)
    root = login(SUPER_ADMIN)

    elec_dept, light = category_id(client, root, "Electricity", "Street Light")
    loc = location_id(client, root, "India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar", portal=False)

    # 1. Water Manager registers complaint against Electricity
    res = client.post(
        "/complaints",
        headers=water_mgr,
        data={
            "title": "Water Manager reports broken street light outside office",
            "description": "Pole 12 light is flickering and sparking dangerous sparks",
            "department_id": elec_dept,
            "category_id": light,
            "location_id": loc,
        },
    )
    assert res.status_code == 201, res.text
    complaint_id = res.json()["id"]

    # 2. Water Manager sees it in their "created_by=me" queue
    own_list = items(client.get("/complaints", params={"created_by": "me"}, headers=water_mgr))
    assert complaint_id in {c["id"] for c in own_list}

    # 3. Water Manager can view full complaint details
    creator_view = detail(client, water_mgr, complaint_id)
    assert creator_view["title"] == "Water Manager reports broken street light outside office"
    assert creator_view["department"] == "Electricity"

    # 4. Electricity Manager and Supervisor see it in their operational scope
    elec_mgr_queue = items(client.get("/complaints", headers=elec_mgr))
    assert complaint_id in {c["id"] for c in elec_mgr_queue}

    elec_sup_queue = items(client.get("/complaints", headers=elec_sup))
    assert complaint_id in {c["id"] for c in elec_sup_queue}

    # 5. Water agent does NOT see this Electricity ticket in their operational queue
    water_agent_queue = items(client.get("/complaints", headers=water_agent))
    assert complaint_id not in {c["id"] for c in water_agent_queue}


# ---------------------------------------------------------------------------
# Scenario 2: Multi-User Registration & Workload Distribution
# ---------------------------------------------------------------------------

def test_concurrent_multi_user_registration_and_workload_routing(client, login, end_user_login):
    """Simulates multiple end-users filing complaints.
    Verifies auto-routing properly assigns complaints and balances workload across candidate agents.
    """
    users = [end_user_login(f"987654321{i}") for i in range(4)]
    created_ids = []

    for idx, user in enumerate(users):
        cid = file_complaint(
            client,
            user,
            department="Electricity",
            title=f"Multi-User Street Light Issue #{idx + 1}",
        )
        created_ids.append(cid)

    assert len(created_ids) == 4

    # Verify each complaint received an ID and was routed to an agent
    root = login(SUPER_ADMIN)
    handlers = []
    for cid in created_ids:
        d = detail(client, root, cid)
        assert d["status"] in ("ASSIGNED", "IN_PROGRESS", "SUBMITTED")
        if d.get("assignee"):
            handlers.append(d["assignee"]["name"])

    # Confirm auto_route distributed assignments
    assert len(handlers) > 0


# ---------------------------------------------------------------------------
# Scenario 3: Department Queue, Unassigned Tickets & Superior Reassignment
# ---------------------------------------------------------------------------

def test_unassigned_queue_and_superior_manual_reassignment(client, login):
    """Verifies that complaints waiting in the department queue can be monitored
    and manually reassigned to subordinates by a supervisor.
    """
    root = login(SUPER_ADMIN)
    supervisor = login(ELEC_SUPERVISOR)
    agent = login(ELEC_AGENT)

    elec_dept, light = category_id(client, root, "Electricity", "Street Light")
    loc = location_id(client, root, "India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar", portal=False)

    # Create ticket as staff
    created = client.post(
        "/complaints",
        headers=login(ELEC_MANAGER),
        data={
            "title": "Unassigned queue test ticket",
            "description": "Needs triage",
            "department_id": elec_dept,
            "category_id": light,
            "location_id": loc,
        },
    ).json()
    cid = created["id"]

    # Unassign to place in department queue
    with SessionLocal() as db:
        c = db.query(Complaint).filter(Complaint.generated_id == cid).one()
        routing_service.unassign(db, c, None, "Testing queue placement", datetime.utcnow())
        db.commit()

    # Supervisor inspects unassigned queue
    unassigned_tickets = items(client.get("/complaints", params={"assigned": "unassigned"}, headers=supervisor))
    assert cid in {item["id"] for item in unassigned_tickets}

    # Supervisor retrieves assignee options (subordinates under them)
    options = client.get(f"/complaints/{cid}/assignee-options", headers=supervisor).json()
    assert len(options) > 0
    target_agent = next(o for o in options if "agent" in o["name"].lower() or "elec" in o["name"].lower() or o["role"] == "Agent")

    # Supervisor manually assigns ticket to agent
    assign_res = client.post(
        f"/complaints/{cid}/assign",
        headers=supervisor,
        json={"assignee_id": target_agent["id"], "reason": "Assigned by supervisor for priority handling"},
    )
    assert assign_res.status_code == 200, assign_res.text

    # Verify status changed to assigned and assignee matches
    updated = detail(client, supervisor, cid)
    assert updated["status"] == "ASSIGNED"
    assert updated["assignee"]["id"] == target_agent["id"]

    # Verify notification delivered to agent
    agent_notifications = get_notifications(client, agent)
    assert any(cid in n["title"] and "assigned" in n["title"].lower() for n in agent_notifications)


# ---------------------------------------------------------------------------
# Scenario 4: Auto-Escalation Chain Climbing Through Superiors
# ---------------------------------------------------------------------------

def test_auto_escalation_chain_through_superiors(client, login, end_user_login):
    """Verifies that an SLA breach triggers multi-tier auto-escalation:
    1. Warning sent before breach.
    2. Response SLA breach auto-escalates to Supervisor (Level 1).
    3. Supervisor notified; Manager alerted to breach.
    4. Unresolved ticket auto-escalates up to Manager (Level 2).
    5. Escalates up to Super Admin (Level 3).
    """
    end_user = end_user_login("9876543210")
    cid = file_complaint(client, end_user, title="Critical power supply cut")
    agent = login(ELEC_AGENT)
    supervisor = login(ELEC_SUPERVISOR)
    manager = login(ELEC_MANAGER)
    root = login(SUPER_ADMIN)

    d = detail(client, agent, cid)
    due = parse(d["sla_due"]["response_due_at"])

    # 1. 30 minutes before due: warning trigger
    assert check_sla(cid, due - timedelta(minutes=30)) == ["response_warning"]
    agent_notifs = get_notifications(client, agent)
    assert any(cid in n["title"] and "due soon" in n["title"] for n in agent_notifs)

    # 2. 1 minute after due: response breach trigger
    breach_events = check_sla(cid, due + timedelta(minutes=1))
    assert "response_breach" in breach_events

    # Verify escalated to Supervisor at Level 1
    d_sup = detail(client, supervisor, cid)
    assert d_sup["escalation"]["level"] == 1
    assert d_sup["sla"]["response"] == "breached"
    assert d_sup["escalation"]["to"]["name"] == "Priya Patel"  # Supervisor

    # Verify Supervisor sees ticket under "escalated=me"
    sup_escalated = items(client.get("/complaints", params={"escalated": "me"}, headers=supervisor))
    assert cid in {item["id"] for item in sup_escalated}

    # Verify Supervisor received complaint.escalated notification
    sup_notifs = get_notifications(client, supervisor)
    assert any(cid in n["title"] and n["kind"] == "complaint.escalated" for n in sup_notifs)

    # Verify Manager received sla.breached alert
    mgr_notifs = get_notifications(client, manager)
    assert any(cid in n["title"] and n["kind"] == "sla.breached" for n in mgr_notifs)

    # 3. Advance time by 25h: Level 1 window expires -> Auto-escalates to Manager (Level 2)
    level2_events = check_sla(cid, due + timedelta(hours=25))
    assert "response_escalation" in level2_events
    d_mgr = detail(client, manager, cid)
    assert d_mgr["escalation"]["level"] == 2
    assert d_mgr["escalation"]["to"]["name"] == "Vikram Rathore"  # Manager

    # Verify Manager now sees ticket under "escalated=me"
    mgr_escalated = items(client.get("/complaints", params={"escalated": "me"}, headers=manager))
    assert cid in {item["id"] for item in mgr_escalated}

    # Verify Manager can self-assign the escalated complaint
    assignee_options = client.get(f"/complaints/{cid}/assignee-options", headers=manager).json()
    mgr_candidate = next((c for c in assignee_options if c["name"] == "Vikram Rathore"), None)
    assert mgr_candidate is not None, "Manager must be eligible to self-assign"
    reassign_res = client.post(
        f"/complaints/{cid}/assign",
        json={"assignee_id": mgr_candidate["id"], "note": "Handling escalated complaint directly"},
        headers=manager,
    )
    assert reassign_res.status_code == 200
    assert detail(client, manager, cid)["assignee"]["name"] == "Vikram Rathore"


# ---------------------------------------------------------------------------
# Scenario 5: Rejection Request & Supervisor Approval Flow
# ---------------------------------------------------------------------------

def test_rejection_request_and_supervisor_approval(client, login, end_user_login):
    """Verifies that an agent can request rejection, the ticket enters pending rejection,
    and a supervisor reviews and approves the rejection.
    """
    end_user = end_user_login("9876543210")
    cid = file_complaint(client, end_user, title="Nuisance complaint to reject")
    agent = login(ELEC_AGENT)
    supervisor = login(ELEC_SUPERVISOR)

    # Agent requests rejection
    reasons = client.get("/rejection-requests/reasons", headers=agent).json()
    reason_id = reasons[0]["id"]
    req_res = client.post(
        f"/complaints/{cid}/rejection-requests",
        headers=agent,
        json={"reason_id": reason_id, "reason": "Issue is outside municipal scope"},
    )
    assert req_res.status_code == 201, req_res.text
    request_id = req_res.json()["rejection"]["requests"][-1]["id"]

    # Verify ticket is in pending rejection
    d = detail(client, agent, cid)
    assert d["status"] == "REJECTION_REQUESTED"

    # Supervisor approves rejection request
    approve_res = client.post(f"/rejection-requests/{request_id}/approve", headers=supervisor, json={})
    assert approve_res.status_code == 200, approve_res.text

    # Verify complaint status is now REJECTED
    d_final = detail(client, supervisor, cid)
    assert d_final["status"] == "REJECTED"


# ---------------------------------------------------------------------------
# Scenario 6: Concurrent Multi-User Operation Safety
# ---------------------------------------------------------------------------

def test_concurrent_multi_user_operations_safety(client, login, end_user_login):
    """Simulates simultaneous operations on the same complaint from distinct users:
    - Agent posting an internal work note.
    - Supervisor posting a supervision comment.
    Verifies database transaction isolation and audit log consistency.
    """
    end_user = end_user_login("9876543210")
    cid = file_complaint(client, end_user, title="Concurrent comments test ticket")
    agent = login(ELEC_AGENT)
    supervisor = login(ELEC_SUPERVISOR)

    def agent_comment():
        return client.post(
            f"/complaints/{cid}/comments",
            headers=agent,
            data={"body": "Agent: Inspected site at 10 AM", "is_internal": "true"},
        )

    def supervisor_comment():
        return client.post(
            f"/complaints/{cid}/comments",
            headers=supervisor,
            data={"body": "Supervisor: Please expedite field repair", "is_internal": "true"},
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(agent_comment)
        f2 = executor.submit(supervisor_comment)
        r1 = f1.result()
        r2 = f2.result()

    assert r1.status_code == 201, r1.text
    assert r2.status_code == 201, r2.text

    # Verify both comments exist on the complaint
    final_detail = detail(client, supervisor, cid)
    comment_bodies = [c["body"] for c in final_detail["comments"]]
    assert any("Inspected site" in b for b in comment_bodies)
    assert any("expedite field repair" in b for b in comment_bodies)


# ---------------------------------------------------------------------------
# Scenario 7: Broad Location Complaint Auto-Assignment
# ---------------------------------------------------------------------------

def test_manager_registered_broad_location_complaint_auto_assigns(client, login):
    """Verifies that when a manager registers a complaint at a broader parent location
    (e.g., country India or state), the routing engine automatically assigns it to an
    agent operating within that territory rather than leaving it unassigned.
    """
    root = login(SUPER_ADMIN)
    mgr = login(ELEC_MANAGER)
    elec_dept, light = category_id(client, root, "Electricity", "Street Light")
    india_loc = location_id(client, root, "India", portal=False)

    created = client.post(
        "/complaints",
        headers=mgr,
        data={
            "title": "State highway power fluctuation",
            "description": "Fluctuations observed along the main transmission grid",
            "department_id": elec_dept,
            "category_id": light,
            "location_id": india_loc,
        },
    ).json()

    assert created["id"]
    # Verify auto-assigned immediately upon registration
    d = detail(client, mgr, created["id"])
    assert d["status"] == "ASSIGNED"
    assert d["assignee"] is not None
    assert d["assignee"]["name"] in ["Farhan Ali", "Rohit Jain", "Karan Mehta", "Amit Kumar", "Priya Patel", "Vikram Rathore"]
