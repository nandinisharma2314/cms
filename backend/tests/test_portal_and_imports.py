from conftest import CLIENT_HEADERS, ELEC_AGENT, ELEC_MANAGER, SUPER_ADMIN, new_client
from test_workflow import file_complaint

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64


def request_otp(client, **payload):
    return client.post("/portal/auth/request-otp", json=payload)


def test_unknown_identifiers_get_the_same_answer(client, monkeypatch):
    import config
    from database import SessionLocal
    from models import OtpChallenge

    monkeypatch.setattr(config, "OTP_RESEND_COOLDOWN_SECONDS", 30)
    with SessionLocal() as db:  # earlier sign-ins as this end user would trip the cooldown
        db.query(OtpChallenge).filter(OtpChallenge.target == "9876543211").delete()
        db.commit()
    own = new_client()
    known = request_otp(own, channel="sms", identifier="+91 98765-43211")
    unknown = request_otp(own, channel="sms", identifier="9000000999")
    assert known.status_code == unknown.status_code == 200
    assert set(known.json()) - {"dev_otp"} == set(unknown.json())
    assert known.json()["sent_to"].endswith("3211")
    assert "dev_otp" not in unknown.json()  # nothing was sent
    # a decoy never verifies, whatever the code
    for code in ("000000", "123456"):
        wrong = own.post("/portal/auth/verify-otp", json={"challenge_id": unknown.json()["challenge_id"], "otp": code})
        assert wrong.status_code == 400
    # an immediate resend is throttled
    assert request_otp(own, channel="sms", identifier="9876543211").status_code == 429
    # malformed identifiers are rejected before anything else
    assert request_otp(own, channel="sms", identifier="12345").status_code == 400
    assert request_otp(own, channel="email", identifier="not-an-email").status_code == 400
    assert request_otp(own, channel="fax", identifier="9876543211").status_code == 400


def test_wrong_otp_is_rejected_and_attempts_are_limited(client):
    own = new_client()
    body = request_otp(own, channel="sms", identifier="9876543213").json()
    wrong = "000000" if body["dev_otp"] != "000000" else "111111"
    for _ in range(4):
        response = own.post("/portal/auth/verify-otp", json={"challenge_id": body["challenge_id"], "otp": wrong})
        assert response.status_code == 400
    # 5th wrong attempt exhausts the challenge; even the right code no longer works
    own.post("/portal/auth/verify-otp", json={"challenge_id": body["challenge_id"], "otp": wrong})
    right = own.post("/portal/auth/verify-otp", json={"challenge_id": body["challenge_id"], "otp": body["dev_otp"]})
    assert right.status_code == 400


def test_shared_identifier_lets_the_person_pick_their_account(client, login):
    csv_body = (
        "user_id,name,mobile,email\n"
        "OTP-1,Asha Verma,9811122211,asha@example.test\n"
        "OTP-2,Ravi Verma,9811122211,ravi@example.test\n"      # shares Asha's mobile
    )
    result = client.post("/end-users/import", headers=login(SUPER_ADMIN), data={"dry_run": "false"},
                         files={"file": ("u.csv", csv_body)}).json()
    assert result["created"] == 2, result

    own = new_client()
    body = request_otp(own, channel="sms", identifier="9811122211").json()
    verified = own.post("/portal/auth/verify-otp", json={"challenge_id": body["challenge_id"], "otp": body["dev_otp"]})
    assert verified.status_code == 200
    choice = verified.json()
    assert "access_token" not in choice
    assert {a["name"] for a in choice["accounts"]} == {"Asha Verma", "Ravi Verma"}
    ravi = next(a for a in choice["accounts"] if a["name"] == "Ravi Verma")
    assert own.post("/portal/auth/select-account",
                    json={"selection_token": choice["selection_token"], "end_user_id": 999999}).status_code == 400
    session = own.post("/portal/auth/select-account",
                       json={"selection_token": choice["selection_token"], "end_user_id": ravi["id"]})
    assert session.status_code == 200 and session.json()["user"]["name"] == "Ravi Verma"
    # the email of one of them identifies only that person
    by_email = request_otp(own, channel="email", identifier="ASHA@example.test").json()
    assert by_email["sent_to"] == "as••@example.test"


