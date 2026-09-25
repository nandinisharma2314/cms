"""Analytics: exact metrics on a department created just for this test, plus scope and formats."""
from datetime import timedelta

import pytest

from conftest import ELEC_AGENT, ELEC_SUPERVISOR, SUPER_ADMIN
from test_sla import check, parse
from test_workflow import act, file_complaint, location_id
from utils.security import utcnow


@pytest.fixture(scope="module")
def parks(client, login, citizen_login):
    """A Parks department with one agent covering Jaipur, and two complaints:
    one handled well and rated 4, one that missed its response target."""
    root = login(SUPER_ADMIN)
    department = client.post("/departments/", headers=root, json={
        "name": "Parks", "code": "PARKS", "categories": ["Broken bench"],
    }).json()
    roles = {r["key"]: r["id"] for r in client.get("/roles/", headers=root).json()}
    jaipur = location_id(client, root, "India", "Rajasthan", "Jaipur", portal=False)
    client.post("/users/", headers=root, json={
        "name": "Parks Agent", "email": "parks.agent@civiccare.gov.in", "role_id": roles["agent"],
        "password": "Str0ngPass!", "scopes": [{"department_id": department["id"], "location_id": jaipur}],
    })
    agent = client.post("/auth/login", json={"email": "parks.agent@civiccare.gov.in", "password": "Str0ngPass!"}).json()
    agent_headers = {"Authorization": f"Bearer {agent['access_token']}"}
    citizen = citizen_login()

    good = file_complaint(client, citizen, department="Parks", title="Bench broken")
    act(client, agent_headers, good, "acknowledge")
    act(client, agent_headers, good, "resolve", "Bench replaced")
    client.post(f"/portal/complaints/{good}/confirm", headers=citizen, json={"rating": 4})

    late = file_complaint(client, citizen, department="Parks", title="Swing broken")
    due = parse(client.get(f"/complaints/{late}", headers=root).json()["sla_due"]["response_due_at"])
    check(late, due + timedelta(minutes=5))
    return {"id": department["id"], "good": good, "late": late}


def test_reports_need_permission(client, login):
    assert client.get("/reports/summary", headers=login(ELEC_AGENT)).status_code == 403


def test_summary_metrics_are_exact(client, login, parks):
    m = client.get("/reports/summary", params={"department_id": parks["id"]}, headers=login(SUPER_ADMIN)).json()["metrics"]
    assert (m["total"], m["resolved"], m["pending"], m["rejected"]) == (2, 1, 1, 0)
    assert m["response_hours"]["count"] == 1 and m["response_hours"]["avg"] is not None
    assert m["resolution_hours"]["count"] == 1
    assert m["response_sla"] == {"met": 1, "missed": 1, "met_pct": 50.0}
    assert m["resolution_sla"]["met"] == 1
    assert m["sla_breaches"] == 1 and m["escalated_now"] == 1
    assert (m["avg_rating"], m["rated"]) == (4.0, 1)


def test_performance_tables(client, login, parks):
    root = login(SUPER_ADMIN)
    agents = client.get("/reports/agents", params={"department_id": parks["id"]}, headers=root).json()
    row = next(a for a in agents if a["name"] == "Parks Agent")
    assert (row["total"], row["resolved"], row["response_sla_pct"], row["avg_rating"]) == (2, 1, 50.0, 4.0)

    departments = client.get("/reports/departments", headers=root).json()
    assert next(d for d in departments if d["name"] == "Parks")["total"] == 2

    areas = client.get("/reports/locations", params={"level": "area", "department_id": parks["id"]}, headers=root).json()
    assert [(a["name"], a["total"]) for a in areas] == [("Mansarovar", 2)]
    districts = client.get("/reports/locations", params={"level": "district"}, headers=root).json()
    assert {"Jaipur", "Jodhpur", "New Delhi"} <= {d["name"] for d in districts}

    csv_response = client.get("/reports/agents", params={"format": "csv", "department_id": parks["id"]}, headers=root)
    assert csv_response.headers["content-type"].startswith("text/csv")
    assert csv_response.text.startswith("Name,Role,Total,Pending")


def test_reports_are_scoped(client, login, parks):
    supervisor = login(ELEC_SUPERVISOR)  # Electricity, Jaipur city
    departments = client.get("/reports/departments", headers=supervisor).json()
    assert [d["name"] for d in departments] == ["Electricity"]
    everything = client.get("/reports/summary", headers=login(SUPER_ADMIN)).json()["metrics"]["total"]
    mine = client.get("/reports/summary", headers=supervisor).json()["metrics"]["total"]
    assert 0 < mine < everything
    # filtering by another department inside the scope check simply yields nothing
    parks_for_supervisor = client.get("/reports/summary", params={"department_id": parks["id"]}, headers=supervisor).json()
    assert parks_for_supervisor["metrics"]["total"] == 0


def test_trend_and_period_comparison(client, login, parks):
    root = login(SUPER_ADMIN)
    today = utcnow().date()
    daily = client.get("/reports/trend", params={"date_from": (today - timedelta(days=13)).isoformat()}, headers=root).json()
    assert daily["interval"] == "day" and len(daily["points"]) == 14
    assert sum(p["received"] for p in daily["points"]) >= 2

    weekly = client.get("/reports/trend", params={"date_from": (today - timedelta(days=90)).isoformat()}, headers=root).json()
    assert weekly["interval"] == "week" and len(weekly["points"]) == 13  # 91 days in 7-day buckets

    summary = client.get("/reports/summary", params={"date_from": (today - timedelta(days=6)).isoformat()}, headers=root).json()
    assert summary["previous_period"]["date_to"] == (today - timedelta(days=7)).isoformat()
    assert summary["previous_period"]["date_from"] == (today - timedelta(days=13)).isoformat()
    assert "total" in summary["previous"]
