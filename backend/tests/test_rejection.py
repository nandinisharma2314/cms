"""Rejection only with approval from above, and the audit trail around it."""
from conftest import CITY_AGENT, ELEC_AGENT, ELEC_MANAGER, ELEC_SUPERVISOR, SUPER_ADMIN, WATER_MANAGER
from test_workflow import act, detail, file_complaint, items

REASON = "Outside department responsibility"


def reason_id(client, headers, name=REASON):
    return next(r["id"] for r in client.get("/rejection-requests/reasons", headers=headers).json() if r["name"] == name)


def request_rejection(client, headers, cid, reason="This pole belongs to the railways.", reason_name=REASON):
    rid = reason_id(client, headers, reason_name) if reason_name else None
    return client.post(f"/complaints/{cid}/rejection-requests", headers=headers,
                       json={"reason_id": rid, "reason": reason})


def pending_for(client, headers):
    return items(client.get("/rejection-requests/", params={"view": "to_decide", "page_size": 100}, headers=headers))


def test_agent_cannot_reject_directly_only_request(client, login, end_user_login):
    agent = login(ELEC_AGENT)
    cid = file_complaint(client, end_user_login(), title="Railway pole")
    d = detail(client, agent, cid)
    assert "reject" not in [a["key"] for a in d["actions"]]
    assert d["rejection"]["can_request"] and d["rejection"]["reasons"]
    assert act(client, agent, cid, "reject", "Not ours at all", reason_id(client, agent)).status_code == 403
    assert request_rejection(client, agent, cid, reason="short").status_code == 400
    assert request_rejection(client, agent, cid, reason_name=None).status_code == 422

    created = request_rejection(client, agent, cid)
    assert created.status_code == 201
    d = created.json()
    assert d["status"] == "REJECTION_REQUESTED"
    assert d["acknowledged_at"]  # asking counts as a response
    assert d["actions"] == [] and not d["rejection"]["can_request"]
    pending = d["rejection"]["requests"][-1]
    assert (pending["status"], pending["approver"], pending["category"]) == ("PENDING", "Priya Patel", REASON)
    assert pending["can_withdraw"]
    assert request_rejection(client, agent, cid).status_code == 409  # one at a time
    # nobody can move it to someone else while the request is open
    candidates = client.get(f"/complaints/{cid}/assignee-options", headers=login(ELEC_SUPERVISOR)).json()
    other = next(c for c in candidates if c["name"] == "Rohit Jain")
    moved = client.post(f"/complaints/{cid}/assign", headers=login(ELEC_SUPERVISOR),
                        json={"assignee_id": other["id"], "reason": "Rohit knows the area"})
    assert moved.status_code == 409

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
    assert client.post(f"/rejection-requests/{request_id}/approve", headers=login(WATER_MANAGER),
                       json={}).status_code == 404
    assert request_id not in {r["id"] for r in pending_for(client, login(WATER_MANAGER))}

    supervisor, manager = login(ELEC_SUPERVISOR), login(ELEC_MANAGER)
    assert request_id in {r["id"] for r in pending_for(client, supervisor)}
    assert request_id in {r["id"] for r in pending_for(client, manager)}  # anyone above in scope may decide
    notes = items(client.get("/notifications/", headers=supervisor))
    assert any(n["kind"] == "rejection.requested" and cid in n["title"] for n in notes)
    stats = client.get("/complaints/admin/stats", headers=supervisor).json()
    assert stats["pending_summary"]["rejection_requests"] >= 1

    # listing views
    assert client.get("/rejection-requests/", params={"view": "bogus"}, headers=agent).status_code == 400
    assert client.get("/rejection-requests/", params={"view": "all"}, headers=agent).status_code == 403
    mine = items(client.get("/rejection-requests/", params={"view": "mine", "status_filter": "pending"}, headers=agent))
    assert request_id in {r["id"] for r in mine}
    page = client.get("/rejection-requests/", params={"view": "all", "page_size": 1}, headers=manager).json()
    assert len(page["items"]) == 1 and page["total"] >= 1 and page["page_size"] == 1


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
    assert any(n["kind"] == "rejection.denied" for n in items(client.get("/notifications/", headers=agent)))
    assert "start" in [a["key"] for a in detail(client, agent, cid)["actions"]]
    # decided requests can't be decided again
    assert client.post(f"/rejection-requests/{request_id}/approve", headers=supervisor, json={}).status_code == 403


