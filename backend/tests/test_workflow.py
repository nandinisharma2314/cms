"""Routing, assignment, the status workflow, comments and the timeline."""
from conftest import ADMIN, ELEC_AGENT, ELEC_MANAGER, ELEC_SUPERVISOR, SUPER_ADMIN

CITY_AGENT = "rohit.jain@civiccare.gov.in"  # Electricity @ Jaipur city


def departments(client, end_user):
    return {d["name"]: d for d in client.get("/portal/departments", headers=end_user).json()}


def location_id(client, headers, *names, portal=True):
    nodes = client.get("/portal/locations/tree" if portal else "/locations/tree", headers=headers).json()
    node = None
    for name in names:
        node = next(n for n in nodes if n["name"] == name)
        nodes = node["children"]
    return node["id"]


def file_complaint(client, end_user, department="Electricity", location=None, title="Street light out"):
    dept = departments(client, end_user)[department]
    data = {"department_id": dept["id"], "title": title, "description": "Near the park", "priority": "High"}
    if location:
        data["location_id"] = location
    response = client.post("/portal/complaints", headers=end_user, data=data)
    assert response.status_code == 201, response.text
    return response.json()["complaint_id"]


def act(client, headers, complaint_id, action, note=None):
    return client.post(f"/complaints/{complaint_id}/actions", headers=headers, json={"action": action, "note": note})


