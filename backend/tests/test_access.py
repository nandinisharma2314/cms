"""Role + permission + department + location + hierarchy -> access."""
from conftest import (
    ADMIN, DELHI_AGENT, ELEC_AGENT, ELEC_MANAGER, ELEC_SUPERVISOR, SUPER_ADMIN, WATER_AGENT, first_login, staff_login,
)
from factories import PASSWORD, email


def complaints_for(client, headers):
    response = client.get("/complaints/", params={"page_size": 100}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_unauthenticated_requests_are_rejected(client):
    for path in ("/complaints/", "/users/", "/roles/", "/departments/", "/end-users/", "/audit-logs/", "/settings/"):
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
    assert everything["total"] > 0

    agent = complaints_for(client, login(ELEC_AGENT))["items"]
    assert agent, "the factory should give the Mansarovar electricity agent some complaints"
    assert all(c["department"] == "Electricity" and c["location"] == "Mansarovar" for c in agent)

    water = complaints_for(client, login(WATER_AGENT))["items"]
    assert all(c["department"] == "Water" and c["location"] == "Mansarovar" for c in water)

    manager = complaints_for(client, login(ELEC_MANAGER))
    assert all(
        c["department"] == "Electricity" and c["location_detail"]["path_names"][:3] == ["India", "Rajasthan", "Jaipur"]
        for c in manager["items"]
    )
    assert manager["total"] > len(agent)

    delhi = complaints_for(client, login(DELHI_AGENT))["items"]
    assert all(c["department"] == "Electricity" and c["location_detail"]["path_names"][1] == "Delhi" for c in delhi)

    assert complaints_for(client, login(ADMIN))["total"] == everything["total"]


def test_stats_are_scoped(client, login):
    agent_stats = client.get("/complaints/admin/stats", headers=login(ELEC_AGENT)).json()
    assert agent_stats["metrics"]["total"] == complaints_for(client, login(ELEC_AGENT))["total"]
    assert {d["name"] for d in agent_stats["departments"]} <= {"Electricity"}
    assert agent_stats["pending_summary"]["total_users"] is None  # agents lack user.view


def test_out_of_scope_complaint_is_invisible_and_immutable(client, login):
    water_complaint = next(c for c in complaints_for(client, login(SUPER_ADMIN))["items"] if c["department"] == "Water")
    agent = login(ELEC_AGENT)
    assert client.get(f"/complaints/{water_complaint['id']}", headers=agent).status_code == 404
    response = client.post(f"/complaints/{water_complaint['id']}/actions", headers=agent,
                           json={"action": "resolve", "note": "x"})
    assert response.status_code == 404


def _scope_ids(client, headers, department, *location_names):
    departments = {d["name"]: d["id"] for d in client.get("/departments/", headers=headers).json()}
    parent_id = None
    node = None
    for name in location_names:
        url = f"/locations/nodes?parent_id={parent_id}" if parent_id else "/locations/nodes"
        nodes = client.get(url, headers=headers).json()
        node = next(n for n in nodes if n["name"] == name)
        parent_id = node["id"]
    return {"department_id": departments[department] if department else None, "location_id": node["id"] if node else None}


def test_quick_create_must_be_inside_scope(client, login):
    admin = login(SUPER_ADMIN)
    delhi_area = _scope_ids(client, admin, "Electricity", "India", "Delhi", "New Delhi", "New Delhi", "Karol Bagh")
    department = next(d for d in client.get("/departments/", headers=admin).json() if d["name"] == "Electricity")
    response = client.post("/complaints/quick-create", headers=login(ELEC_MANAGER), json={
        "title": "Streetlight out", "description": "Dark street", "department_id": department["id"],
        "category_id": department["categories"][0]["id"], "location_id": delhi_area["location_id"],
        "end_user_name": "Caller",
    })
    assert response.status_code == 403


def test_manager_creates_users_only_below_role_and_inside_scope(client, login):
    manager = login(ELEC_MANAGER)
    roles = {r["key"]: r for r in client.get("/users/assignable-roles", headers=manager).json()}
    assert "agent" in roles and "admin" not in roles
    all_roles = {r["key"]: r for r in client.get("/roles/", headers=manager).json()}

    in_scope = _scope_ids(client, manager, "Electricity", "India", "Rajasthan", "Jaipur", "Jaipur", "Vaishali Nagar")
    ok = client.post("/users/", headers=manager, json={
        "name": "New Agent", "email": email("new.agent"), "role_id": roles["agent"]["id"],
        "password": "Str0ngPass!", "scopes": [in_scope],
    })
    assert ok.status_code == 201, ok.text
    assert ok.json()["reports_to"] is None  # no manager was chosen

    wrong_department = _scope_ids(client, manager, "Water", "India", "Rajasthan", "Jaipur")
    assert client.post("/users/", headers=manager, json={
        "name": "Water Agent 2", "email": email("water2"), "role_id": roles["agent"]["id"],
        "password": "Str0ngPass!", "scopes": [wrong_department],
    }).status_code == 403

    assert client.post("/users/", headers=manager, json={
        "name": "Sneaky Admin", "email": email("sneaky"), "role_id": all_roles["admin"]["id"],
        "password": "Str0ngPass!", "scopes": [in_scope],
    }).status_code == 403

    visible = {u["email"] for u in client.get("/users/", params={"page_size": 100}, headers=manager).json()["items"]}
    assert {email("supervisor"), email("agent"), email("new.agent")} <= visible
    assert email("water.agent") not in visible
    assert email("admin") not in visible


def test_supervisor_cannot_create_users(client, login):
    supervisor = login(ELEC_SUPERVISOR)
    assert client.get("/users/assignable-roles", headers=supervisor).status_code == 403
    roles = {r["key"]: r for r in client.get("/roles/", headers=supervisor).json()}
    response = client.post("/users/", headers=supervisor, json={
        "name": "X", "email": email("x"), "role_id": roles["agent"]["id"], "password": "Str0ngPass!", "scopes": [],
    })
    assert response.status_code == 403


def test_new_accounts_must_change_their_password(client, login):
    admin = login(ADMIN)
    roles = {r["key"]: r for r in client.get("/users/assignable-roles", headers=admin).json()}
    scope = _scope_ids(client, admin, "Roads", "India")
    assert client.post("/users/", headers=admin, json={
        "name": "Fresh Agent", "email": email("fresh.agent"), "role_id": roles["agent"]["id"],
        "password": "Str0ngPass!", "scopes": [scope],
    }).status_code == 201
    headers = staff_login(client, email("fresh.agent"), "Str0ngPass!")
    assert client.get("/auth/me", headers=headers).json()["must_change_password"] is True
    assert client.get("/complaints/", headers=headers).status_code == 403  # nothing else until changed
    weak = client.post("/auth/change-password", headers=headers,
                       json={"current_password": "Str0ngPass!", "new_password": "short"})
    assert weak.status_code == 400
    same = client.post("/auth/change-password", headers=headers,
                       json={"current_password": "Str0ngPass!", "new_password": "Str0ngPass!"})
    assert same.status_code == 400
    fresh = first_login(client, email("fresh.agent"), "Str0ngPass!", "Better-Pass-9")
    assert client.get("/complaints/", headers=fresh).status_code == 200
    # the old token was invalidated by the change
    assert client.get("/auth/me", headers=headers).status_code == 401


def test_deactivated_user_is_locked_out(client, login):
    from conftest import CLIENT_HEADERS, new_client

    admin = login(ADMIN)
    roles = {r["key"]: r for r in client.get("/users/assignable-roles", headers=admin).json()}
    scope = _scope_ids(client, admin, "Roads", "India")
    created = client.post("/users/", headers=admin, json={
        "name": "Temp Agent", "email": email("temp.agent"), "role_id": roles["agent"]["id"],
        "password": "Str0ngPass!", "scopes": [scope],
    }).json()
    own = new_client()
    token = first_login(own, email("temp.agent"), "Str0ngPass!", "Temp-Agent-Pass-2")
    assert own.get("/auth/me", headers=token).status_code == 200
    assert own.post("/auth/refresh", params={"principal": "staff"}, headers=CLIENT_HEADERS).status_code == 200

    assert client.post(f"/users/{created['id']}/deactivate", headers=admin).status_code == 200
    assert own.get("/auth/me", headers=token).status_code == 401
    assert own.post("/auth/refresh", params={"principal": "staff"}, headers=CLIENT_HEADERS).status_code == 401
    assert own.post("/auth/login", json={"identifier": email("temp.agent"),
                                         "password": "Temp-Agent-Pass-2"}).status_code == 403


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

    client.patch(f"/roles/{roles['supervisor']['id']}", headers=root, json={"parent_id": roles["manager"]["id"]})
    assert client.delete(f"/roles/{regional.json()['id']}", headers=root).status_code == 200


def test_role_managers_can_save_roles_holding_grants_they_lack(client, login):
    root = login(SUPER_ADMIN)
    roles = {r["key"]: r for r in client.get("/roles/", headers=root).json()}
    admin_perms = roles["admin"]["permissions"]
    assert client.patch(f"/roles/{roles['admin']['id']}", headers=root,
                        json={"permissions": admin_perms + ["role.manage"]}).status_code == 200
    try:
        admin = staff_login(client, ADMIN, PASSWORD)
        agent = roles["agent"]
        # the agent role holds complaint.receive, which admins do not: saving it unchanged works
        unchanged = client.patch(f"/roles/{agent['id']}", headers=admin, json={"permissions": agent["permissions"]})
        assert unchanged.status_code == 200, unchanged.text
        # adding or removing a grant the admin lacks is refused
        added = client.patch(f"/roles/{agent['id']}", headers=admin,
                             json={"permissions": agent["permissions"] + ["location.import"]})
        assert added.status_code == 403
        removed = [p for p in agent["permissions"] if p != "complaint.receive"]
        assert client.patch(f"/roles/{agent['id']}", headers=admin, json={"permissions": removed}).status_code == 403
        assert client.patch(f"/roles/{roles['admin']['id']}", headers=admin, json={"name": "Boss"}).status_code == 403
        assert client.patch(f"/roles/{agent['id']}", headers=admin,
                            json={"permissions": agent["permissions"] + ["nope.nothing"]}).status_code == 400
    finally:
        client.patch(f"/roles/{roles['admin']['id']}", headers=root, json={"permissions": admin_perms})


def test_password_login_rejects_bad_credentials_and_locks_out(client):
    from conftest import new_client

    own = new_client()
    assert own.post("/auth/login", json={"identifier": ADMIN, "password": "wrong"}).status_code == 401
    assert own.post("/auth/login", json={"identifier": email("nobody"), "password": PASSWORD}).status_code == 401
    target = email("water.district")
    for _ in range(5):
        assert own.post("/auth/login", json={"identifier": target, "password": "wrong"}).status_code == 401
    locked = own.post("/auth/login", json={"identifier": target, "password": PASSWORD})
    assert locked.status_code == 429
    # the lock is on the account, however it is typed (Farhan's mobile is 9876500008)
    for spelling in (target.upper(), "9876500008", "+91 98765-00008"):
        assert own.post("/auth/login", json={"identifier": spelling, "password": PASSWORD}).status_code == 429
    # mobile numbers work as identifiers too
    assert own.post("/auth/login", json={"identifier": "+91 98765 00004", "password": PASSWORD}).status_code == 200
