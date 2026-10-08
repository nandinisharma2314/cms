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
        assert "tier" in lb[0]
        assert "badge" in lb[0]["tier"]
        assert lb[0]["user"]["name"] is not None


def test_gamification_tier_in_summary(client, login):
    agent = login(ELEC_AGENT)
    me = client.get("/rewards/me", headers=agent).json()
    assert "tier" in me
    assert "current_tier" in me["tier"]
    assert "badge" in me["tier"]
    assert "progress_pct" in me["tier"]


def test_perks_and_redemptions(client, login):
    root = login(SUPER_ADMIN)
    agent = login(ELEC_AGENT)

    # 1. Fetch perks catalog
    perks_res = client.get("/rewards/perks", headers=agent)
    assert perks_res.status_code == 200, perks_res.text
    perks = perks_res.json()
    assert len(perks) > 0
    first_perk = perks[0]

    # 2. Give agent enough points to redeem
    me_agent = client.get("/auth/me", headers=agent).json()
    client.post(
        "/rewards/admin/adjust",
        headers=root,
        json={"user_id": me_agent["id"], "points": first_perk["points_cost"] + 100, "description": "Bonus for test"},
    )
    bal_before = client.get("/rewards/me", headers=agent).json()["balance"]

    # 3. Redeem perk
    redeem_res = client.post(
        "/rewards/perks/redeem",
        headers=agent,
        json={"perk_id": first_perk["id"], "notes": "Please issue digital certificate"},
    )
    assert redeem_res.status_code == 201, redeem_res.text
    redemption = redeem_res.json()
    assert redemption["points_spent"] == first_perk["points_cost"]

    # Verify points deducted
    bal_after = client.get("/rewards/me", headers=agent).json()["balance"]
    assert bal_after == bal_before - first_perk["points_cost"]

    # 4. Super Admin lists redemptions
    list_res = client.get("/rewards/admin/redemptions", headers=root)
    assert list_res.status_code == 200, list_res.text
    assert list_res.json()["total"] >= 1

    # 5. Super Admin updates redemption
    upd_res = client.put(
        f"/rewards/admin/redemptions/{redemption['id']}",
        headers=root,
        json={"status": "fulfilled", "admin_notes": "Certificate sent to agent email"},
    )
    assert upd_res.status_code == 200, upd_res.text
    assert upd_res.json()["status"] == "fulfilled"


def test_admin_perk_crud_and_custom_badges(client, login):
    root = login(SUPER_ADMIN)
    agent = login(ELEC_AGENT)

    # 1. Super admin creates a new perk
    new_perk_res = client.post(
        "/rewards/perks",
        headers=root,
        json={
            "title": "Weekend Cinema Pass",
            "description": "Two free movie tickets at PVR/INOX",
            "points_cost": 350,
            "category": "voucher",
            "icon": "🎬",
            "is_active": True,
        },
    )
    assert new_perk_res.status_code == 201, new_perk_res.text
    perk_data = new_perk_res.json()
    assert perk_data["title"] == "Weekend Cinema Pass"
    assert perk_data["points_cost"] == 350
    perk_id = perk_data["id"]

    # 2. Super admin edits the perk (change title, price, icon)
    edit_res = client.patch(
        f"/rewards/perks/{perk_id}",
        headers=root,
        json={
            "title": "VIP Cinema & Popcorn Pass",
            "points_cost": 400,
            "icon": "🍿",
        },
    )
    assert edit_res.status_code == 200, edit_res.text
    assert edit_res.json()["title"] == "VIP Cinema & Popcorn Pass"
    assert edit_res.json()["points_cost"] == 400
    assert edit_res.json()["icon"] == "🍿"

    # 3. Super admin customizes badge tiers and labels in reward_settings
    custom_tiers = [
        {"name": "Rookie Champion", "badge": "🌱", "min_points": 0, "max_points": 299},
        {"name": "Veteran Specialist", "badge": "🛡️", "min_points": 300, "max_points": 999},
        {"name": "Grandmaster", "badge": "👑", "min_points": 1000, "max_points": None},
    ]
    set_res = client.put(
        "/rewards/settings",
        headers=root,
        json={"tier_config": custom_tiers},
    )
    assert set_res.status_code == 200, set_res.text
    assert set_res.json()["tier_config"][0]["name"] == "Rookie Champion"
    assert set_res.json()["tier_config"][0]["badge"] == "🌱"

    # 4. Check that user's badge tier in /rewards/me immediately reflects the new custom badge!
    me_res = client.get("/rewards/me", headers=agent)
    assert me_res.status_code == 200, me_res.text
    tier_info = me_res.json()["tier"]
    assert tier_info["current_tier"] in ["Rookie Champion", "Veteran Specialist", "Grandmaster"]

    # 5. Super admin deletes the created perk
    del_res = client.delete(f"/rewards/perks/{perk_id}", headers=root)
    assert del_res.status_code == 200, del_res.text
    assert del_res.json()["success"] is True

    # 6. Restore default tiers to prevent test pollution
    client.put(
        "/rewards/settings",
        headers=root,
        json={"tier_config": [
            {"name": "Bronze Resolver", "badge": "🥉", "min_points": 0, "max_points": 499},
            {"name": "Silver Specialist", "badge": "🥈", "min_points": 500, "max_points": 1999},
            {"name": "Gold Champion", "badge": "🥇", "min_points": 2000, "max_points": 4999},
            {"name": "Platinum Legend", "badge": "💎", "min_points": 5000, "max_points": None},
        ]},
    )