def test_approved_request_rejects_and_tells_the_end_user_why(client, login, end_user_login):
    end_user, agent, supervisor = end_user_login(), login(ELEC_AGENT), login(ELEC_SUPERVISOR)
    cid = file_complaint(client, end_user, title="Approve me")
    request_id = request_rejection(client, agent, cid).json()["rejection"]["requests"][-1]["id"]
    d = client.post(f"/rejection-requests/{request_id}/approve", headers=supervisor,
                    json={"note": "This pole is maintained by the railways; we have forwarded it to them."}).json()
    assert d["status"] == "REJECTED" and d["closed_at"]
    record = d["rejection"]["requests"][-1]
    assert (record["status"], record["decided_by"], record["direct"]) == ("APPROVED", "Priya Patel", False)

    view = client.get(f"/portal/complaints/{cid}", headers=end_user).json()
    assert view["status_label"] == "Rejected"
    assert any("forwarded it to them" in (e["note"] or "") for e in view["timeline"])
    inbox = items(client.get("/portal/notifications", headers=end_user))
    assert any(n["complaint_id"] == cid and "rejected" in n["title"] for n in inbox)

    log = items(client.get("/audit-logs/", params={"entity_id": cid}, headers=login(SUPER_ADMIN)))
    assert {"complaint.rejection_request", "complaint.rejection_approve"} <= {e["action"] for e in log}


def test_without_a_message_the_end_user_sees_only_the_reason_category(client, login, end_user_login):
    end_user, agent = end_user_login(), login(ELEC_AGENT)
    cid = file_complaint(client, end_user, title="Keep the explanation internal")
    explanation = "Internal: the reporter files this every week."
    request_id = request_rejection(client, agent, cid, reason=explanation).json()["rejection"]["requests"][-1]["id"]
    client.post(f"/rejection-requests/{request_id}/approve", headers=login(ELEC_SUPERVISOR), json={})
    view = client.get(f"/portal/complaints/{cid}", headers=end_user).json()
    notes = [e["note"] for e in view["timeline"] if e["note"]]
    assert notes[-1] == REASON and not any(explanation in note for note in notes)


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
    assert act(client, supervisor, cid, "reject", "Spam: the same report was filed 5 times").status_code == 400
    d = act(client, supervisor, cid, "reject", "Spam: the same report was filed 5 times",
            reason_id(client, supervisor, "Duplicate complaint")).json()
    record = d["rejection"]["requests"][-1]
    assert record["direct"] and record["status"] == "APPROVED" and record["decided_by"] == "Priya Patel"
    assert record["category"] == "Duplicate complaint"


def test_rejection_reasons_are_managed_by_admins(client, login, end_user_login):
    root = login(SUPER_ADMIN)
    assert client.post("/settings/rejection-reasons", headers=login(ELEC_MANAGER),
                       json={"name": "Weather"}).status_code == 403
    created = client.post("/settings/rejection-reasons", headers=root, json={"name": "  Handled by another agency "})
    assert created.status_code == 201, created.text
    reason = created.json()
    assert reason["name"] == "Handled by another agency" and reason["is_active"]
    assert client.post("/settings/rejection-reasons", headers=root,
                       json={"name": "handled by another agency"}).status_code == 409
    listed = client.get("/rejection-requests/reasons", headers=login(ELEC_AGENT)).json()
    assert listed[-1]["id"] == reason["id"]

    order = [r["id"] for r in client.get("/settings/rejection-reasons", headers=root).json()]
    reordered = [order[-1], *order[:-1]]
    assert client.put("/settings/rejection-reasons/order", headers=root, json={"ids": reordered}).status_code == 200
    assert [r["id"] for r in client.get("/settings/rejection-reasons", headers=root).json()] == reordered
    assert client.put("/settings/rejection-reasons/order", headers=root, json={"ids": reordered[1:]}).status_code == 400

    # retired reasons stay on old records but can no longer be chosen
    assert client.patch(f"/settings/rejection-reasons/{reason['id']}", headers=root,
                        json={"is_active": False}).status_code == 200
    agent = login(ELEC_AGENT)
    assert reason["id"] not in {r["id"] for r in client.get("/rejection-requests/reasons", headers=agent).json()}
    cid = file_complaint(client, end_user_login(), title="Retired reason")
    retired = client.post(f"/complaints/{cid}/rejection-requests", headers=agent,
                          json={"reason_id": reason["id"], "reason": "Another agency handles these."})
    assert retired.status_code == 400
    # restore the original order so later tests see the factory reasons first
    client.put("/settings/rejection-reasons/order", headers=root, json={"ids": order})


def test_audit_log_filters_and_csv_export(client, login):
    admin = login(SUPER_ADMIN)
    rejections = client.get("/audit-logs/", params={"action": "complaint.rejection"}, headers=admin).json()
    assert rejections["total"] >= 3 and all(e["action"].startswith("complaint.rejection") for e in rejections["items"])
    by_actor = items(client.get("/audit-logs/", params={"actor": "Priya"}, headers=admin))
    assert by_actor and all("Priya" in e["actor_name"] for e in by_actor)
    assert "complaint" in client.get("/audit-logs/entity-types", headers=admin).json()

    export = client.get("/audit-logs/export", params={"action": "complaint.rejection"}, headers=admin)
    assert export.status_code == 200 and export.headers["content-type"].startswith("text/csv")
    lines = export.text.strip().splitlines()
    assert lines[0].startswith("\ufefftime_utc,actor_type,actor,action") and len(lines) == rejections["total"] + 1
    assert client.get("/audit-logs/export", headers=login(ELEC_MANAGER)).status_code == 403

