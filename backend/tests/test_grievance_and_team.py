"""Tests for staff grievances, anti-conflict isolation, team management, and custom permissions."""
from conftest import (
    ADMIN, CITY_AGENT, ELEC_AGENT, ELEC_MANAGER, ELEC_SUPERVISOR, first_login,
)
from factories import PASSWORD


def test_file_grievance_and_anti_conflict(client, login):
    # 1. ELEC_AGENT files a grievance naming ELEC_SUPERVISOR (their immediate boss)
    agent_headers = login(ELEC_AGENT)
    options = client.get("/grievances/options", headers=agent_headers).json()
    assert "categories" in options
    assert "harassment" in options["categories"]

    # Find ELEC_SUPERVISOR user ID
    supervisor_info = next(c for c in options["colleagues"] if "Priya" in c["name"])
    supervisor_id = supervisor_info["id"]

    res = client.post(
        "/grievances/",
        data={
            "subject": "Unfair workload and hostility",
            "description": "Supervisor has been assigning unreasonable demands and hostile remarks.",
            "target_type": "superior",
            "category": "harassment",
            "severity": "high",
            "is_anonymous": "false",
            "accused_user_id": str(supervisor_id),
        },
        headers=agent_headers,
    )
    assert res.status_code == 201, res.text
    grievance = res.json()
    tracking_id = grievance["tracking_id"]
    assert tracking_id.startswith("GRV-")
    assert grievance["status"] == "submitted"
    assert grievance["reporter"]["email"] == ELEC_AGENT

    # 2. Anti-conflict: Accused supervisor CANNOT view this grievance
    supervisor_headers = login(ELEC_SUPERVISOR)
    blocked_get = client.get(f"/grievances/{tracking_id}", headers=supervisor_headers)
    assert blocked_get.status_code == 403
    assert "conflict of interest" in blocked_get.json()["detail"].lower()

    # Accused supervisor listing grievances should NOT see it
    sup_list = client.get("/grievances/?view=my_filed", headers=supervisor_headers).json()
    assert all(item["tracking_id"] != tracking_id for item in sup_list["items"])

    # 3. Anti-conflict: Subordinate of accused supervisor CANNOT view this grievance
    # CITY_AGENT reports to ELEC_SUPERVISOR
    city_agent_headers = login(CITY_AGENT)
    sub_blocked = client.get(f"/grievances/{tracking_id}", headers=city_agent_headers)
    assert sub_blocked.status_code == 403

    # 4. Reporter can view their own grievance
    reporter_get = client.get(f"/grievances/{tracking_id}", headers=agent_headers)
    assert reporter_get.status_code == 200
    assert reporter_get.json()["tracking_id"] == tracking_id

    # 5. ELEC_MANAGER (superior to the accused supervisor) can view it
    manager_headers = login(ELEC_MANAGER)
    manager_get = client.get(f"/grievances/{tracking_id}", headers=manager_headers)
    assert manager_get.status_code == 200

    # 6. Cannot assign the accused or accused's subordinate as investigator
    admin_headers = login(ADMIN)
    cannot_assign_accused = client.post(
        f"/grievances/{tracking_id}/assign",
        json={"investigator_id": supervisor_id},
        headers=admin_headers,
    )
    assert cannot_assign_accused.status_code == 400
    assert "cannot assign" in cannot_assign_accused.json()["detail"].lower()

    # 7. Assign ELEC_MANAGER as investigator
    elec_manager_id = next(c["id"] for c in options["colleagues"] if "Vikram" in c["name"])
    assign_res = client.post(
        f"/grievances/{tracking_id}/assign",
        json={"investigator_id": elec_manager_id, "note": "Assigned to department head for inquiry"},
        headers=admin_headers,
    )
    assert assign_res.status_code == 200
    assert assign_res.json()["assigned_investigator"]["id"] == elec_manager_id

    # 8. Add confidential note by investigator / admin
    note_res = client.post(
        f"/grievances/{tracking_id}/notes",
        json={"note": "Confidential witness statement taken", "is_confidential": True},
        headers=manager_headers,
    )
    assert note_res.status_code == 200

    # Reporter should NOT see confidential notes
    reporter_view = client.get(f"/grievances/{tracking_id}", headers=agent_headers).json()
    assert not any(e.get("note") == "Confidential witness statement taken" for e in reporter_view["events"])

    # Investigator DOES see confidential notes
    investigator_view = client.get(f"/grievances/{tracking_id}", headers=manager_headers).json()
    assert any(e.get("note") == "Confidential witness statement taken" for e in investigator_view["events"])

    # 9. Update status through resolution
    status_res = client.post(
        f"/grievances/{tracking_id}/status",
        json={
            "status": "investigating",
            "message": "Formal inquiry ongoing",
        },
        headers=manager_headers,
    )
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "investigating"

    resolve_res = client.post(
        f"/grievances/{tracking_id}/status",
        json={
            "status": "resolved",
            "message": "Mediation conducted and corrective action taken",
            "resolution_summary": "Supervisor counselled; team rebalancing completed.",
        },
        headers=manager_headers,
    )
    assert resolve_res.status_code == 200
    assert resolve_res.json()["status"] == "resolved"
    assert resolve_res.json()["resolution_summary"] is not None


