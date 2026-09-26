from conftest import ELEC_MANAGER, SUPER_ADMIN


def _roles(client, headers):
    return {r["key"]: r for r in client.get("/roles/", headers=headers).json()}


def test_end_user_role_sits_outside_the_staff_hierarchy(client, login):
    root = login(SUPER_ADMIN)
    roles = _roles(client, root)
    role = roles["end_user"]
    assert (role["name"], role["audience"], role["parent_id"]) == ("End User", "end_user", None)
    assert role["editable"] and not role["assignable"] and role["user_count"] >= 1
    assert role["permissions"] and all(p.startswith("portal.") for p in role["permissions"])
    # the Super Admin's implicit grants are staff permissions only
    assert not any(p.startswith("portal.") for p in roles["super_admin"]["permissions"])
    audience = {p["key"]: p["audience"] for p in client.get("/roles/permissions", headers=root).json()}
    assert audience["portal.complaint.reopen"] == "end_user" and audience["complaint.view"] == "staff"

    # never given to staff, never a parent, never mixed with staff permissions
    staff = client.post("/users/", headers=root, json={
        "name": "Portal Staff", "email": "portal.staff@civiccare.gov.in", "role_id": role["id"],
        "password": "Str0ngPass!", "scopes": [],
    })
    assert staff.status_code == 403
    under = client.post("/roles/", headers=root, json={"key": "kiosk", "name": "Kiosk", "parent_id": role["id"]})
    assert under.status_code == 400
    mixed = client.post("/roles/", headers=root, json={
        "key": "mixed", "name": "Mixed", "parent_id": roles["admin"]["id"], "permissions": ["portal.complaint.create"],
    })
    assert mixed.status_code == 400
    assert client.patch(f"/roles/{role['id']}", headers=root, json={"permissions": ["complaint.view"]}).status_code == 400
    assert client.patch(f"/roles/{role['id']}", headers=root, json={"parent_id": roles["admin"]["id"]}).status_code == 400
    assert client.delete(f"/roles/{role['id']}", headers=root).status_code == 400
    # editing it needs role.manage like any other role
    assert client.patch(f"/roles/{role['id']}", headers=login(ELEC_MANAGER), json={"name": "X"}).status_code == 403


def test_end_user_role_permissions_are_enforced(client, login, end_user_login):
    root = login(SUPER_ADMIN)
    role = _roles(client, root)["end_user"]
    end_user = end_user_login()

    me = client.get("/portal/me", headers=end_user).json()
    assert me["role"] == {"key": "end_user", "name": "End User"}
    assert sorted(me["permissions"]) == sorted(role["permissions"])

    open_complaint = next(c for c in client.get("/portal/complaints", headers=end_user).json()
                          if c["status_group"] in ("open", "in_progress"))
    detail_url = f"/portal/complaints/{open_complaint['id']}"
    assert "comment" in client.get(detail_url, headers=end_user).json()["actions"]

    kept = [p for p in role["permissions"]
            if p not in ("portal.complaint.comment", "portal.profile.update", "portal.complaint.attach")]
    assert client.patch(f"/roles/{role['id']}", headers=root, json={"permissions": kept}).status_code == 200
    try:
        # the change applies on the next request, and the portal stops offering the action
        assert "comment" not in client.get(detail_url, headers=end_user).json()["actions"]
        reply = client.post(f"{detail_url}/comments", headers=end_user, data={"body": "Any update?"})
        assert reply.status_code == 403
        assert client.put("/portal/profile", headers=end_user, json={"name": "Rahul"}).status_code == 403
        assert "portal.profile.update" not in client.get("/portal/me", headers=end_user).json()["permissions"]

        departments = client.get("/portal/departments", headers=end_user).json()
        with_file = client.post("/portal/complaints", headers=end_user, data={
            "department_id": departments[0]["id"], "title": "Photo attached", "description": "See photo",
        }, files={"files": ("photo.jpg", b"\xff\xd8\xff", "image/jpeg")})
        assert with_file.status_code == 403  # creating is still allowed, attaching is not
    finally:
        assert client.patch(f"/roles/{role['id']}", headers=root,
                            json={"permissions": role["permissions"]}).status_code == 200

    assert "comment" in client.get(detail_url, headers=end_user).json()["actions"]
