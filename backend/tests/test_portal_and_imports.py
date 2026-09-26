from conftest import ELEC_AGENT, ELEC_MANAGER, SUPER_ADMIN


def test_otp_requires_matching_mobile_and_email(client):
    wrong = client.post("/portal/auth/request-otp", json={"mobile": "9876543210", "email": "amit@example.com"})
    assert wrong.status_code == 404
    # formatting differences in the mobile number are tolerated
    ok = client.post("/portal/auth/request-otp", json={"mobile": "+91 98765-43211", "email": "AMIT@example.com"})
    assert ok.status_code == 200
    assert ok.json()["sent_to"].endswith("3211")
    # immediate resend is throttled
    again = client.post("/portal/auth/request-otp", json={"mobile": "9876543211", "email": "amit@example.com"})
    assert again.status_code == 429


def test_wrong_otp_is_rejected_and_attempts_are_limited(client):
    body = client.post("/portal/auth/request-otp", json={"mobile": "9876543213", "email": "mohan@example.com"}).json()
    wrong = "000000" if body["dev_otp"] != "000000" else "111111"
    for _ in range(4):
        assert client.post("/portal/auth/verify-otp", json={"challenge_id": body["challenge_id"], "otp": wrong}).status_code == 400
    # 5th wrong attempt exhausts the challenge; even the right code no longer works
    client.post("/portal/auth/verify-otp", json={"challenge_id": body["challenge_id"], "otp": wrong})
    right = client.post("/portal/auth/verify-otp", json={"challenge_id": body["challenge_id"], "otp": body["dev_otp"]})
    assert right.status_code == 400


def test_otp_needs_only_the_chosen_identifier_unless_it_is_shared(client, login):
    csv_body = (
        "user_id,name,mobile,email\n"
        "OTP-0,Neha Gupta,9811122200,neha@example.com\n"
        "OTP-1,Asha Verma,9811122211,asha@example.com\n"
        "OTP-2,Ravi Verma,9811122211,ravi@example.com\n"      # shares Asha's mobile
        "OTP-3,Pooja Singh,9811122233,singh@example.com\n"
        "OTP-4,Vikram Singh,9811122244,singh@example.com\n"   # shares Pooja's email
    )
    result = client.post("/end-users/import", headers=login(SUPER_ADMIN), files={"file": ("u.csv", csv_body)}).json()
    assert result["created"] == 5, result

    def request_otp(**payload):
        return client.post("/portal/auth/request-otp", json=payload)

    # the chosen channel's identifier is enough on its own, and required
    by_mobile = request_otp(mobile="+91 98111 22200", channel="sms")
    assert by_mobile.status_code == 200, by_mobile.text
    assert by_mobile.json()["sent_to"].endswith("2200")
    assert request_otp(mobile="9811122200", channel="email").status_code == 400
    assert request_otp(email="nobody@example.com", channel="email").status_code == 404

    # a shared identifier needs the other one as well
    assert request_otp(mobile="9811122211", channel="sms").status_code == 409
    assert request_otp(mobile="9811122211", email="asha@example.com", channel="sms").status_code == 200
    by_email = request_otp(email="RAVI@example.com", channel="email")
    assert by_email.status_code == 200 and by_email.json()["sent_to"] == "ra**@example.com"
    assert request_otp(email="singh@example.com", channel="email").status_code == 409
    assert request_otp(email="singh@example.com", mobile="9811122244", channel="email").status_code == 200


def test_end_user_sees_only_own_complaints_and_can_file_one(client, login, end_user_login):
    end_user = end_user_login()
    me = client.get("/portal/me", headers=end_user).json()
    assert me["name"] == "Rahul Sharma" and me["location"]["name"] == "Mansarovar"

    mine = client.get("/portal/complaints", headers=end_user).json()
    assert mine and all(c["end_user_name"] == "Rahul Sharma" for c in mine)

    departments = client.get("/portal/departments", headers=end_user).json()
    electricity = next(d for d in departments if d["name"] == "Electricity")
    created = client.post("/portal/complaints", headers=end_user, data={
        "department_id": electricity["id"],
        "category_id": electricity["categories"][0]["id"],
        "priority": "High",
        "title": "Street light flickering",
        "description": "Near the park gate",
    })
    assert created.status_code == 201, created.text
    complaint_id = created.json()["complaint_id"]

    svg = client.post("/portal/complaints", headers=end_user, data={
        "department_id": electricity["id"], "title": "x", "description": "y",
    }, files={"files": ("pic.svg", b"<svg onload='alert(1)'/>", "image/svg+xml")})
    assert svg.status_code == 400

    stats = client.get("/portal/complaints/stats", headers=end_user).json()
    assert stats["total"] == len(mine) + 1
    assert stats["open"] + stats["in_progress"] + stats["resolved"] + stats["rejected"] == stats["total"]

    # defaulted to the end user's own area, so it is routed to the Mansarovar electricity agent
    detail = client.get(f"/complaints/{complaint_id}", headers=login(ELEC_AGENT)).json()
    assert detail["status"] == "ASSIGNED" and detail["assignee"]["name"] == "Amit Kumar"


