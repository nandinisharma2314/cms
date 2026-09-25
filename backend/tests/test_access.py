"""Role + permission + department + location + hierarchy -> access."""
from conftest import (
    ADMIN, DELHI_AGENT, ELEC_AGENT, ELEC_MANAGER, ELEC_SUPERVISOR, PASSWORD, SUPER_ADMIN, WATER_AGENT,
)


def complaints_for(client, headers):
    response = client.get("/complaints/", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_unauthenticated_requests_are_rejected(client):
    for path in ("/complaints/", "/users/", "/roles/", "/departments/", "/end-users/", "/audit-logs/"):
        assert client.get(path).status_code == 401, path


def test_me_reports_permissions_and_scopes(client, login):
    me = client.get("/auth/me", headers=login(ELEC_AGENT)).json()
    assert me["role"]["key"] == "agent"
    assert "complaint.view" in me["permissions"]
    assert "user.create" not in me["permissions"]
    assert [s["department"]["name"] for s in me["scopes"]] == ["Electricity"]
    assert me["scopes"][0]["location"]["path_names"][-1] == "Mansarovar"


def test_complaints_are_filtered_by_department_and_location(client, login):
    everything = complaints_for(client, login(SUPER_ADMIN))
    assert everything

    agent = complaints_for(client, login(ELEC_AGENT))
    assert agent, "seed should give the Mansarovar electricity agent some complaints"
    assert all(c["department"] == "Electricity" and c["location"] == "Mansarovar" for c in agent)

    water = complaints_for(client, login(WATER_AGENT))
    assert all(c["department"] == "Water" and c["location"] == "Mansarovar" for c in water)

    manager = complaints_for(client, login(ELEC_MANAGER))
    assert all(
        c["department"] == "Electricity" and c["location_detail"]["path_names"][:3] == ["India", "Rajasthan", "Jaipur"]
        for c in manager
    )
    assert len(manager) > len(agent)

    delhi = complaints_for(client, login(DELHI_AGENT))
    assert all(c["department"] == "Electricity" and c["location_detail"]["path_names"][1] == "Delhi" for c in delhi)

    assert len(complaints_for(client, login(ADMIN))) == len(everything)


def test_stats_are_scoped(client, login):
    agent_stats = client.get("/complaints/admin/stats", headers=login(ELEC_AGENT)).json()
    agent_total = len(complaints_for(client, login(ELEC_AGENT)))
    assert agent_stats["metrics"]["total"] == agent_total
    assert {d["name"] for d in agent_stats["departments"]} <= {"Electricity"}
    assert agent_stats["pending_summary"]["total_users"] is None  # agents lack user.view


def test_out_of_scope_complaint_is_invisible_and_immutable(client, login):
    water_complaint = next(c for c in complaints_for(client, login(SUPER_ADMIN)) if c["department"] == "Water")
    agent = login(ELEC_AGENT)
    assert client.get(f"/complaints/{water_complaint['id']}", headers=agent).status_code == 404
    response = client.post(f"/complaints/{water_complaint['id']}/actions", json={"action": "resolve", "note": "x"}, headers=agent)
    assert response.status_code == 404


def test_quick_create_must_be_inside_scope(client, login):
    admin = login(SUPER_ADMIN)
    departments = {d["name"]: d for d in client.get("/departments/", headers=admin).json()}
    tree = client.get("/locations/tree", headers=admin).json()
    india = tree[0]
    delhi_area = india["children"][0]["children"][0]["children"][0]["children"][0]  # Delhi > ... > first area
    manager = login(ELEC_MANAGER)
    response = client.post("/complaints/quick-create", headers=manager, json={
        "title": "Streetlight out", "department_id": departments["Electricity"]["id"], "location_id": delhi_area["id"],
    })
    assert response.status_code == 403


def _scope_ids(client, headers, department, *location_names):
    departments = {d["name"]: d["id"] for d in client.get("/departments/", headers=headers).json()}
    nodes = client.get("/locations/tree", headers=headers).json()
    node = None
    for name in location_names:
        node = next(n for n in nodes if n["name"] == name)
        nodes = node["children"]
    return {"department_id": departments[department] if department else None, "location_id": node["id"] if node else None}


def test_manager_creates_users_only_below_role_and_inside_scope(client, login):
    manager = login(ELEC_MANAGER)
    roles = {r["key"]: r for r in client.get("/roles/", headers=manager).json()}
    assert roles["agent"]["assignable"] and not roles["admin"]["assignable"]

    in_scope = _scope_ids(client, manager, "Electricity", "India", "Rajasthan", "Jaipur", "Jaipur", "Vaishali Nagar")
    ok = client.post("/users/", headers=manager, json={
        "name": "New Agent", "email": "new.agent@civiccare.gov.in", "role_id": roles["agent"]["id"],
        "password": "Str0ngPass!", "scopes": [in_scope],
    })
    assert ok.status_code == 201, ok.text
    assert ok.json()["reports_to"] is None  # manager is not the agent role's direct parent

    wrong_department = _scope_ids(client, manager, "Water", "India", "Rajasthan", "Jaipur")
    assert client.post("/users/", headers=manager, json={
        "name": "Water Agent 2", "email": "water2@civiccare.gov.in", "role_id": roles["agent"]["id"],
        "password": "Str0ngPass!", "scopes": [wrong_department],
    }).status_code == 403

    assert client.post("/users/", headers=manager, json={
        "name": "Sneaky Admin", "email": "sneaky@civiccare.gov.in", "role_id": roles["admin"]["id"],
        "password": "Str0ngPass!", "scopes": [in_scope],
    }).status_code == 403

    visible = {u["email"] for u in client.get("/users/", headers=manager).json()}
    assert {"supervisor@civiccare.gov.in", "agent@civiccare.gov.in", "new.agent@civiccare.gov.in"} <= visible
    assert "water.agent@civiccare.gov.in" not in visible
    assert "admin@civiccare.gov.in" not in visible


def test_supervisor_cannot_create_users(client, login):
    supervisor = login(ELEC_SUPERVISOR)
    roles = {r["key"]: r for r in client.get("/roles/", headers=supervisor).json()}
    response = client.post("/users/", headers=supervisor, json={
        "name": "X", "email": "x@civiccare.gov.in", "role_id": roles["agent"]["id"],
        "password": "Str0ngPass!", "scopes": [],
    })
    assert response.status_code == 403


def test_deactivated_user_is_locked_out(client, login):
    admin = login(ADMIN)
    roles = {r["key"]: r for r in client.get("/roles/", headers=admin).json()}
    scope = _scope_ids(client, admin, "Roads", "India")
    created = client.post("/users/", headers=admin, json={
        "name": "Temp Agent", "email": "temp.agent@civiccare.gov.in", "role_id": roles["agent"]["id"],
        "password": "Str0ngPass!", "scopes": [scope],
    }).json()
    login_response = client.post("/auth/login", json={"email": "temp.agent@civiccare.gov.in", "password": "Str0ngPass!"})
    token = {"Authorization": f"Bearer {login_response.json()['access_token']}"}
    assert client.get("/auth/me", headers=token).status_code == 200

    assert client.post(f"/users/{created['id']}/deactivate", headers=admin).status_code == 200
    assert client.get("/auth/me", headers=token).status_code == 401
    refresh = client.post("/auth/refresh", json={"refresh_token": login_response.json()["refresh_token"]})
    assert refresh.status_code == 401
    assert client.post("/auth/login", json={"email": "temp.agent@civiccare.gov.in", "password": "Str0ngPass!"}).status_code == 403


def test_role_hierarchy_can_gain_a_level_without_code_changes(client, login):
    root = login(SUPER_ADMIN)
    roles = {r["key"]: r for r in client.get("/roles/", headers=root).json()}
    regional = client.post("/roles/", headers=root, json={
        "key": "regional_manager", "name": "Regional Manager", "parent_id": roles["manager"]["id"],
        "permissions": ["complaint.view", "user.view"],
    })
    assert regional.status_code == 201, regional.text
    moved = client.patch(f"/roles/{roles['supervisor']['id']}", headers=root, json={"parent_id": regional.json()["id"]})
    assert moved.status_code == 200 and moved.json()["parent_id"] == regional.json()["id"]

    # Manager -> Regional Manager -> Supervisor -> Agent: the manager still manages agents
    assignable = {r["key"] for r in client.get("/roles/", headers=login(ELEC_MANAGER)).json() if r["assignable"]}
    assert {"regional_manager", "supervisor", "agent"} <= assignable

    cycle = client.patch(f"/roles/{roles['manager']['id']}", headers=root, json={"parent_id": roles["agent"]["id"]})
    assert cycle.status_code == 400

    # restore
    client.patch(f"/roles/{roles['supervisor']['id']}", headers=root, json={"parent_id": roles["manager"]["id"]})
    assert client.delete(f"/roles/{regional.json()['id']}", headers=root).status_code == 200


def test_admin_cannot_grant_permissions_they_lack(client, login):
    root = login(SUPER_ADMIN)
    roles = {r["key"]: r for r in client.get("/roles/", headers=root).json()}
    # give admin role.manage so it can try
    admin_perms = roles["admin"]["permissions"] + ["role.manage"]
    assert client.patch(f"/roles/{roles['admin']['id']}", headers=root, json={"permissions": admin_perms}).status_code == 200
    admin = login(ADMIN)
    response = client.patch(f"/roles/{roles['agent']['id']}", headers=admin, json={
        "permissions": roles["agent"]["permissions"] + ["location.import"],
    })
    assert response.status_code == 403
    assert client.patch(f"/roles/{roles['admin']['id']}", headers=admin, json={"name": "Boss"}).status_code == 403
    client.patch(f"/roles/{roles['admin']['id']}", headers=root, json={"permissions": roles["admin"]["permissions"]})


def test_password_login_rejects_bad_credentials(client):
    assert client.post("/auth/login", json={"email": ADMIN, "password": "wrong"}).status_code == 401
    assert client.post("/auth/login", json={"email": "nobody@x.com", "password": PASSWORD}).status_code == 401