def test_anonymous_grievance_masking(client, login):
    agent_headers = login(ELEC_AGENT)
    res = client.post(
        "/grievances/",
        data={
            "subject": "Suspected procurement irregularity",
            "description": "Materials received without standard quality audit stamps.",
            "target_type": "department",
            "category": "policy_violation",
            "severity": "medium",
            "is_anonymous": "true",
        },
        headers=agent_headers,
    )
    assert res.status_code == 201, res.text
    tracking_id = res.json()["tracking_id"]
    assert res.json()["is_anonymous"] is True

    # Reporter themselves sees their own info in their own detail view
    reporter_view = client.get(f"/grievances/{tracking_id}", headers=agent_headers).json()
    assert reporter_view["is_anonymous"] is True
    assert reporter_view["reporter"] is not None
    assert reporter_view["reporter"]["email"] == ELEC_AGENT

    # Manager (non-super-admin investigator) viewing anonymous grievance: reporter is masked
    manager_headers = login(ELEC_MANAGER)
    manager_view = client.get(f"/grievances/{tracking_id}", headers=manager_headers).json()
    assert manager_view["is_anonymous"] is True
    assert manager_view["reporter"]["name"] == "Anonymous Staff Member"
    assert manager_view["reporter"]["email"] is None


def test_team_portal_dashboard_and_availability(client, login):
    # ELEC_SUPERVISOR should see their direct reports: ELEC_AGENT and CITY_AGENT
    supervisor_headers = login(ELEC_SUPERVISOR)
    dash = client.get("/team/dashboard", headers=supervisor_headers)
    assert dash.status_code == 200, dash.text
    data = dash.json()
    assert "aggregate" in data
    assert "members" in data
    assert len(data["members"]) >= 2

    agent_member = next((m for m in data["members"] if m["email"] == ELEC_AGENT), None)
    assert agent_member is not None
    assert agent_member["role"] == "Agent"
    agent_id = agent_member["id"]

    # Toggle agent availability (e.g. mark On Leave / Unavailable)
    toggle_res = client.post(
        f"/team/members/{agent_id}/availability",
        json={"is_available": False},
        headers=supervisor_headers,
    )
    assert toggle_res.status_code == 200
    assert toggle_res.json()["is_available"] is False

    # Restore availability
    restore_res = client.post(
        f"/team/members/{agent_id}/availability",
        json={"is_available": True},
        headers=supervisor_headers,
    )
    assert restore_res.status_code == 200
    assert restore_res.json()["is_available"] is True


def test_team_workload_reassignment(client, login):
    supervisor_headers = login(ELEC_SUPERVISOR)
    dash = client.get("/team/dashboard", headers=supervisor_headers).json()
    agent_member = next(m for m in dash["members"] if m["email"] == ELEC_AGENT)
    city_agent_member = next(m for m in dash["members"] if m["email"] == CITY_AGENT)

    agent_id = agent_member["id"]
    city_agent_id = city_agent_member["id"]

    # Get complaints for agent
    complaints_res = client.get(f"/team/members/{agent_id}/complaints", headers=supervisor_headers)
    assert complaints_res.status_code == 200
    complaints = complaints_res.json()

    if not complaints:
        # If no complaints currently assigned to agent, assign one to test reassignment
        admin_headers = login(ADMIN)
        all_c = client.get("/complaints/", params={"page_size": 10}, headers=admin_headers).json()
        target_c = all_c["items"][0]
        # Assign to agent
        client.post(f"/complaints/{target_c['id']}/assign", json={"assigned_to_id": agent_id}, headers=admin_headers)
        complaint_id = target_c["id"]
    else:
        complaint_id = complaints[0]["id"]

    # Reassign to CITY_AGENT
    reassign_res = client.post(
        "/team/reassign",
        json={
            "complaint_id": str(complaint_id),
            "new_assignee_id": city_agent_id,
            "reason": "Workload balancing across team members",
        },
        headers=supervisor_headers,
    )
    assert reassign_res.status_code == 200, reassign_res.text
    updated_complaint = reassign_res.json()
    assert updated_complaint["assignee"]["id"] == city_agent_id


