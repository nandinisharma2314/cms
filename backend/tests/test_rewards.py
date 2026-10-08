"""Tests for the Rewards & Recognition system."""
from conftest import ADMIN, ELEC_AGENT, ELEC_MANAGER, ELEC_SUPERVISOR, SUPER_ADMIN
from database import SessionLocal
from models import Complaint, Priority, RewardSettings, RewardTransaction, User
from test_workflow import act, file_complaint, items


def test_reward_settings_crud(client, login):
    root = login(SUPER_ADMIN)
    agent = login(ELEC_AGENT)

    # Agent cannot manage reward settings
    forbidden = client.put("/rewards/settings", headers=agent, json={"is_enabled": True})
    assert forbidden.status_code == 403

    # Super admin gets settings
    res = client.get("/rewards/settings", headers=root)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "currency_name" in data
    assert "points_on_time_resolution" in data

    # Super admin updates settings
    update_res = client.put(
        "/rewards/settings",
        headers=root,
        json={
            "is_enabled": True,
            "currency_name": "Kvon Coins",
            "currency_symbol": "🪙",
            "eligible_roles": ["agent", "field_worker"],
            "points_on_time_resolution": 60,
            "points_speed_bonus": 30,
            "points_five_star": 40,
            "points_four_star": 20,
            "points_zero_reopen": 25,
            "streak_interval": 5,
            "streak_bonus": 100,
        },
    )
    assert update_res.status_code == 200, update_res.text
    updated = update_res.json()
    assert updated["is_enabled"] is True
    assert updated["currency_name"] == "Kvon Coins"
    assert updated["points_on_time_resolution"] == 60


def test_reward_award_on_resolution_and_feedback(client, login, end_user_login):
    root = login(SUPER_ADMIN)
    agent_headers = login(ELEC_AGENT)
    citizen_headers = end_user_login()

    # Ensure rewards are enabled
    client.put(
        "/rewards/settings",
        headers=root,
        json={
            "is_enabled": True,
            "eligible_roles": ["agent", "field_worker"],
            "points_on_time_resolution": 50,
            "points_speed_bonus": 25,
            "points_five_star": 30,
            "priority_multipliers": {"critical": 2.0, "danger": 1.5, "warning": 1.0, "info": 1.0, "neutral": 1.0},
        },
    )

    # Initial agent points
    me_before = client.get("/rewards/me", headers=agent_headers).json()
    initial_points = me_before["balance"]

    # File a complaint and resolve it on time
    cid = file_complaint(client, citizen_headers, title="Streetlight blinking rapidly")
    # Mark in-progress then resolved
    act(client, agent_headers, cid, "start_progress")
    act(client, agent_headers, cid, "resolve", note="Replaced the ballast and bulb")

    # Verify agent points increased
    me_after = client.get("/rewards/me", headers=agent_headers).json()
    assert me_after["balance"] > initial_points, f"Expected {me_after['balance']} > {initial_points}"
    assert len(me_after["recent_transactions"]) > 0
    rule_types = [tx["rule_type"] for tx in me_after["recent_transactions"]]
    assert "on_time_resolution" in rule_types
    assert "speed_bonus" in rule_types

    # Submit 5-star citizen review
    rev_res = client.post(
        f"/portal/complaints/{cid}/feedback",
        headers=citizen_headers,
        json={"rating": 5, "comment": "Excellent and speedy repair!"},
    )
    assert rev_res.status_code == 200, rev_res.text

    # Verify 5-star points added
    me_rated = client.get("/rewards/me", headers=agent_headers).json()
    assert me_rated["balance"] >= me_after["balance"] + 30
    assert any(tx["rule_type"] == "five_star_rating" for tx in me_rated["recent_transactions"])


def test_superadmin_reward_filters_and_stats(client, login):
    root = login(SUPER_ADMIN)

    # Fetch stats
    stats_res = client.get("/rewards/admin/stats", headers=root)
    assert stats_res.status_code == 200, stats_res.text
    stats = stats_res.json()
    assert "total_points" in stats
    assert "total_transactions" in stats
    assert "by_rule" in stats
    assert "by_department" in stats

    # Fetch transactions list
    txs_res = client.get("/rewards/admin/transactions", headers=root, params={"page": 1, "page_size": 25})
    assert txs_res.status_code == 200, txs_res.text
    data = txs_res.json()
    assert "items" in data
    assert "total" in data

    # Filter by rule_type
    filtered = client.get("/rewards/admin/transactions", headers=root, params={"rule_type": "on_time_resolution"}).json()
    for item in filtered["items"]:
        assert item["rule_type"] == "on_time_resolution"

    # Export CSV
    export_res = client.get("/rewards/admin/export", headers=root)
    assert export_res.status_code == 200
    assert "text/csv" in export_res.headers.get("content-type", "")
    assert "ID" in export_res.text


def test_superadmin_manual_adjustment(client, login):
    root = login(SUPER_ADMIN)
    agent = login(ELEC_AGENT)

    # Get agent user id
    me_agent = client.get("/auth/me", headers=agent).json()
    agent_id = me_agent["id"]

    bal_before = client.get("/rewards/me", headers=agent).json()["balance"]

    # Super admin manually grants 75 points
    adj_res = client.post(
        "/rewards/admin/adjust",
        headers=root,
        json={
            "user_id": agent_id,
            "points": 75,
            "description": "Special recognition for storm emergency shift",
        },
    )
    assert adj_res.status_code == 201, adj_res.text
    adj_data = adj_res.json()
    assert adj_data["points"] == 75
    assert adj_data["rule_type"] == "manual_adjustment"

    bal_after = client.get("/rewards/me", headers=agent).json()["balance"]
    assert bal_after == bal_before + 75


def test_leaderboard(client, login):
    agent = login(ELEC_AGENT)
    res = client.get("/rewards/leaderboard", headers=agent, params={"timeframe": "all", "limit": 10})
    assert res.status_code == 200, res.text
    lb = res.json()
    assert isinstance(lb, list)
    if lb:
        assert "rank" in lb[0]
        assert "user" in lb[0]
        assert "points" in lb[0]
        assert lb[0]["user"]["name"] is not None
