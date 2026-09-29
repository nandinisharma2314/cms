"""Analytics: exact metrics on a department created just for this test, plus scope and formats."""
from datetime import timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from conftest import ELEC_AGENT, ELEC_SUPERVISOR, SUPER_ADMIN, first_login
from factories import SETTINGS, email
from test_sla import check, parse, priority_id
from test_workflow import act, file_complaint, location_id
from utils.security import utcnow


def today():
    """Today in the organisation's time zone, as the reports count days."""
    return utcnow().replace(tzinfo=timezone.utc).astimezone(ZoneInfo(SETTINGS["timezone"])).date()


@pytest.fixture(scope="module")
def parks(client, login, end_user_login):
    """A Parks department with one agent covering Jaipur, and two complaints:
    one handled well and rated 4, one that missed its response target."""
    root = login(SUPER_ADMIN)
    department = client.post("/departments/", headers=root, json={
        "name": "Parks", "code": "PARKS",
        "categories": [{"name": "Broken bench", "default_priority_id": priority_id(client, root, "Low")}],
    })
    assert department.status_code == 201, department.text
    department = department.json()
    roles = {r["key"]: r["id"] for r in client.get("/roles/", headers=root).json()}
    jaipur = location_id(client, root, "India", "Rajasthan", "Jaipur", portal=False)
    created = client.post("/users/", headers=root, json={
        "name": "Parks Agent", "email": email("parks.agent"), "role_id": roles["agent"],
        "password": "Initial-Pass-1", "scopes": [{"department_id": department["id"], "location_id": jaipur}],
    })
    assert created.status_code == 201, created.text
    agent = first_login(client, email("parks.agent"), "Initial-Pass-1", "Parks-Agent-Pass-2")
    end_user = end_user_login()

    good = file_complaint(client, end_user, department="Parks", title="Bench broken")
    act(client, agent, good, "acknowledge")
    act(client, agent, good, "resolve", "Bench replaced")
    assert client.post(f"/portal/complaints/{good}/confirm", headers=end_user, json={"rating": 4}).status_code == 200

    late = file_complaint(client, end_user, department="Parks", title="Swing broken")
    due = parse(client.get(f"/complaints/{late}", headers=root).json()["sla_due"]["response_due_at"])
    check(late, due + timedelta(minutes=5))
    return {"id": department["id"], "good": good, "late": late}


def test_reports_need_permission(client, login):
    assert client.get("/reports/overview", headers=login(ELEC_AGENT)).status_code == 403


def test_overview_metrics_are_exact(client, login, parks):
    m = client.get("/reports/overview", params={"department_id": parks["id"]},
                   headers=login(SUPER_ADMIN)).json()["metrics"]
    assert (m["total"], m["resolved"], m["pending"], m["rejected"]) == (2, 1, 1, 0)
    assert m["response_hours"]["count"] == 1 and m["response_hours"]["avg"] is not None
    assert m["resolution_hours"]["count"] == 1
    assert m["response_sla"] == {"met": 1, "missed": 1, "met_pct": 50.0}
    assert m["resolution_sla"]["met"] == 1
    assert m["sla_breaches"] == 1 and m["escalated_now"] == 1
    assert (m["avg_rating"], m["rated"]) == (4.0, 1)
    assert (m["reopened"], m["resolved_at_least_once"], m["reopen_pct"]) == (0, 1, 0.0)


def test_filters_are_validated(client, login, parks):
    root = login(SUPER_ADMIN)
    for params in ({"department_id": 999999}, {"location_id": 999999}, {"priority_id": 999999}):
        assert client.get("/reports/overview", params=params, headers=root).status_code == 404
    backwards = {"date_from": today().isoformat(), "date_to": (today() - timedelta(days=1)).isoformat()}
    assert client.get("/reports/overview", params=backwards, headers=root).status_code == 400
    low = client.get("/reports/overview", params={"department_id": parks["id"],
                                                  "priority_id": priority_id(client, root, "Low")}, headers=root)
    assert low.json()["metrics"]["total"] == 2
    high = client.get("/reports/overview", params={"department_id": parks["id"],
                                                   "priority_id": priority_id(client, root, "High")}, headers=root)
    assert high.json()["metrics"]["total"] == 0


