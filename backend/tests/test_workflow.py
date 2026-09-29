"""Routing, assignment, the status workflow, comments and the timeline."""
from conftest import ADMIN, CITY_AGENT, ELEC_AGENT, ELEC_MANAGER, ELEC_SUPERVISOR, SUPER_ADMIN, first_login
from factories import email


def departments(client, end_user):
    return {d["name"]: d for d in client.get("/portal/departments", headers=end_user).json()}


def location_id(client, headers, *names, portal=True):
    nodes = client.get("/portal/locations/tree" if portal else "/locations/tree", headers=headers).json()
    node = None
    for name in names:
        node = next(n for n in nodes if n["name"] == name)
        nodes = node["children"]
    return node["id"]


# Used when a test does not pick a category (Street Light has High priority: respond 24h, resolve 72h).
DEFAULT_CATEGORY = {"Electricity": "Street Light"}


def file_complaint(client, end_user, department="Electricity", location=None, title="Street light out",
                   category=None):
    dept = departments(client, end_user)[department]
    category = category or DEFAULT_CATEGORY.get(department)
    chosen = next(c for c in dept["categories"] if category is None or c["name"] == category)
    if location is None:
        location = client.get("/portal/me", headers=end_user).json()["location"]["id"]
    data = {"department_id": dept["id"], "category_id": chosen["id"], "location_id": location,
            "title": title, "description": "Near the park"}
    response = client.post("/portal/complaints", headers=end_user, data=data)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def act(client, headers, complaint_id, action, note=None, reason_id=None):
    return client.post(f"/complaints/{complaint_id}/actions", headers=headers,
                       json={"action": action, "note": note, "reason_id": reason_id})


