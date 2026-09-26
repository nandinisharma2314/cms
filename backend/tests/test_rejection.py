"""Rejection only with approval from above, and the audit trail around it."""
from conftest import ADMIN, ELEC_AGENT, ELEC_MANAGER, ELEC_SUPERVISOR, SUPER_ADMIN
from test_workflow import act, detail, file_complaint

CITY_AGENT = "rohit.jain@civiccare.gov.in"
WATER_MANAGER = "water.manager@civiccare.gov.in"
CATEGORY = "Outside department jurisdiction"


def request_rejection(client, headers, cid, category=CATEGORY, reason="This pole belongs to the railways."):
    return client.post(f"/complaints/{cid}/rejection-requests", headers=headers,
                       json={"category": category, "reason": reason})


def pending_for(client, headers):
    return client.get("/rejection-requests/", params={"view": "to_decide"}, headers=headers).json()


def test_agent_cannot_reject_directly_only_request(client, login, end_user_login):
    agent = login(ELEC_AGENT)
    cid = file_complaint(client, end_user_login(), title="Railway pole")
    d = detail(client, agent, cid)
    assert "reject" not in [a["key"] for a in d["actions"]]
    assert d["rejection"]["can_request"]
    assert request_rejection(client, agent, cid, reason="short").status_code == 400
    assert request_rejection(client, agent, cid, category="Because").status_code == 400

    d = request_rejection(client, agent, cid).json()
    assert d["status"] == "REJECTION_REQUESTED"
    assert d["acknowledged_at"]  # asking counts as a response
    assert d["actions"] == [] and not d["rejection"]["can_request"]
    pending = d["rejection"]["requests"][-1]
    assert pending["status"] == "PENDING" and pending["approver"] == "Priya Patel" and pending["can_withdraw"]
    assert request_rejection(client, agent, cid).status_code == 409  # one at a time

    # the end user only sees that it is under review, never the reason
    view = client.get(f"/portal/complaints/{cid}", headers=end_user_login()).json()
    assert view["status_label"] == "Under Review"
    assert all("railways" not in (e["note"] or "") for e in view["timeline"])


def test_who_can_decide(client, login, end_user_login):
    agent = login(ELEC_AGENT)
    cid = file_complaint(client, end_user_login(), title="Who decides")
    request_id = request_rejection(client, agent, cid).json()["rejection"]["requests"][-1]["id"]

    assert client.post(f"/rejection-requests/{request_id}/approve", headers=agent, json={}).status_code == 403
    # another agent covering the area: no approve permission
    assert client.post(f"/rejection-requests/{request_id}/approve", headers=login(CITY_AGENT), json={}).status_code == 403
    # a manager of another department cannot even see it
    assert client.post(f"/rejection-requests/{request_id}/approve", headers=login(WATER_MANAGER), json={}).status_code == 404
    assert request_id not in {r["id"] for r in pending_for(client, login(WATER_MANAGER))}

    supervisor, manager = login(ELEC_SUPERVISOR), login(ELEC_MANAGER)
    assert request_id in {r["id"] for r in pending_for(client, supervisor)}
    assert request_id in {r["id"] for r in pending_for(client, manager)}  # anyone above in scope may decide
    notes = client.get("/notifications/", headers=supervisor).json()["items"]
    assert any(n["kind"] == "rejection.requested" and cid in n["title"] for n in notes)
    stats = client.get("/complaints/admin/stats", headers=supervisor).json()
    assert stats["pending_summary"]["rejection_requests"] >= 1


def test_denied_request_puts_the_complaint_back_to_work(client, login, end_user_login):
    agent, supervisor = login(ELEC_AGENT), login(ELEC_SUPERVISOR)
    cid = file_complaint(client, end_user_login(), title="Deny me")
    request_id = request_rejection(client, agent, cid).json()["rejection"]["requests"][-1]["id"]

    assert client.post(f"/rejection-requests/{request_id}/deny", headers=supervisor, json={}).status_code == 400
    d = client.post(f"/rejection-requests/{request_id}/deny", headers=supervisor,
                    json={"note": "It is inside our limits"}).json()
    # it was ASSIGNED before, but the request was a response, so it resumes as acknowledged
    assert d["status"] == "ACKNOWLEDGED"
    decided = d["rejection"]["requests"][-1]
    assert decided["status"] == "DENIED" and decided["decided_by"] == "Priya Patel"
    assert any(n["kind"] == "rejection.denied" for n in client.get("/notifications/", headers=agent).json()["items"])
    assert "start" in [a["key"] for a in detail(client, agent, cid)["actions"]]