def test_user_management_with_primary_workplace_and_custom_permissions(client, login):
    admin_headers = login(ADMIN)
    depts = client.get("/departments/", headers=admin_headers).json()
    elec_dept = next(d for d in depts if d["name"] == "Electricity")

    # Get roles
    roles = client.get("/roles/", headers=admin_headers).json()
    agent_role = next(r for r in roles if r["key"] == "agent")

    # Look up location
    loc_tree = client.get("/locations/nodes", headers=admin_headers).json()
    test_loc = loc_tree[0]

    unique_email = "custom.perms.agent@example.test"
    unique_mobile = "9876599999"
    initial_password = "InitialPassword#123"

    # Create an agent with custom permission: grant "team.view" (not normally granted to agents)
    create_res = client.post(
        "/users/",
        json={
            "name": "Custom Perms Agent",
            "email": unique_email,
            "mobile": unique_mobile,
            "password": initial_password,
            "role_id": agent_role["id"],
            "primary_department_id": elec_dept["id"],
            "primary_location_id": test_loc["id"],
            "custom_permissions": [
                {"permission_key": "team.view", "is_granted": True},
            ],
        },
        headers=admin_headers,
    )
    assert create_res.status_code == 201

    assert create_res.status_code == 201, create_res.text
    created = create_res.json()
    assert created["primary_department"]["id"] == elec_dept["id"]
    assert created["primary_location"]["id"] == test_loc["id"]
    assert any(cp["key"] == "team.view" and cp["is_granted"] is True for cp in created["custom_permissions"])

    # Sign in as the new user and change password (app requires password change on first login)
    new_user_headers = first_login(client, unique_email, initial_password, "NewSecurePassword#123")

    me = client.get("/auth/me", headers=new_user_headers).json()
    assert me["role"]["key"] == "agent"
    assert "team.view" in me["permissions"], "Custom permission grant should be present in /auth/me"

    # Admin updates user: revoke "complaint.view" via PATCH
    user_id = created["id"]
    update_res = client.patch(
        f"/users/{user_id}",
        json={
            "custom_permissions": [
                {"permission_key": "team.view", "is_granted": True},
                {"permission_key": "complaint.view", "is_granted": False},
            ],
        },
        headers=admin_headers,
    )
    assert update_res.status_code == 200, update_res.text

    # Re-check /auth/me
    me_updated = client.get("/auth/me", headers=new_user_headers).json()
    assert "team.view" in me_updated["permissions"]
    assert "complaint.view" not in me_updated["permissions"], "Explicitly revoked permission must be removed"


    # Deactivate the agent so it doesn't interfere with other tests
    client.post(f"/users/{user_id}/deactivate", headers=admin_headers)


def test_input_field_validations(client, login):
    agent_headers = login(ELEC_AGENT)
    admin_headers = login(ADMIN)

    # 1. Staff login input validations
    empty_id_res = client.post("/auth/login", json={"identifier": "   ", "password": PASSWORD})
    assert empty_id_res.status_code == 400
    assert "required" in empty_id_res.json()["detail"].lower()

    empty_pw_res = client.post("/auth/login", json={"identifier": ELEC_AGENT, "password": ""})
    assert empty_pw_res.status_code == 400
    assert "required" in empty_pw_res.json()["detail"].lower()

    # 2. Grievance subject too long (> 200 chars)
    long_subject_res = client.post(
        "/grievances/",
        data={
            "subject": "A" * 201,
            "description": "Valid description",
            "target_type": "other",
            "category": "other",
            "severity": "low",
        },
        headers=agent_headers,
    )
    assert long_subject_res.status_code == 400
    assert "too long" in long_subject_res.json()["detail"].lower()

    # 3. Grievance incident date in the future
    from datetime import date, timedelta
    future_date = (date.today() + timedelta(days=10)).isoformat()
    future_date_res = client.post(
        "/grievances/",
        data={
            "subject": "Valid subject",
            "description": "Valid description",
            "target_type": "other",
            "category": "other",
            "severity": "low",
            "incident_date": future_date,
        },
        headers=agent_headers,
    )
    assert future_date_res.status_code == 400
    assert "cannot be in the future" in future_date_res.json()["detail"].lower()

    # 4. Valid grievance creation
    grv_res = client.post(
        "/grievances/",
        data={
            "subject": "Valid Subject For Validation Tests",
            "description": "Valid description for testing",
            "target_type": "other",
            "category": "other",
            "severity": "low",
        },
        headers=agent_headers,
    )
    assert grv_res.status_code == 201
    tracking_id = grv_res.json()["tracking_id"]

    # 5. Grievance note too long (> 3000 chars)
    long_note_res = client.post(
        f"/grievances/{tracking_id}/notes",
        json={"note": "N" * 3001},
        headers=admin_headers,
    )
    assert long_note_res.status_code == 400
    assert "too long" in long_note_res.json()["detail"].lower()

    # 6. Grievance status message too long (> 500 chars)
    long_msg_res = client.post(
        f"/grievances/{tracking_id}/status",
        json={"status": "under_review", "message": "M" * 501},
        headers=admin_headers,
    )
    assert long_msg_res.status_code == 400
    assert "too long" in long_msg_res.json()["detail"].lower()

    # 7. Team reassign complaint reason too long (> 255 chars)
    # Find an open complaint
    complaint_res = client.get("/complaints/", headers=admin_headers)
    assert complaint_res.status_code == 200
    items = complaint_res.json()["items"]
    if items:
        cid = items[0]["id"]
        # Try reassigning with reason > 255 chars
        long_reassign_res = client.post(
            "/team/reassign",
            json={
                "complaint_id": cid,
                "new_assignee_id": 1,
                "reason": "R" * 256,
            },
            headers=admin_headers,
        )
        assert long_reassign_res.status_code == 400
        assert "too long" in long_reassign_res.json()["detail"].lower()