def test_end_user_sees_only_own_complaints_and_can_file_one(client, login, end_user_login):
    end_user = end_user_login()
    me = client.get("/portal/me", headers=end_user).json()
    assert me["name"] == "Rahul Sharma" and me["location"]["name"] == "Mansarovar"

    mine = client.get("/portal/complaints", params={"page_size": 100}, headers=end_user).json()
    assert mine["items"] and mine["total"] >= len(mine["items"])

    departments = client.get("/portal/departments", headers=end_user).json()
    electricity = next(d for d in departments if d["name"] == "Electricity")
    assert all(c["priority"] for c in electricity["categories"])
    created = client.post("/portal/complaints", headers=end_user, data={
        "department_id": electricity["id"], "category_id": electricity["categories"][0]["id"],
        "location_id": me["location"]["id"], "title": "Street light flickering", "description": "Near the park gate",
    }, files={"files": ("photo.jpg", JPEG, "image/jpeg")})
    assert created.status_code == 201, created.text
    complaint = created.json()
    assert complaint["attachments"][0]["file_name"] == "photo.jpg"

    svg = client.post("/portal/complaints", headers=end_user, data={
        "department_id": electricity["id"], "category_id": electricity["categories"][0]["id"],
        "location_id": me["location"]["id"], "title": "x", "description": "y",
    }, files={"files": ("pic.svg", b"<svg onload='alert(1)'/>", "image/svg+xml")})
    assert svg.status_code == 400
    fake = client.post("/portal/complaints", headers=end_user, data={
        "department_id": electricity["id"], "category_id": electricity["categories"][0]["id"],
        "location_id": me["location"]["id"], "title": "x", "description": "y",
    }, files={"files": ("script.jpg", b"<script>alert(1)</script>", "image/jpeg")})
    assert fake.status_code == 400  # not really a JPEG

    stats = client.get("/portal/complaints/stats", headers=end_user).json()
    assert stats["total"] == mine["total"] + 1
    assert stats["open"] + stats["in_progress"] + stats["resolved"] + stats["rejected"] == stats["total"]

    detail = client.get(f"/complaints/{complaint['id']}", headers=login(ELEC_AGENT)).json()
    assert detail["status"] == "ASSIGNED" and detail["assignee"]["name"] == "Amit Kumar"


def test_attachments_are_private_and_links_expire(client, login, end_user_login):
    end_user = end_user_login()
    cid = file_complaint(client, end_user, title="With a photo")
    reply = client.post(f"/portal/complaints/{cid}/comments", headers=end_user, data={"body": "Photo"},
                        files={"files": ("p.jpg", JPEG, "image/jpeg")})
    assert reply.status_code == 201
    url = reply.json()["comments"][-1]["attachments"][0]["url"]
    download = client.get(url)
    assert download.status_code == 200 and download.content == JPEG
    assert download.headers["x-content-type-options"] == "nosniff"
    attachment_id = url.split("/files/")[1].split("?")[0]
    assert client.get(f"/files/{attachment_id}?expires=1&signature=abc").status_code == 403
    tampered = url.replace(f"/files/{attachment_id}", f"/files/{int(attachment_id) + 1}")
    assert client.get(tampered).status_code == 403
    assert client.get("/uploads/anything.jpg").status_code == 404  # nothing is served statically

    # internal-note attachments never reach the end user
    agent = login(ELEC_AGENT)
    client.post(f"/complaints/{cid}/comments", headers=agent, data={"body": "Internal photo", "is_internal": "true"},
                files={"files": ("i.jpg", JPEG, "image/jpeg")})
    view = client.get(f"/portal/complaints/{cid}", headers=end_user).json()
    assert all(a["file_name"] != "i.jpg" for a in view["attachments"])


def test_tokens_do_not_cross_portals(client, login, end_user_login):
    end_user = end_user_login("9876543212")
    assert client.get("/complaints/", headers=end_user).status_code == 403
    assert client.get("/portal/complaints", headers=login(SUPER_ADMIN)).status_code == 403


