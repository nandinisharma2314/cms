"""CSV operations: dry runs, duplicate detection, import history, reports, exports."""
import csv
import io

from conftest import ADMIN, ELEC_MANAGER, SUPER_ADMIN

HEADER = "country,state,district,city,area\n"


def upload(client, headers, path, body, dry_run=False, name="data.csv"):
    return client.post(path, headers=headers, files={"file": (name, body, "text/csv")},
                       data={"dry_run": "true" if dry_run else "false"})


def area_names(client, headers, *path):
    nodes = client.get("/locations/tree", headers=headers).json()
    for name in path:
        nodes = next(n for n in nodes if n["name"] == name)["children"]
    return {n["name"] for n in nodes}


def test_dry_run_reports_without_saving(client, login):
    root = login(SUPER_ADMIN)
    body = HEADER + "India,Rajasthan,Ajmer,Ajmer,Vaishali Colony\n"
    preview = upload(client, root, "/locations/import", body, dry_run=True).json()
    assert preview["dry_run"] and preview["created"] == 3 and preview["failed"] == 0
    assert "Ajmer" not in area_names(client, root, "India", "Rajasthan")

    real = upload(client, root, "/locations/import", body).json()
    assert not real["dry_run"] and real["created"] == 3
    assert "Ajmer" in area_names(client, root, "India", "Rajasthan")

    history = client.get("/imports/", params={"kind": "locations"}, headers=root).json()
    statuses = [b["status"] for b in history[:2]]
    assert statuses == ["completed", "validated"]


def test_location_near_duplicates_are_matched_or_flagged(client, login):
    root = login(SUPER_ADMIN)
    body = (
        HEADER
        + "India,Rajasthan,Jaipur,Jaipur,C Scheme\n"      # same as existing "C-Scheme": reused
        + ",,,,\n"                                        # blank: skipped
        + "India,Rajasthan,Jaipur,Jaipur,Mansarowar\n"    # looks like "Mansarovar": created, flagged
    )
    result = upload(client, root, "/locations/import", body.replace(HEADER, "country,state,district,city,area,zone\n")).json()
    assert result["total_rows"] == 2
    assert (result["created"], result["unchanged"], result["failed"]) == (1, 1, 0)
    messages = [w["message"] for w in result["warning_list"]]
    assert any("not used" in m and "zone" in m for m in messages)
    assert any("'C Scheme' matched existing 'C-Scheme'" in m for m in messages)
    assert any("'Mansarowar' looks like existing 'Mansarovar'" in m for m in messages)
    areas = area_names(client, root, "India", "Rajasthan", "Jaipur", "Jaipur")
    assert "C Scheme" not in areas and "Mansarowar" in areas


def test_citizen_import_flags_likely_duplicates(client, login):
    root = login(SUPER_ADMIN)
    body = (
        "user_id,name,mobile,email,country,state,district,city,area\n"
        "USR200,Rahul  Sharma,9876543210,rahul.new@example.com,India,Rajasthan,Jaipur,Jaipur,Mansarovar\n"
        "USR201,Old Landline,2212345678,landline@example.com,India,,,,\n"
        "USR202,Twin One,9123456780,twin1@example.com,India,,,,\n"
        "USR203,Twin Two,9123456780,twin2@example.com,India,,,,\n"
        "USR204,Bad Mail,9123456781,not-an-email,India,,,,\n"
    )
    result = upload(client, root, "/end-users/import", body).json()
    assert (result["created"], result["failed"]) == (4, 1)
    warnings = {(w["row"], w["message"].split(";")[0]) for w in result["warning_list"]}
    assert (2, "Mobile already registered to Rahul Sharma with email rahul@example.com") in warnings
    assert any(row == 3 and "Indian mobile" in m for row, m in warnings)
    assert any(row == 5 and "Same mobile as row 4" in m for row, m in warnings)
    assert result["errors"] == [{"row": 6, "message": "Email is not valid"}]

    # names are cleaned up on the way in
    listing = client.get("/end-users/", params={"search": "USR200"}, headers=root).json()["items"]
    assert listing[0]["name"] == "Rahul Sharma"


def test_failed_rows_report_can_be_fixed_and_reuploaded(client, login):
    root = login(SUPER_ADMIN)
    body = (
        "user_id,name,mobile,email\n"
        "USR300,Good Row,9000000300,good300@example.com\n"
        "USR301,No Mobile,,nomobile@example.com\n"
    )
    batch_id = upload(client, root, "/end-users/import", body, name="citizens.csv").json()["batch_id"]
    detail = client.get(f"/imports/{batch_id}", headers=root).json()
    assert detail["filename"] == "citizens.csv" and detail["failed"] == 1
    assert detail["issues"] == [{"row": 3, "severity": "error", "message": "Mobile must be a 10-digit number"}]

    report = client.get(f"/imports/{batch_id}/report", headers=root)
    assert report.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(report.text)))
    assert rows == [{
        "user_id": "USR301", "name": "No Mobile", "mobile": "", "email": "nomobile@example.com",
        "source_row": "3", "severity": "error", "issue": "Mobile must be a 10-digit number",
    }]

    # fix the row in the report and upload it again (extra report columns are just ignored)
    rows[0]["mobile"] = "9000000301"
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    again = upload(client, root, "/end-users/import", out.getvalue()).json()
    assert again["created"] == 1 and again["failed"] == 0


def test_rejected_file_is_recorded_in_history(client, login):
    root = login(SUPER_ADMIN)
    response = upload(client, root, "/end-users/import", "name,phone\nX,1\n", name="wrong-columns.csv")
    assert response.status_code == 400
    latest = client.get("/imports/", params={"kind": "end_users"}, headers=root).json()[0]
    assert latest["status"] == "rejected" and latest["filename"] == "wrong-columns.csv"
    assert "missing required column" in latest["error"]


def test_exports_round_trip_and_respect_scope(client, login):
    root = login(SUPER_ADMIN)
    exported = client.get("/locations/export", headers=root)
    assert exported.text.startswith("country,state,district,city,area")
    reimport = upload(client, root, "/locations/import", exported.text, dry_run=True).json()
    assert reimport["created"] == 0 and reimport["failed"] == 0 and reimport["unchanged"] == reimport["total_rows"]

    manager_csv = client.get("/end-users/export", headers=login(ELEC_MANAGER)).text
    assert "Sunita Devi" not in manager_csv  # Delhi citizen, outside a Jaipur scope
    assert "Amit Kumar" in manager_csv


def test_import_history_visibility(client, login):
    assert client.get("/imports/", headers=login(ELEC_MANAGER)).status_code == 403  # cannot import anything
    everyone = client.get("/imports/", headers=login(SUPER_ADMIN)).json()
    assert everyone
    # admins can't import by default, so they don't see import history either
    assert client.get("/imports/", headers=login(ADMIN)).status_code == 403
