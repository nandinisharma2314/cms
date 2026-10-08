from conftest import CLIENT_HEADERS, ELEC_AGENT, SUPER_ADMIN, new_client
from test_portal_and_imports import JPEG, request_otp

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def test_staff_avatar_upload_and_delete(client, login):
    auth_headers = login(ELEC_AGENT)

    # 1. Reject invalid file type (.txt)
    res = client.post(
        "/auth/avatar",
        headers=auth_headers,
        files={"file": ("test.txt", b"plain text", "text/plain")},
    )
    assert res.status_code == 400
    assert "image" in res.json()["detail"].lower()

    # 2. Reject fake image bytes with wrong magic bytes
    res = client.post(
        "/auth/avatar",
        headers=auth_headers,
        files={"file": ("fake.jpg", b"not a real jpeg bytes", "image/jpeg")},
    )
    assert res.status_code == 400
    assert "extension" in res.json()["detail"].lower()

    # 3. Valid JPEG upload
    res = client.post(
        "/auth/avatar",
        headers=auth_headers,
        files={"file": ("avatar.jpg", JPEG, "image/jpeg")},
    )
    assert res.status_code == 200
    avatar_url = res.json()["avatar_url"]
    assert avatar_url is not None
    assert "avatars/" in avatar_url

    # 4. Verify /auth/me returns the avatar_url
    me_res = client.get("/auth/me", headers=auth_headers)
    assert me_res.status_code == 200
    assert me_res.json()["avatar_url"] == avatar_url

    # 5. Serve the avatar file
    file_path = avatar_url.split("/serve/")[-1]
    serve_res = client.get(f"/files/serve/{file_path}")
    assert serve_res.status_code == 200

    # 6. Delete the avatar
    del_res = client.delete("/auth/avatar", headers=auth_headers)
    assert del_res.status_code == 200
    assert del_res.json()["avatar_url"] is None

    # 7. Verify /auth/me now has null avatar_url
    me_res_after = client.get("/auth/me", headers=auth_headers)
    assert me_res_after.json()["avatar_url"] is None


def test_portal_avatar_upload_and_delete(client):
    own = new_client()
    req = request_otp(own, channel="sms", identifier="+91 98765-43211").json()
    ver = own.post("/portal/auth/verify-otp", json={"challenge_id": req["challenge_id"], "otp": req["dev_otp"]})
    assert ver.status_code == 200
    access_token = ver.json()["access_token"]
    portal_headers = {"Authorization": f"Bearer {access_token}", **CLIENT_HEADERS}

    # 1. Upload valid PNG avatar
    up_res = own.post(
        "/portal/profile/avatar",
        headers=portal_headers,
        files={"file": ("profile.png", PNG, "image/png")},
    )
    assert up_res.status_code == 200
    avatar_url = up_res.json()["avatar_url"]
    assert avatar_url is not None
    assert "avatars/" in avatar_url

    # 2. Check /portal/me has avatar_url
    me_res = own.get("/portal/me", headers=portal_headers)
    assert me_res.status_code == 200
    assert me_res.json()["avatar_url"] == avatar_url

    # 3. Delete avatar
    del_res = own.delete("/portal/profile/avatar", headers=portal_headers)
    assert del_res.status_code == 200
    assert del_res.json()["avatar_url"] is None

    # 4. Check /portal/me after delete
    me_res2 = own.get("/portal/me", headers=portal_headers)
    assert me_res2.json()["avatar_url"] is None