def test_reopen_clawback(client, login, end_user_login):
    agent_headers = login(ELEC_AGENT)
    citizen_headers = end_user_login()

    # File and resolve complaint
    cid = file_complaint(client, citizen_headers, title="Noise issue in community park")
    act(client, agent_headers, cid, "start_progress")
    act(client, agent_headers, cid, "resolve", note="Patrol dispersed the loud gathering")

    me_resolved = client.get("/rewards/me", headers=agent_headers).json()
    bal_resolved = me_resolved["balance"]

    # Citizen reopens complaint
    reopen_res = client.post(
        f"/portal/complaints/{cid}/reopen",
        headers=citizen_headers,
        json={"reason": "They came back after 10 minutes and made more noise"},
    )
    assert reopen_res.status_code == 200, reopen_res.text

    # Agent balance clawed back
    me_clawed = client.get("/rewards/me", headers=agent_headers).json()
    assert me_clawed["balance"] < bal_resolved
    rule_types = [tx["rule_type"] for tx in me_clawed["recent_transactions"]]
    assert "reopen_clawback" in rule_types


def test_manual_deduction_and_badge_recalibration(client, login):
    root = login(SUPER_ADMIN)
    agent = login(ELEC_AGENT)

    me_agent = client.get("/auth/me", headers=agent).json()
    agent_id = me_agent["id"]

    # 1. Give massive points to reach high tier
    adj_award = client.post(
        "/rewards/admin/adjust",
        headers=root,
        json={"user_id": agent_id, "points": 1000, "description": "Outstanding annual contribution"},
    )
    assert adj_award.status_code in [200, 201], adj_award.text

    summary_high = client.get("/rewards/me", headers=agent).json()
    assert summary_high["balance"] >= 1000
    assert summary_high["lifetime_points"] >= 1000
    high_tier = summary_high["tier"]["current_tier"]
    assert high_tier == "Silver Specialist"

    # 2. Deduct points to trigger downward recalibration
    adj_deduct = client.post(
        "/rewards/admin/adjust",
        headers=root,
        json={"user_id": agent_id, "points": -950, "description": "SLA Negligence / Delay Penalty"},
    )
    assert adj_deduct.status_code in [200, 201], adj_deduct.text
    deduct_tx = adj_deduct.json()
    assert deduct_tx["points"] == -950
    assert "+-" not in deduct_tx["description"]

    summary_low = client.get("/rewards/me", headers=agent).json()
    assert summary_low["lifetime_points"] < 500
    low_tier = summary_low["tier"]["current_tier"]
    assert low_tier == "Bronze Resolver"
    assert low_tier != high_tier


def test_monthly_quests_and_department_cup(client, login):
    agent = login(ELEC_AGENT)

    # 1. Monthly Quests
    quests_res = client.get("/rewards/quests", headers=agent)
    assert quests_res.status_code == 200, quests_res.text
    quests = quests_res.json()
    assert len(quests) == 3
    quest_ids = [q["id"] for q in quests]
    assert "speed_sprint" in quest_ids
    assert "citizen_hero" in quest_ids
    assert "clean_sweep" in quest_ids
    for q in quests:
        assert "target" in q
        assert "current" in q
        assert "progress_pct" in q

    # 2. Department Cup Leaderboard
    cup_res = client.get("/rewards/departments", headers=agent)
    assert cup_res.status_code == 200, cup_res.text
    dept_cup = cup_res.json()
    assert len(dept_cup) > 0
    first_dept = dept_cup[0]
    assert "department_id" in first_dept
    assert "department_name" in first_dept
    assert "total_points" in first_dept
    assert "total_resolved" in first_dept
    assert "trophy" in first_dept


def test_potential_duplicates_and_scorecard(client, login, end_user_login):
    agent = login(ELEC_AGENT)
    citizen = end_user_login()

    # 1. Public Scorecard
    sc_res = client.get("/public/scorecard")
    assert sc_res.status_code == 200, sc_res.text
    scorecard = sc_res.json()
    assert "citywide_sla_compliance_pct" in scorecard
    assert "total_complaints_registered" in scorecard
    assert "total_complaints_resolved" in scorecard
    assert "departments" in scorecard

    # 2. Potential Duplicates Detection
    c1 = file_complaint(client, citizen, title="Damaged transformer sparking on Park Avenue")
    c2 = file_complaint(client, citizen, title="Transformer sparking heavily near Park Avenue corner")

    dupes_res = client.get(f"/complaints/{c2}/potential-duplicates", headers=agent)
    assert dupes_res.status_code == 200, dupes_res.text
    dupes = dupes_res.json()
    assert len(dupes) >= 1
    found_ids = [d["generated_id"] for d in dupes]
    assert c1 in found_ids