def test_tokens_do_not_cross_portals(client, login, end_user_login):
    end_user = end_user_login(mobile="9876543212", email="sunita@example.com")
    assert client.get("/complaints/", headers=end_user).status_code == 403
    assert client.get("/portal/complaints", headers=login(SUPER_ADMIN)).status_code == 403


def test_location_csv_import_builds_tree_and_reports_errors(client, login):
    admin = login(SUPER_ADMIN)
    csv_body = (
        "country,state,district,city,area\n"
        "India,Rajasthan,Jaipur,Jaipur,Mansarovar\n"       # already exists
        "India,Rajasthan,Jaipur,Jaipur,Jagatpura\n"        # 1 new node
        "India,Gujarat,Ahmedabad,Ahmedabad,Navrangpura\n"  # 4 new nodes
        "India,,Surat,Surat,Adajan\n"                      # gap -> error
    )
    result = client.post("/locations/import", headers=admin, files={"file": ("loc.csv", csv_body, "text/csv")}).json()
    assert result["created"] == 5
    assert result["unchanged"] == 1
    assert result["failed"] == 1 and result["errors"][0]["row"] == 5

    tree = client.get("/locations/tree", headers=admin).json()
    states = {s["name"] for s in tree[0]["children"]}
    assert "Gujarat" in states


def test_location_import_respects_scope(client, login):
    root = login(SUPER_ADMIN)
    roles = {r["key"]: r for r in client.get("/roles/", headers=root).json()}
    # let managers import locations, then check a Jaipur-scoped manager can't add outside Jaipur
    perms = roles["manager"]["permissions"] + ["location.import"]
    client.patch(f"/roles/{roles['manager']['id']}", headers=root, json={"permissions": perms})
    csv_body = (
        "country,state,district,city,area\n"
        "India,Rajasthan,Jaipur,Jaipur,Sanganer\n"
        "India,Rajasthan,Udaipur,Udaipur,Fatehpura\n"
    )
    result = client.post("/locations/import", headers=login(ELEC_MANAGER), files={"file": ("l.csv", csv_body)}).json()
    client.patch(f"/roles/{roles['manager']['id']}", headers=root, json={"permissions": roles["manager"]["permissions"]})
    assert result["created"] == 1
    assert result["errors"] == [{"row": 3, "message": "You cannot add locations under 'Rajasthan'"}]


def test_end_user_csv_import_creates_updates_and_validates(client, login, end_user_login):
    admin = login(SUPER_ADMIN)
    csv_body = (
        "user_id,name,mobile,email,country,state,district,city,area\n"
        "USR001,Rahul S. Sharma,9876543210,rahul@example.com,India,Rajasthan,Jaipur,Jaipur,Mansarovar\n"  # update
        "USR100,Kavita Joshi,+91 99887 76655,kavita@example.com,India,Rajasthan,Jaipur,Jaipur,Vaishali Nagar\n"
        "USR101,No Place,9988776656,noplace@example.com,India,Rajasthan,Jaipur,Jaipur,Atlantis\n"  # bad location
        "USR102,Bad Phone,12345,bad@example.com,India,,,,\n"
        "USR100,Dupe,9988776657,dupe@example.com,India,,,,\n"
    )
    result = client.post("/end-users/import", headers=admin, files={"file": ("u.csv", csv_body)}).json()
    assert (result["created"], result["updated"], result["failed"]) == (1, 1, 3), result
    messages = {e["row"]: e["message"] for e in result["errors"]}
    assert "not found" in messages[4]
    assert "10-digit" in messages[5]
    assert "Duplicate user_id" in messages[6]

    # the imported end user can now sign in with mobile + email
    end_user_login(mobile="9988776655", email="kavita@example.com")

    listing = client.get("/end-users/", params={"search": "Kavita"}, headers=admin).json()
    assert listing["total"] == 1 and listing["items"][0]["location"]["name"] == "Vaishali Nagar"


def test_end_user_listing_is_location_scoped(client, login):
    names = {u["name"] for u in client.get("/end-users/", params={"page_size": 100}, headers=login(ELEC_MANAGER)).json()["items"]}
    assert "Sunita Devi" not in names  # Delhi
    assert "Mohan Lal" not in names    # Jodhpur
    assert "Amit Kumar" in names       # Malviya Nagar, Jaipur