def detail(client, headers, complaint_id):
    response = client.get(f"/complaints/{complaint_id}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def items(response):
    assert response.status_code == 200, response.text
    return response.json()["items"]


def category_id(client, headers, department, category):
    dept = next(d for d in client.get("/departments/", headers=headers).json() if d["name"] == department)
    return dept["id"], next(c["id"] for c in dept["categories"] if c["name"] == category)


def test_routing_prefers_the_most_specific_agent(client, login, end_user_login):
    end_user = end_user_login()
    mansarovar = file_complaint(client, end_user)  # the end user's own area
    cscheme = file_complaint(
        client, end_user, location=location_id(client, end_user, "India", "Rajasthan", "Jaipur", "Jaipur", "C-Scheme"),
    )
    supervisor = login(ELEC_SUPERVISOR)
    # both Amit (Mansarovar) and Rohit (all of Jaipur city) cover Mansarovar; the area agent wins
    assert detail(client, supervisor, mansarovar)["assignee"]["name"] == "Amit Kumar"
    assert detail(client, supervisor, cscheme)["assignee"]["name"] == "Rohit Jain"
    timeline = [e["type"] for e in detail(client, supervisor, mansarovar)["timeline"]]
    assert timeline[:3] == ["submitted", "routed", "assigned"]


def test_priority_comes_from_the_category(client, login, end_user_login):
    end_user = end_user_login()
    fallen = file_complaint(client, end_user, category="Fallen Pole", title="Pole down")
    other = file_complaint(client, end_user, category="Other", title="Something else")
    supervisor = login(ELEC_SUPERVISOR)
    assert detail(client, supervisor, fallen)["priority"]["name"] == "Critical"
    assert detail(client, supervisor, other)["priority"]["name"] == "Medium"
    # end users cannot choose a priority
    dept = departments(client, end_user)["Electricity"]
    street_light = next(c for c in dept["categories"] if c["name"] == "Street Light")
    response = client.post("/portal/complaints", headers=end_user, data={
        "department_id": dept["id"], "category_id": street_light["id"],
        "location_id": location_id(client, end_user, "India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar"),
        "title": "Try", "description": "x", "priority_id": "1",
    })
    assert response.status_code == 201 and response.json()["priority"]["name"] == "High"


def test_routing_balances_workload_and_skips_unavailable_staff(client, login):
    admin = login(SUPER_ADMIN)
    roles = {r["key"]: r["id"] for r in client.get("/roles/", headers=admin).json()}
    roads, potholes = category_id(client, admin, "Roads", "Potholes")
    jodhpur = location_id(client, admin, "India", "Rajasthan", "Jodhpur", portal=False)
    sardarpura = location_id(client, admin, "India", "Rajasthan", "Jodhpur", "Jodhpur", "Sardarpura", portal=False)
    agents = []
    for name in ("Jodhpur Roads One", "Jodhpur Roads Two"):
        created = client.post("/users/", headers=admin, json={
            "name": name, "email": email(name.lower().replace(" ", ".")), "role_id": roles["agent"],
            "password": "Initial-Pass-1", "scopes": [{"department_id": roads, "location_id": jodhpur}],
        })
        assert created.status_code == 201, created.text
        assert created.json()["must_change_password"] is True
        agents.append(created.json())

    def quick(title):
        response = client.post("/complaints/quick-create", headers=admin, json={
            "title": title, "description": "Reported at the counter", "department_id": roads,
            "category_id": potholes, "location_id": sardarpura, "end_user_name": "Walk-in visitor",
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
    healthcare, clinic = category_id(client, admin, "Healthcare", "Clinic Services")
    mansarovar = location_id(client, admin, "India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar", portal=False)
    created = client.post("/complaints/quick-create", headers=admin, json={
        "title": "Clinic closed", "description": "Closed at 11am", "department_id": healthcare, "category_id": clinic,
        "location_id": mansarovar, "end_user_name": "Phone caller",
    }).json()
    assert created["assignee"] is None
    complaint = detail(client, admin, created["id"])
    assert complaint["status"] == "SUBMITTED"
    assert complaint["timeline"][-1]["type"] == "unassigned"

    queue = items(client.get("/complaints/", params={"assigned": "unassigned"}, headers=admin))
    assert created["id"] in {c["id"] for c in queue}
    assert client.get(f"/complaints/{created['id']}", headers=login(ELEC_MANAGER)).status_code == 404

    # nobody below the admin covers Healthcare in Jaipur, so only the admin can take it
    options = client.get(f"/complaints/{created['id']}/assignee-options", headers=admin).json()
    assert [o["name"] for o in options] == ["Ananya Verma"]
    assigned = client.post(f"/complaints/{created['id']}/assign", headers=admin, json={"assignee_id": options[0]["id"]})
    assert assigned.json()["status"] == "ASSIGNED"


def test_quick_create_needs_a_category_and_a_reporter(client, login):
    admin = login(ADMIN)
    roads, potholes = category_id(client, admin, "Roads", "Potholes")
    mansarovar = location_id(client, admin, "India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar", portal=False)
    base = {"title": "Hole", "description": "Big", "department_id": roads, "location_id": mansarovar}
    assert client.post("/complaints/quick-create", headers=admin,
                       json={**base, "category_id": potholes}).status_code == 400  # nobody named
    assert client.post("/complaints/quick-create", headers=admin,
                       json={**base, "category_id": potholes, "end_user_name": "X",
                             "end_user_phone": "12345"}).status_code == 400  # bad phone
    # linked to an existing end user: they see it in the portal
    end_users = client.get("/end-users/", params={"search": "USR004"}, headers=admin).json()["items"]
    linked = client.post("/complaints/quick-create", headers=admin,
                         json={**base, "category_id": potholes, "end_user_id": end_users[0]["id"]})
    assert linked.status_code == 201, linked.text
    view = client.get(f"/complaints/{linked.json()['id']}", headers=admin).json()
    assert view["end_user"]["name"] == "Mohan Lal"


def test_a_different_priority_at_registration_needs_a_reason_and_is_audited(client, login):
    admin = login(ADMIN)
    roads, potholes = category_id(client, admin, "Roads", "Potholes")
    mansarovar = location_id(client, admin, "India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar", portal=False)
    priorities = {p["key"]: p["id"] for p in client.get("/priorities/", headers=admin).json()}
    base = {"title": "Crater", "description": "Car fell in", "department_id": roads, "category_id": potholes,
            "location_id": mansarovar, "end_user_name": "Caller", "priority_id": priorities["critical"]}
    assert client.post("/complaints/quick-create", headers=admin, json=base).status_code == 400  # no reason
    created = client.post("/complaints/quick-create", headers=admin, json={**base, "priority_reason": "Injury risk"})
    assert created.status_code == 201, created.text
    cid = created.json()["id"]
    assert detail(client, admin, cid)["priority"]["key"] == "critical"
    log = items(client.get("/audit-logs/", params={"entity_id": cid}, headers=login(SUPER_ADMIN)))
    entry = next(e for e in log if e["action"] == "complaint.create")
    assert "Injury risk" in entry["summary"] and entry["changes"]["priority"][1] == "Critical"


def test_a_role_that_loses_respond_hands_its_complaints_on(client, login):
    root = login(SUPER_ADMIN)
    roles = {r["key"]: r["id"] for r in client.get("/roles/", headers=root).json()}
    handlers = client.post("/roles/", headers=root, json={
        "key": "ward_handler", "name": "Ward Handler", "parent_id": roles["supervisor"],
        "permissions": ["complaint.view", "complaint.respond", "complaint.receive"]}).json()
    city = location_id(client, root, "India", "Rajasthan", "Jaipur", "Jaipur", portal=False)
    ward = client.post("/locations/", headers=root, json={"name": "Respond Test Ward", "parent_id": city}).json()["id"]
    electricity, street_light = category_id(client, root, "Electricity", "Street Light")
    created = client.post("/users/", headers=root, json={
        "name": "Ward Handler One", "email": "ward.handler@example.test", "role_id": handlers["id"],
        "password": "Initial-Pass-1", "scopes": [{"department_id": electricity, "location_id": ward}]})
    assert created.status_code == 201, created.text

    complaint = client.post("/complaints/quick-create", headers=root, json={
        "title": "Ward light out", "description": "Dark street", "department_id": electricity,
        "category_id": street_light, "location_id": ward, "end_user_name": "Caller"}).json()
    assert complaint["assignee"] == "Ward Handler One"  # the most specific scope wins

    changed = client.patch(f"/roles/{handlers['id']}", headers=root,
                           json={"permissions": ["complaint.view", "complaint.receive"]})
    assert changed.status_code == 200, changed.text
    moved = detail(client, root, complaint["id"])
    assert moved["assignee"]["name"] == "Rohit Jain"  # the Jaipur city agent covers the ward


def test_full_lifecycle_between_staff_and_end_user(client, login, end_user_login):
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
    assert view["comments"][-1]["author_name"] == "Electricity department"  # staff names are not exposed
    assert "assignee" not in view and "end_user_phone" not in view

    reply = client.post(f"/portal/complaints/{cid}/comments", headers=end_user, data={"body": "Pole 14"})
    assert reply.json()["status"] == "IN_PROGRESS"  # answering puts it back in progress

    note = client.post(f"/complaints/{cid}/comments", headers=agent,
                       data={"body": "Needs a crane", "is_internal": "true"})
    assert note.status_code == 201
    view = client.get(f"/portal/complaints/{cid}", headers=end_user).json()
    assert all(c["body"] != "Needs a crane" for c in view["comments"])
    assert all("internal" not in e["message"] for e in view["timeline"])

    assert act(client, agent, cid, "resolve").status_code == 400  # resolution required
    resolved = act(client, agent, cid, "resolve", "Transformer replaced").json()
    assert resolved["status"] == "RESOLVED" and resolved["acknowledged_at"] and resolved["resolved_at"]

    view = client.get(f"/portal/complaints/{cid}", headers=end_user).json()
    assert set(view["actions"]) == {"comment", "confirm", "reopen", "feedback"}
    closed = client.post(f"/portal/complaints/{cid}/confirm", headers=end_user,
                         json={"rating": 5, "comment": "Quick"}).json()
    assert closed["status"] == "CLOSED" and closed["feedback_rating"] == 5
    assert closed["actions"] == ["reopen"]
    assert client.post(f"/portal/complaints/{cid}/comments", headers=end_user, data={"body": "hi"}).status_code == 409

    reopened = client.post(f"/portal/complaints/{cid}/reopen", headers=end_user,
                           json={"reason": "Sparking again"}).json()
    assert reopened["status"] == "REOPENED" and reopened["reopen_count"] == 1
    again = detail(client, agent, cid)
    assert again["assignee"]["name"] == "Amit Kumar"  # same person keeps it
    assert "acknowledge" in [a["key"] for a in again["actions"]]


def test_only_the_handler_or_a_supervisor_can_act(client, login, end_user_login):
    cid = file_complaint(client, end_user_login(), title="Loose cable")
    other_agent = login(CITY_AGENT)  # covers Mansarovar too, but it's not theirs
    assert detail(client, other_agent, cid)["actions"] == []
    assert act(client, other_agent, cid, "acknowledge").status_code == 403

    agent = login(ELEC_AGENT)
    assert "reject" not in [a["key"] for a in detail(client, agent, cid)["actions"]]

    supervisor = login(ELEC_SUPERVISOR)
    view = detail(client, supervisor, cid)
    assert "acknowledge" in [a["key"] for a in view["actions"]] and "reject" in [a["key"] for a in view["actions"]]
    assert act(client, supervisor, cid, "reject").status_code == 400  # explanation required
    assert act(client, supervisor, cid, "reject", "Private property; not ours").status_code == 400  # reason required
    reason = view["rejection"]["reasons"][0]["id"]
    rejected = act(client, supervisor, cid, "reject", "Private property; not ours", reason).json()
    assert rejected["status"] == "REJECTED" and rejected["closed_at"]


def test_manual_reassignment_by_supervisor(client, login, end_user_login):
    cid = file_complaint(client, end_user_login(), title="Meter burnt")
    agent, supervisor = login(ELEC_AGENT), login(ELEC_SUPERVISOR)
    options = {o["name"]: o for o in client.get(f"/complaints/{cid}/assignee-options", headers=supervisor).json()}
    assert {"Amit Kumar", "Rohit Jain", "Priya Patel"} <= set(options)
    assert options["Amit Kumar"]["is_current"]
    assert "Karan Mehta" not in options  # Delhi agent: outside the complaint's scope

    assert client.post(f"/complaints/{cid}/assign", headers=agent,
                       json={"assignee_id": options["Rohit Jain"]["id"]}).status_code == 403

    moved = client.post(f"/complaints/{cid}/assign", headers=supervisor,
                        json={"assignee_id": options["Rohit Jain"]["id"], "reason": "Amit is on field duty"}).json()
    assert moved["assignee"]["name"] == "Rohit Jain" and moved["status"] == "ASSIGNED"
    assert [a["ended_at"] is None for a in moved["assignments"]] == [False, True]
    assert detail(client, agent, cid)["actions"] == []  # Amit can still see it but no longer handle it


def test_reclassification_moves_and_reroutes(client, login, end_user_login):
    end_user = end_user_login()
    cid = file_complaint(client, end_user, title="Actually a water leak")
    supervisor, manager = login(ELEC_SUPERVISOR), login(SUPER_ADMIN)
    before = detail(client, supervisor, cid)
    assert before["can_reclassify"] and before["assignee"]["name"] == "Amit Kumar"

    water, leakage = category_id(client, manager, "Water", "Leakage")
    priorities = {p["key"]: p["id"] for p in client.get("/priorities/", headers=manager).json()}
    payload = {"department_id": water, "category_id": leakage, "location_id": before["location_detail"]["id"],
               "priority_id": priorities["critical"], "reason": "Filed under the wrong department"}
    # the supervisor's scope is Electricity only
    assert client.post(f"/complaints/{cid}/reclassify", headers=supervisor, json=payload).status_code == 403
    assert client.post(f"/complaints/{cid}/reclassify", headers=manager,
                       json={**payload, "reason": ""}).status_code == 400
    moved = client.post(f"/complaints/{cid}/reclassify", headers=manager, json=payload)
    assert moved.status_code == 200, moved.text
    data = moved.json()
    assert data["department"] == "Water" and data["priority"]["name"] == "Critical"
    assert data["assignee"]["name"] == "Neha Singh"  # the Mansarovar water agent took over
    assert any(e["type"] == "reclassified" for e in data["timeline"])
    view = client.get(f"/portal/complaints/{cid}", headers=end_user).json()
    assert any("Water department" in e["message"] for e in view["timeline"])
    assert client.get(f"/complaints/{cid}", headers=supervisor).status_code == 404


def test_deactivating_staff_reroutes_their_complaints(client, login, end_user_login):
    admin = login(SUPER_ADMIN)
    roles = {r["key"]: r["id"] for r in client.get("/roles/", headers=admin).json()}
    electricity, _ = category_id(client, admin, "Electricity", "Other")
    ratanada = location_id(client, admin, "India", "Rajasthan", "Jodhpur", "Jodhpur", "Ratanada", portal=False)
    created = client.post("/users/", headers=admin, json={
        "name": "Ratanada Agent", "email": email("ratanada.agent"), "role_id": roles["agent"],
        "password": "Initial-Pass-1", "scopes": [{"department_id": electricity, "location_id": ratanada}],
    }).json()
    end_user = end_user_login("9876543213")  # Mohan Lal, Sardarpura (Jodhpur)
    cid = file_complaint(client, end_user, location=location_id(client, end_user, "India", "Rajasthan", "Jodhpur",
                                                                 "Jodhpur", "Ratanada"), title="Ratanada light")
    assert detail(client, admin, cid)["assignee"]["name"] == "Ratanada Agent"

    agent = first_login(client, email("ratanada.agent"), "Initial-Pass-1", "New-Password-2")
    assert client.post(f"/users/{created['id']}/deactivate", headers=admin).status_code == 200
    assert client.get("/auth/me", headers=agent).status_code == 401
    after = detail(client, admin, cid)
    assert after["assignee"] is None and after["status"] == "SUBMITTED"
    assert any(e["type"] == "unassigned" and "deactivated" in e["message"] for e in after["timeline"])


def test_agent_filters_and_stats(client, login):
    agent = login(ELEC_AGENT)
    mine = items(client.get("/complaints/", params={"assigned": "me"}, headers=agent))
    assert mine and all(c["assignee"]["name"] == "Amit Kumar" for c in mine)
    resolved = items(client.get("/complaints/", params={"group": "resolved"}, headers=agent))
    assert all(c["status"] in ("RESOLVED", "CLOSED") for c in resolved)
    assert client.get("/complaints/", params={"group": "nonsense"}, headers=agent).status_code == 400

    page = client.get("/complaints/", params={"page": 1, "page_size": 2}, headers=agent).json()
    assert len(page["items"]) <= 2 and page["total"] >= len(page["items"])

    stats = client.get("/complaints/admin/stats", headers=agent).json()
    m = stats["metrics"]
    assert m["open"] + m["in_progress"] + m["resolved"] + m["rejected"] == m["total"]
    assert stats["pending_summary"]["assigned_to_me"] >= 1
    assert len(stats["trend"]) == 7


def test_reclassifying_keeps_values_that_were_switched_off_since(client, login, end_user_login):
    root = login(SUPER_ADMIN)
    priorities = {p["key"]: p["id"] for p in client.get("/priorities/", headers=root).json()}
    created = client.post("/departments/", headers=root, json={
        "name": "Reclass Check", "code": "RECLASS", "categories": [
            {"name": "Old kind", "default_priority_id": priorities["low"]},
            {"name": "New kind", "default_priority_id": priorities["low"]},
        ]}).json()
    end_user = end_user_login()
    cid = file_complaint(client, end_user, department="Reclass Check", category="Old kind", title="Filed before the change")
    old = next(c for c in created["categories"] if c["name"] == "Old kind")
    switched_off = client.patch(f"/departments/{created['id']}/categories/{old['id']}", headers=root,
                                json={"is_active": False})
    assert switched_off.status_code == 200, switched_off.text

    before = detail(client, root, cid)
    changed = client.post(f"/complaints/{cid}/reclassify", headers=root, json={
        "department_id": before["department_id"], "category_id": before["category_id"],
        "location_id": before["location_detail"]["id"], "priority_id": priorities["high"],
        "reason": "More urgent than it looked"})
    assert changed.status_code == 200, changed.text
    assert (changed.json()["category"], changed.json()["priority"]["key"]) == ("Old kind", "high")


def test_classification_options_for_the_register_and_reclassify_forms(client, login):
    supervisor = login(ELEC_SUPERVISOR)  # can reclassify, but holds no department/location view permission
    options = client.get("/complaints/classification-options", headers=supervisor)
    assert options.status_code == 200, options.text
    body = options.json()
    electricity = next(d for d in body["departments"] if d["name"] == "Electricity")
    assert {c["name"] for c in electricity["categories"]} >= {"Street Light", "Fallen Pole"}
    assert all(c["default_priority"]["tone"] for c in electricity["categories"])
    assert body["locations"][0]["name"] == "India"
    assert [p["name"] for p in body["priorities"]][:4] == ["Critical", "High", "Medium", "Low"]
    agent = client.get("/complaints/classification-options", headers=login(ELEC_AGENT))
    assert agent.status_code == 403