def detail(client, headers, complaint_id):
    response = client.get(f"/complaints/{complaint_id}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_routing_prefers_the_most_specific_agent(client, login, end_user_login):
    end_user = end_user_login()
    mansarovar = file_complaint(client, end_user)  # defaults to the end user's area
    cscheme = file_complaint(
        client, end_user, location=location_id(client, end_user, "India", "Rajasthan", "Jaipur", "Jaipur", "C-Scheme"),
    )
    supervisor = login(ELEC_SUPERVISOR)
    # both Amit (Mansarovar) and Rohit (all of Jaipur city) cover Mansarovar; the area agent wins
    assert detail(client, supervisor, mansarovar)["assignee"]["name"] == "Amit Kumar"
    assert detail(client, supervisor, cscheme)["assignee"]["name"] == "Rohit Jain"
    timeline = [e["type"] for e in detail(client, supervisor, mansarovar)["timeline"]]
    assert timeline[:3] == ["submitted", "routed", "assigned"]


def test_routing_balances_workload_and_skips_unavailable_staff(client, login):
    admin = login(SUPER_ADMIN)
    roles = {r["key"]: r["id"] for r in client.get("/roles/", headers=admin).json()}
    roads = next(d["id"] for d in client.get("/departments/", headers=admin).json() if d["name"] == "Roads")
    jodhpur = location_id(client, admin, "India", "Rajasthan", "Jodhpur", portal=False)
    sardarpura = location_id(client, admin, "India", "Rajasthan", "Jodhpur", "Jodhpur", "Sardarpura", portal=False)
    agents = []
    for name in ("Jodhpur Roads One", "Jodhpur Roads Two"):
        created = client.post("/users/", headers=admin, json={
            "name": name, "email": f"{name.lower().replace(' ', '.')}@civiccare.gov.in", "role_id": roles["agent"],
            "password": "Str0ngPass!", "scopes": [{"department_id": roads, "location_id": jodhpur}],
        })
        assert created.status_code == 201, created.text
        agents.append(created.json())

    def quick(title):
        response = client.post("/complaints/quick-create", headers=admin, json={
            "title": title, "department_id": roads, "location_id": sardarpura, "end_user_name": "Walk-in",
        })
        assert response.status_code == 201, response.text
        return response.json()["assignee"]

    # district-level agents beat the state-wide roads agent; then least workload wins
    first, second = quick("Pothole one"), quick("Pothole two")
    assert {first, second} == {"Jodhpur Roads One", "Jodhpur Roads Two"}

    busy = next(a for a in agents if a["name"] == first)
    assert client.patch(f"/users/{busy['id']}", headers=admin, json={"is_available": False}).status_code == 200
    assert quick("Pothole three") == second
    assert quick("Pothole four") == second  # the other one is on leave


def test_unrouted_complaint_waits_in_the_department_queue(client, login):
    admin = login(ADMIN)
    healthcare = next(d["id"] for d in client.get("/departments/", headers=admin).json() if d["name"] == "Healthcare")
    mansarovar = location_id(client, admin, "India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar", portal=False)
    created = client.post("/complaints/quick-create", headers=admin, json={
        "title": "Clinic closed", "department_id": healthcare, "location_id": mansarovar,
    }).json()
    assert created["assignee"] is None
    complaint = detail(client, admin, created["id"])
    assert complaint["status"] == "SUBMITTED"
    assert complaint["timeline"][-1]["type"] == "unassigned"

    queue = client.get("/complaints/", params={"assigned": "unassigned"}, headers=admin).json()
    assert created["id"] in {c["id"] for c in queue}
    assert client.get(f"/complaints/{created['id']}", headers=login(ELEC_MANAGER)).status_code == 404

    # nobody below the admin covers Healthcare in Jaipur, so only the admin can take it
    options = client.get(f"/complaints/{created['id']}/assignee-options", headers=admin).json()
    assert [o["name"] for o in options] == ["Ananya Verma"]
    assigned = client.post(f"/complaints/{created['id']}/assign", headers=admin, json={"assignee_id": options[0]["id"]})
    assert assigned.json()["status"] == "ASSIGNED"


def test_full_lifecycle_between_officer_and_end_user(client, login, end_user_login):
    end_user = end_user_login()
    agent = login(ELEC_AGENT)
    cid = file_complaint(client, end_user, title="Transformer sparking")

    assert [a["key"] for a in detail(client, agent, cid)["actions"]] == ["acknowledge", "start", "resolve"]
    assert act(client, agent, cid, "acknowledge", "On it").status_code == 200
    assert act(client, agent, cid, "start").json()["status"] == "IN_PROGRESS"
    assert act(client, agent, cid, "request_info").status_code == 400  # question required
    assert act(client, agent, cid, "request_info", "Which pole number?").json()["status"] == "WAITING_FOR_INFORMATION"

    view = client.get(f"/portal/complaints/{cid}", headers=end_user).json()
    assert view["comments"][-1]["body"] == "Which pole number?"
    assert view["comments"][-1]["author_name"] == "Electricity Department"  # officer names are not exposed
    assert "assignee" not in view

    reply = client.post(f"/portal/complaints/{cid}/comments", headers=end_user, data={"body": "Pole 14"})
    assert reply.json()["status"] == "IN_PROGRESS"  # answering puts it back in progress

    note = client.post(f"/complaints/{cid}/comments", headers=agent, data={"body": "Needs a crane", "is_internal": "true"})
    assert note.status_code == 201
    view = client.get(f"/portal/complaints/{cid}", headers=end_user).json()
    assert all(c["body"] != "Needs a crane" for c in view["comments"])
    assert all("internal" not in e["message"] for e in view["timeline"])

    assert act(client, agent, cid, "resolve").status_code == 400  # resolution required
    resolved = act(client, agent, cid, "resolve", "Transformer replaced").json()
    assert resolved["status"] == "RESOLVED" and resolved["acknowledged_at"] and resolved["resolved_at"]

    view = client.get(f"/portal/complaints/{cid}", headers=end_user).json()
    assert set(view["actions"]) == {"comment", "confirm", "reopen", "feedback"}
    closed = client.post(f"/portal/complaints/{cid}/confirm", headers=end_user, json={"rating": 5, "comment": "Quick"}).json()
    assert closed["status"] == "CLOSED" and closed["feedback_rating"] == 5
    assert closed["actions"] == ["reopen"]
    assert client.post(f"/portal/complaints/{cid}/comments", headers=end_user, data={"body": "hi"}).status_code == 409

    reopened = client.post(f"/portal/complaints/{cid}/reopen", headers=end_user, json={"reason": "Sparking again"}).json()
    assert reopened["status"] == "REOPENED" and reopened["reopen_count"] == 1
    again = detail(client, agent, cid)
    assert again["assignee"]["name"] == "Amit Kumar"  # same officer keeps it
    assert "acknowledge" in [a["key"] for a in again["actions"]]


def test_only_the_handler_or_a_supervisor_can_act(client, login, end_user_login):
    cid = file_complaint(client, end_user_login(), title="Loose cable")
    other_agent = login(CITY_AGENT)  # covers Mansarovar too, but it's not theirs
    assert detail(client, other_agent, cid)["actions"] == []
    assert act(client, other_agent, cid, "acknowledge").status_code == 409

    agent = login(ELEC_AGENT)
    assert "reject" not in [a["key"] for a in detail(client, agent, cid)["actions"]]

    supervisor = login(ELEC_SUPERVISOR)
    keys = [a["key"] for a in detail(client, supervisor, cid)["actions"]]
    assert "acknowledge" in keys and "reject" in keys
    assert act(client, supervisor, cid, "reject").status_code == 400  # reason required
    rejected = act(client, supervisor, cid, "reject", "Private property; not municipal").json()
    assert rejected["status"] == "REJECTED" and rejected["closed_at"]


def test_manual_reassignment_by_supervisor(client, login, end_user_login):
    cid = file_complaint(client, end_user_login(), title="Meter burnt")
    agent, supervisor = login(ELEC_AGENT), login(ELEC_SUPERVISOR)
    options = {o["name"]: o for o in client.get(f"/complaints/{cid}/assignee-options", headers=supervisor).json()}
    assert {"Amit Kumar", "Rohit Jain", "Priya Patel"} <= set(options)
    assert options["Amit Kumar"]["is_current"]
    assert "Karan Mehta" not in options  # Delhi agent: outside the complaint's scope

    assert client.post(f"/complaints/{cid}/assign", headers=agent, json={"assignee_id": options["Rohit Jain"]["id"]}).status_code == 403

    moved = client.post(f"/complaints/{cid}/assign", headers=supervisor,
                        json={"assignee_id": options["Rohit Jain"]["id"], "reason": "Amit is on field duty"}).json()
    assert moved["assignee"]["name"] == "Rohit Jain" and moved["status"] == "ASSIGNED"
    assert [a["ended_at"] is None for a in moved["assignments"]] == [False, True]
    assert detail(client, agent, cid)["actions"] == []  # Amit can still see it but no longer handle it


def test_agent_filters_and_stats(client, login):
    agent = login(ELEC_AGENT)
    mine = client.get("/complaints/", params={"assigned": "me"}, headers=agent).json()
    assert mine and all(c["assignee"]["name"] == "Amit Kumar" for c in mine)
    resolved = client.get("/complaints/", params={"group": "resolved"}, headers=agent).json()
    assert all(c["status"] in ("RESOLVED", "CLOSED") for c in resolved)

    stats = client.get("/complaints/admin/stats", headers=agent).json()
    m = stats["metrics"]
    assert m["open"] + m["in_progress"] + m["resolved"] + m["rejected"] == m["total"]
    assert stats["pending_summary"]["assigned_to_me"] >= 1