def test_approved_request_rejects_and_tells_the_end_user_why(client, login, end_user_login):
    end_user, agent, supervisor = end_user_login(), login(ELEC_AGENT), login(ELEC_SUPERVISOR)
    cid = file_complaint(client, end_user, title="Approve me")
    request_id = request_rejection(client, agent, cid).json()["rejection"]["requests"][-1]["id"]
    d = client.post(f"/rejection-requests/{request_id}/approve", headers=supervisor,
                    json={"note": "This pole is maintained by Indian Railways; we have forwarded it to them."}).json()
    assert d["status"] == "REJECTED" and d["closed_at"]
    record = d["rejection"]["requests"][-1]
    assert (record["status"], record["decided_by"], record["direct"]) == ("APPROVED", "Priya Patel", False)

    view = client.get(f"/portal/complaints/{cid}", headers=end_user).json()
    assert view["status_label"] == "Rejected"
    assert any("Indian Railways" in (e["note"] or "") for e in view["timeline"])
    inbox = client.get("/portal/notifications", headers=end_user).json()["items"]
    assert any(n["complaint_id"] == cid and "rejected" in n["title"] for n in inbox)

    log = client.get("/audit-logs/", params={"entity_id": cid}, headers=login(SUPER_ADMIN)).json()["items"]
    assert {"complaint.rejection_request", "complaint.rejection_approve"} <= {e["action"] for e in log}


def test_requester_can_withdraw(client, login, end_user_login):
    agent = login(ELEC_AGENT)
    cid = file_complaint(client, end_user_login(), title="Withdraw me")
    act(client, agent, cid, "start")
    request_id = request_rejection(client, agent, cid).json()["rejection"]["requests"][-1]["id"]
    assert client.post(f"/rejection-requests/{request_id}/withdraw", headers=login(ELEC_SUPERVISOR)).status_code == 403
    d = client.post(f"/rejection-requests/{request_id}/withdraw", headers=agent).json()
    assert d["status"] == "IN_PROGRESS" and d["rejection"]["requests"][-1]["status"] == "WITHDRAWN"


def test_direct_rejection_by_an_approver_is_recorded_the_same_way(client, login, end_user_login):
    supervisor = login(ELEC_SUPERVISOR)
    cid = file_complaint(client, end_user_login(), title="Direct reject")
    d = act(client, supervisor, cid, "reject", "Spam: the same report was filed 5 times").json()
    record = d["rejection"]["requests"][-1]
    assert record["direct"] and record["status"] == "APPROVED" and record["decided_by"] == "Priya Patel"


def test_audit_log_filters_and_csv_export(client, login):
    admin = login(SUPER_ADMIN)
    rejections = client.get("/audit-logs/", params={"action": "complaint.rejection"}, headers=admin).json()
    assert rejections["total"] >= 3 and all(e["action"].startswith("complaint.rejection") for e in rejections["items"])
    by_actor = client.get("/audit-logs/", params={"actor": "Priya"}, headers=admin).json()["items"]
    assert by_actor and all("Priya" in e["actor_name"] for e in by_actor)

    export = client.get("/audit-logs/export", params={"action": "complaint.rejection"}, headers=admin)
    assert export.status_code == 200 and export.headers["content-type"].startswith("text/csv")
    lines = export.text.strip().splitlines()
    assert lines[0].startswith("time_utc,actor_type,actor,action") and len(lines) == rejections["total"] + 1
    assert client.get("/audit-logs/export", headers=login(ELEC_MANAGER)).status_code == 403


def test_escalations_are_audited_as_system_actions(client, login):
    log = client.get("/audit-logs/", params={"action": "complaint.escalate"}, headers=login(ADMIN)).json()["items"]
    assert log and all(e["actor_type"] == "system" for e in log)