def test_performance_tables(client, login, parks):
    root = login(SUPER_ADMIN)
    agents = client.get("/reports/agents", params={"department_id": parks["id"]}, headers=root).json()
    row = next(a for a in agents if a["name"] == "Parks Agent")
    assert (row["total"], row["resolved"], row["response_sla_pct"], row["avg_rating"]) == (2, 1, 50.0, 4.0)

    departments = client.get("/reports/departments", headers=root).json()
    assert next(d for d in departments if d["name"] == "Parks")["total"] == 2

    levels = client.get("/reports/levels", headers=root).json()
    assert [lvl["key"] for lvl in levels] == ["country", "state", "district", "city", "area"]
    areas = client.get("/reports/locations", params={"level": "area", "department_id": parks["id"]},
                       headers=root).json()
    assert [(a["name"], a["total"]) for a in areas] == [("Mansarovar", 2)]
    districts = client.get("/reports/locations", params={"level": "district"}, headers=root).json()
    assert {"Jaipur", "Jodhpur", "New Delhi"} <= {d["name"] for d in districts}
    assert client.get("/reports/locations", params={"level": "planet"}, headers=root).status_code == 400
    assert client.get("/reports/locations", headers=root).status_code == 422

    csv_response = client.get("/reports/agents", params={"format": "csv", "department_id": parks["id"]}, headers=root)
    assert csv_response.headers["content-type"].startswith("text/csv")
    assert csv_response.text.startswith("\ufeffName,Role,Total,Pending")
    assert client.get("/reports/agents", params={"format": "xlsx"}, headers=root).status_code == 400


def test_reports_are_scoped(client, login, parks):
    supervisor = login(ELEC_SUPERVISOR)  # Electricity, Jaipur city
    departments = client.get("/reports/departments", headers=supervisor).json()
    assert [d["name"] for d in departments] == ["Electricity"]
    everything = client.get("/reports/overview", headers=login(SUPER_ADMIN)).json()["metrics"]["total"]
    mine = client.get("/reports/overview", headers=supervisor).json()["metrics"]["total"]
    assert 0 < mine < everything
    # filtering by another department inside the scope check simply yields nothing
    parks_for_supervisor = client.get("/reports/overview", params={"department_id": parks["id"]},
                                      headers=supervisor).json()
    assert parks_for_supervisor["metrics"]["total"] == 0


def test_trend_and_period_comparison(client, login, parks):
    root = login(SUPER_ADMIN)
    daily = client.get("/reports/overview", params={"date_from": (today() - timedelta(days=13)).isoformat()},
                       headers=root).json()
    assert daily["trend"]["interval"] == "day" and len(daily["trend"]["points"]) == 14
    assert sum(p["received"] for p in daily["trend"]["points"]) >= 2
    assert daily["trend"]["points"][-1]["date"] == today().isoformat()

    weekly = client.get("/reports/overview", params={"date_from": (today() - timedelta(days=90)).isoformat()},
                        headers=root).json()
    assert weekly["trend"]["interval"] == "week" and len(weekly["trend"]["points"]) == 13  # 91 days, 7-day buckets

    week = client.get("/reports/overview", params={"date_from": (today() - timedelta(days=6)).isoformat()},
                      headers=root).json()
    assert week["period"] == {"date_from": (today() - timedelta(days=6)).isoformat(), "date_to": today().isoformat()}
    assert week["previous_period"] == {"date_from": (today() - timedelta(days=13)).isoformat(),
                                       "date_to": (today() - timedelta(days=7)).isoformat()}
    assert "total" in week["previous"]

    default = client.get("/reports/overview", headers=root).json()["period"]
    assert default["date_to"] == today().isoformat()
    assert default["date_from"] == (today() - timedelta(days=29)).isoformat()


def test_report_periods_must_be_realistic(client, login):
    root = login(SUPER_ADMIN)
    from config import REPORT_MAX_DAYS

    too_long = client.get("/reports/overview", headers=root,
                          params={"date_from": "2020-01-01", "date_to": "2026-01-01"})
    assert too_long.status_code == 400 and str(REPORT_MAX_DAYS) in too_long.json()["detail"]
    ancient = client.get("/reports/overview", headers=root, params={"date_from": "0001-01-01", "date_to": "0001-01-02"})
    assert ancient.status_code == 400
    backwards = client.get("/reports/overview", headers=root, params={"date_from": "2026-02-01", "date_to": "2026-01-01"})
    assert backwards.status_code == 400