def test_portal_session_refresh_and_logout(client):
    own = new_client()
    body = request_otp(own, channel="email", identifier="sunita@example.test").json()
    session = own.post("/portal/auth/verify-otp", json={"challenge_id": body["challenge_id"], "otp": body["dev_otp"]})
    assert session.status_code == 200
    assert own.post("/auth/refresh", params={"principal": "end_user"}).status_code == 403  # client header required
    refreshed = own.post("/auth/refresh", params={"principal": "end_user"}, headers=CLIENT_HEADERS)
    assert refreshed.status_code == 200
    assert own.post("/auth/logout", params={"principal": "end_user"}, headers=CLIENT_HEADERS).status_code == 200
    assert own.post("/auth/refresh", params={"principal": "end_user"}, headers=CLIENT_HEADERS).status_code == 401


def test_contact_change_needs_the_new_address_confirmed(client):
    own = new_client()
    body = request_otp(own, channel="email", identifier="mohan@example.test").json()
    token = own.post("/portal/auth/verify-otp",
                     json={"challenge_id": body["challenge_id"], "otp": body["dev_otp"]}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    # the profile endpoint no longer changes the sign-in identity
    assert own.put("/portal/profile", headers=headers, json={"email": "x@example.test"}).json()["email"] == \
        "mohan@example.test"
    started = own.post("/portal/profile/contact/request", headers=headers,
                       json={"channel": "email", "value": "mohan.lal@example.test"})
    assert started.status_code == 200, started.text
    confirmed = own.post("/portal/profile/contact/verify", headers=headers,
                         json={"challenge_id": started.json()["challenge_id"], "otp": started.json()["dev_otp"]})
    assert confirmed.status_code == 200 and confirmed.json()["user"]["email"] == "mohan.lal@example.test"
    # other sessions (including the old token) are signed out
    assert own.get("/portal/me", headers=headers).status_code == 401
    new_headers = {"Authorization": f"Bearer {confirmed.json()['access_token']}"}
    assert own.get("/portal/me", headers=new_headers).status_code == 200


def test_profile_validation(client, end_user_login):
    headers = end_user_login()
    assert client.put("/portal/profile", headers=headers, json={"dob": "2999-01-01"}).status_code == 400
    assert client.put("/portal/profile", headers=headers, json={"gender": "robot"}).status_code == 400
    updated = client.put("/portal/profile", headers=headers,
                         json={"dob": "1990-05-01", "gender": "prefer_not_to_say", "notify_sms": False})
    assert updated.status_code == 200
    assert (updated.json()["dob"], updated.json()["gender"], updated.json()["notify_sms"]) == \
        ("1990-05-01", "prefer_not_to_say", False)


def test_location_csv_import_builds_tree_and_reports_errors(client, login):
    admin = login(SUPER_ADMIN)
    csv_body = (
        "country,state,district,city,area\n"
        "India,Rajasthan,Jaipur,Jaipur,Mansarovar\n"       # already exists
        "India,Rajasthan,Jaipur,Jaipur,Jagatpura\n"        # 1 new node
        "India,Gujarat,Ahmedabad,Ahmedabad,Navrangpura\n"  # 4 new nodes
        "India,,Surat,Surat,Adajan\n"                      # gap -> error
    )
    result = client.post("/locations/import", headers=admin, data={"dry_run": "false"},
                         files={"file": ("loc.csv", csv_body, "text/csv")}).json()
    assert result["created"] == 5
    assert result["unchanged"] == 1
    assert result["failed"] == 1 and result["errors"][0]["row"] == 5

    tree = client.get("/locations/tree", headers=admin).json()
    assert "Gujarat" in {s["name"] for s in tree[0]["children"]}


def test_location_import_respects_scope(client, login):
    from conftest import staff_login

    root = login(SUPER_ADMIN)
    roles = {r["key"]: r for r in client.get("/roles/", headers=root).json()}
    perms = roles["manager"]["permissions"] + ["location.import"]
    client.patch(f"/roles/{roles['manager']['id']}", headers=root, json={"permissions": perms})
    try:
        csv_body = (
            "country,state,district,city,area\n"
            "India,Rajasthan,Jaipur,Jaipur,Sanganer\n"
            "India,Rajasthan,Udaipur,Udaipur,Fatehpura\n"
        )
        result = client.post("/locations/import", headers=staff_login(client, ELEC_MANAGER), data={"dry_run": "false"},
                             files={"file": ("l.csv", csv_body)}).json()
    finally:
        client.patch(f"/roles/{roles['manager']['id']}", headers=root, json={"permissions": roles["manager"]["permissions"]})
    assert result["created"] == 1
    assert result["errors"] == [{"row": 3, "message": "You cannot add locations under 'Rajasthan'"}]


def test_end_user_csv_import_creates_updates_and_validates(client, login):
    admin = login(SUPER_ADMIN)
    csv_body = (
        "user_id,name,mobile,email,country,state,district,city,area\n"
        "USR001,Rahul S. Sharma,9876543210,rahul@example.test,India,Rajasthan,Jaipur,Jaipur,Mansarovar\n"  # update
        "USR100,Kavita Joshi,+91 99887 76655,kavita@example.test,India,Rajasthan,Jaipur,Jaipur,Vaishali Nagar\n"
        "USR101,No Place,9988776656,noplace@example.test,India,Rajasthan,Jaipur,Jaipur,Atlantis\n"  # bad location
        "USR102,Bad Phone,12345,bad@example.test,India,,,,\n"
        "USR100,Dupe,9988776657,dupe@example.test,India,,,,\n"
        "USR103,Too Long,098877666589,long@example.test,India,,,,\n"  # a trunk prefix is not trimmed away
    )
    result = client.post("/end-users/import", headers=admin, data={"dry_run": "false"},
                         files={"file": ("u.csv", csv_body)}).json()
    assert (result["created"], result["updated"], result["failed"]) == (1, 1, 4), result
    messages = {e["row"]: e["message"] for e in result["errors"]}
    assert "not found" in messages[4]
    assert "10-digit" in messages[5] and "10-digit" in messages[7]
    assert "Duplicate user_id" in messages[6]

    listing = client.get("/end-users/", params={"search": "Kavita"}, headers=admin).json()
    assert listing["total"] == 1 and listing["items"][0]["location"]["name"] == "Vaishali Nagar"


def test_end_user_listing_is_location_scoped(client, login):
    names = {u["name"] for u in client.get("/end-users/", params={"page_size": 100},
                                           headers=login(ELEC_MANAGER)).json()["items"]}
    assert "Sunita Devi" not in names  # Delhi
    assert "Mohan Lal" not in names    # Jodhpur
    assert "Amit Kumar" in names       # Malviya Nagar, Jaipur


def test_a_code_that_could_not_be_sent_can_be_requested_again(client, login, monkeypatch):
    import config
    from services import messaging

    body = "user_id,name,mobile,email\nOTP-9,Lata Rao,9000000420,lata@example.test\n"
    assert client.post("/end-users/import", headers=login(SUPER_ADMIN), data={"dry_run": "false"},
                       files={"file": ("u.csv", body)}).json()["created"] == 1

    def provider_down(to, body):
        raise messaging.MessageError("provider down")

    monkeypatch.setattr(config, "OTP_RESEND_COOLDOWN_SECONDS", 30)
    monkeypatch.setattr(messaging, "send_sms", provider_down)
    own = new_client()
    failed = request_otp(own, channel="sms", identifier="9000000420")
    assert failed.status_code == 200  # the same answer as always; sending happens afterwards
    wrong = own.post("/portal/auth/verify-otp",
                     json={"challenge_id": failed.json()["challenge_id"], "otp": failed.json()["dev_otp"]})
    assert wrong.status_code == 400  # the unsent code was withdrawn ...
    monkeypatch.undo()
    retry = request_otp(own, channel="sms", identifier="9000000420")
    assert retry.status_code == 200  # ... so the cooldown doesn't apply
    session = own.post("/portal/auth/verify-otp",
                       json={"challenge_id": retry.json()["challenge_id"], "otp": retry.json()["dev_otp"]})
    assert session.status_code == 200
