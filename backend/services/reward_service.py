import csv
import io
import json
from datetime import datetime, timedelta
from typing import Any, Iterable

from fastapi import HTTPException, status
from fastapi.responses import Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from models import (
    Complaint, Department, Location, Priority, Role, User, ComplaintEvent,
    RewardSettings, RewardTransaction, RewardPerk, RewardRedemption,
    REWARD_RULE_RESOLUTION, REWARD_RULE_ON_TIME, REWARD_RULE_SPEED_BONUS, REWARD_RULE_FIVE_STAR,
    REWARD_RULE_FOUR_STAR, REWARD_RULE_ZERO_REOPEN, REWARD_RULE_STREAK,
    REWARD_RULE_MANUAL, REWARD_RULE_PERK_REDEMPTION, REWARD_RULE_REOPEN_CLAWBACK,
)
from services import notification_service
from services.team_service import get_all_subordinates
from utils.security import utcnow

DEFAULT_ELIGIBLE_ROLES = ["agent", "field_worker", "supervisor", "manager", "admin"]
DEFAULT_PRIORITY_MULTIPLIERS = {
    "critical": 2.0,
    "danger": 1.5,
    "warning": 1.2,
    "info": 1.0,
    "neutral": 1.0,
}

TIERS = [
    {"name": "Bronze Resolver", "badge": "🥉", "min_points": 0, "max_points": 499},
    {"name": "Silver Specialist", "badge": "🥈", "min_points": 500, "max_points": 1999},
    {"name": "Gold Champion", "badge": "🥇", "min_points": 2000, "max_points": 4999},
    {"name": "Platinum Legend", "badge": "💎", "min_points": 5000, "max_points": None},
]


def calculate_user_tier(lifetime_points: int) -> dict[str, Any]:
    points = max(0, lifetime_points)
    if points < 500:
        tier = TIERS[0]
        next_tier = TIERS[1]
        progress = int((points / 500) * 100)
        needed = 500 - points
    elif points < 2000:
        tier = TIERS[1]
        next_tier = TIERS[2]
        progress = int(((points - 500) / 1500) * 100)
        needed = 2000 - points
    elif points < 5000:
        tier = TIERS[2]
        next_tier = TIERS[3]
        progress = int(((points - 2000) / 3000) * 100)
        needed = 5000 - points
    else:
        tier = TIERS[3]
        next_tier = None
        progress = 100
        needed = 0

    return {
        "current_tier": tier["name"],
        "badge": tier["badge"],
        "next_tier": next_tier["name"] if next_tier else None,
        "progress_pct": min(100, max(0, progress)),
        "points_to_next_tier": needed,
    }



def get_reward_settings(db: Session) -> RewardSettings:
    """Returns the singleton RewardSettings row, creating it if it doesn't exist."""
    settings = db.query(RewardSettings).filter(RewardSettings.id == 1).first()
    if not settings:
        settings = RewardSettings(
            id=1,
            is_enabled=True,
            currency_name="Points",
            currency_symbol="🪙",
            eligible_roles=json.dumps(DEFAULT_ELIGIBLE_ROLES),
            points_on_time_resolution=50,
            points_speed_bonus=25,
            points_five_star=30,
            points_four_star=15,
            points_zero_reopen=20,
            streak_interval=10,
            streak_bonus=100,
            priority_multipliers=json.dumps(DEFAULT_PRIORITY_MULTIPLIERS),
            updated_at=utcnow(),
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def serialize_reward_settings(s: RewardSettings) -> dict[str, Any]:
    try:
        eligible_roles = json.loads(s.eligible_roles) if isinstance(s.eligible_roles, str) else s.eligible_roles
    except Exception:
        eligible_roles = DEFAULT_ELIGIBLE_ROLES

    try:
        priority_multipliers = (
            json.loads(s.priority_multipliers) if isinstance(s.priority_multipliers, str) else s.priority_multipliers
        )
    except Exception:
        priority_multipliers = DEFAULT_PRIORITY_MULTIPLIERS

    return {
        "id": s.id,
        "is_enabled": s.is_enabled,
        "currency_name": s.currency_name,
        "currency_symbol": s.currency_symbol,
        "eligible_roles": eligible_roles,
        "points_on_time_resolution": s.points_on_time_resolution,
        "points_speed_bonus": s.points_speed_bonus,
        "points_five_star": s.points_five_star,
        "points_four_star": s.points_four_star,
        "points_zero_reopen": s.points_zero_reopen,
        "streak_interval": s.streak_interval,
        "streak_bonus": s.streak_bonus,
        "priority_multipliers": priority_multipliers,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        "updated_by": {"id": s.updated_by.id, "name": s.updated_by.name} if s.updated_by else None,
    }


def update_reward_settings(db: Session, data: dict[str, Any], user: User) -> dict[str, Any]:
    settings = get_reward_settings(db)
    if "is_enabled" in data:
        settings.is_enabled = bool(data["is_enabled"])
    if "currency_name" in data and str(data["currency_name"]).strip():
        settings.currency_name = str(data["currency_name"]).strip()[:50]
    if "currency_symbol" in data and str(data["currency_symbol"]).strip():
        settings.currency_symbol = str(data["currency_symbol"]).strip()[:10]
    if "eligible_roles" in data:
        roles = data["eligible_roles"]
        if isinstance(roles, list):
            settings.eligible_roles = json.dumps(roles)
    if "points_on_time_resolution" in data:
        settings.points_on_time_resolution = max(0, int(data["points_on_time_resolution"]))
    if "points_speed_bonus" in data:
        settings.points_speed_bonus = max(0, int(data["points_speed_bonus"]))
    if "points_five_star" in data:
        settings.points_five_star = max(0, int(data["points_five_star"]))
    if "points_four_star" in data:
        settings.points_four_star = max(0, int(data["points_four_star"]))
    if "points_zero_reopen" in data:
        settings.points_zero_reopen = max(0, int(data["points_zero_reopen"]))
    if "streak_interval" in data:
        settings.streak_interval = max(1, int(data["streak_interval"]))
    if "streak_bonus" in data:
        settings.streak_bonus = max(0, int(data["streak_bonus"]))
    if "priority_multipliers" in data:
        multipliers = data["priority_multipliers"]
        if isinstance(multipliers, dict):
            settings.priority_multipliers = json.dumps(multipliers)

    settings.updated_at = utcnow()
    settings.updated_by_id = user.id
    db.commit()
    db.refresh(settings)
    return serialize_reward_settings(settings)


def _is_role_eligible(settings: RewardSettings, role: Role | None) -> bool:
    if not role:
        return False
    try:
        eligible = json.loads(settings.eligible_roles) if isinstance(settings.eligible_roles, str) else settings.eligible_roles
    except Exception:
        eligible = DEFAULT_ELIGIBLE_ROLES
    return role.key in eligible


def _get_priority_multiplier(settings: RewardSettings, priority: Priority | None) -> float:
    if not priority:
        return 1.0
    try:
        multipliers = (
            json.loads(settings.priority_multipliers)
            if isinstance(settings.priority_multipliers, str)
            else settings.priority_multipliers
        )
    except Exception:
        multipliers = DEFAULT_PRIORITY_MULTIPLIERS

    # check key or tone
    tone = (priority.tone or "").lower()
    key = (priority.key or "").lower()
    name = (priority.name or "").lower()
    for candidate in (tone, key, name):
        if candidate in multipliers:
            try:
                return float(multipliers[candidate])
            except (ValueError, TypeError):
                pass
    return 1.0


def _apply_reward_transaction(
    db: Session,
    user: User,
    rule_type: str,
    points: int,
    description: str,
    complaint: Complaint | None = None,
    at: datetime | None = None,
    send_notification: bool = True,
) -> RewardTransaction:
    now = at or utcnow()
    tx = RewardTransaction(
        user_id=user.id,
        complaint_id=complaint.id if complaint else None,
        department_id=complaint.department_id if complaint else user.primary_department_id,
        location_id=complaint.location_id if complaint else user.primary_location_id,
        rule_type=rule_type,
        points=points,
        description=description,
        created_at=now,
    )
    db.add(tx)
    user.reward_points_balance = max(0, (user.reward_points_balance or 0) + points)
    if points > 0:
        user.lifetime_reward_points = (user.lifetime_reward_points or 0) + points
    else:
        # Deduction recalibrates lifetime points downwards so the tier & badge immediately reflect the penalty!
        user.lifetime_reward_points = max(0, (user.lifetime_reward_points or 0) + points)

    db.flush()

    # Send in-app notification to staff member
    if send_notification:
        settings = get_reward_settings(db)
        if points >= 0:
            msg_title = f"{settings.currency_symbol} You earned +{points} {settings.currency_name}!"
            event_type = "reward.earned"
        else:
            msg_title = f"{settings.currency_symbol} {abs(points)} {settings.currency_name} were deducted from your balance."
            event_type = "reward.deducted"

        notification_service.notify(
            db,
            [user],
            event_type,
            msg_title,
            description,
            complaint=complaint,
            at=now,
        )
    return tx


def evaluate_resolution_reward(
    db: Session,
    complaint: Complaint,
    actor: User,
    at: datetime | None = None,
    send_notification: bool = True,
) -> list[RewardTransaction]:
    """Triggered when complaint is marked RESOLVED."""
    settings = get_reward_settings(db)
    if not settings.is_enabled:
        return []

    # Identify recipient:
    # If assigned to an eligible staff member, they are the primary solver!
    # Otherwise fallback to the actor if eligible.
    recipient = None
    if complaint.assigned_to and _is_role_eligible(settings, complaint.assigned_to.role):
        recipient = complaint.assigned_to
    elif actor and _is_role_eligible(settings, actor.role):
        recipient = actor

    if not recipient:
        return []

    # Check already awarded on_time_resolution or resolution_completed for this complaint to avoid double-minting
    existing = (
        db.query(RewardTransaction)
        .filter(
            RewardTransaction.complaint_id == complaint.id,
            RewardTransaction.rule_type.in_([REWARD_RULE_ON_TIME, REWARD_RULE_RESOLUTION]),
        )
        .first()
    )
    if existing:
        return []

    now = at or utcnow()
    resolved_at = complaint.resolved_at or now
    created_at = complaint.created_at
    resolution_due_at = complaint.resolution_due_at

    # On-time resolution check
    is_on_time = resolution_due_at is None or resolved_at <= resolution_due_at

    created_txs: list[RewardTransaction] = []
    multiplier = _get_priority_multiplier(settings, complaint.priority)

    if is_on_time:
        base_points = int(round(settings.points_on_time_resolution * multiplier))
        if base_points > 0:
            tx1 = _apply_reward_transaction(
                db,
                recipient,
                REWARD_RULE_ON_TIME,
                base_points,
                f"Resolved {complaint.generated_id} within SLA target ({multiplier}x priority multiplier)",
                complaint,
                at=now,
                send_notification=send_notification,
            )
            created_txs.append(tx1)

        # Speed Demon bonus: resolved in <= 50% of the total SLA target duration
        if resolution_due_at and resolution_due_at > created_at and settings.points_speed_bonus > 0:
            total_sla_seconds = (resolution_due_at - created_at).total_seconds()
            actual_seconds = (resolved_at - created_at).total_seconds()
            if actual_seconds <= (total_sla_seconds * 0.5):
                speed_points = int(round(settings.points_speed_bonus * multiplier))
                tx_speed = _apply_reward_transaction(
                    db,
                    recipient,
                    REWARD_RULE_SPEED_BONUS,
                    speed_points,
                    f"Speed Bonus: Resolved {complaint.generated_id} in under 50% of SLA time window",
                    complaint,
                    at=now,
                    send_notification=send_notification,
                )
                created_txs.append(tx_speed)

        # Streak bonus check: count on-time resolutions by this user
        if settings.streak_interval > 0 and settings.streak_bonus > 0:
            total_on_time = (
                db.query(func.count(RewardTransaction.id))
                .filter(
                    RewardTransaction.user_id == recipient.id,
                    RewardTransaction.rule_type == REWARD_RULE_ON_TIME,
                )
                .scalar()
                or 0
            )
            if total_on_time > 0 and total_on_time % settings.streak_interval == 0:
                tx_streak = _apply_reward_transaction(
                    db,
                    recipient,
                    REWARD_RULE_STREAK,
                    settings.streak_bonus,
                    f"Streak Milestone: {total_on_time} consecutive complaints resolved on time!",
                    complaint,
                    at=now,
                    send_notification=send_notification,
                )
                created_txs.append(tx_streak)
    else:
        # Standard resolution points for resolving overdue complaints
        base_points = max(10, int(round((settings.points_on_time_resolution // 2) * multiplier)))
        if base_points > 0:
            tx_late = _apply_reward_transaction(
                db,
                recipient,
                REWARD_RULE_RESOLUTION,
                base_points,
                f"Resolved {complaint.generated_id} ({multiplier}x priority multiplier)",
                complaint,
                at=now,
                send_notification=send_notification,
            )
            created_txs.append(tx_late)

    return created_txs


def evaluate_feedback_reward(
    db: Session,
    complaint: Complaint,
    rating: int,
    at: datetime | None = None,
    send_notification: bool = True,
) -> list[RewardTransaction]:
    """Triggered when end-user submits feedback rating."""
    settings = get_reward_settings(db)
    if not settings.is_enabled:
        return []

    handler = complaint.assigned_to
    if not handler:
        prev_tx = (
            db.query(RewardTransaction)
            .filter(
                RewardTransaction.complaint_id == complaint.id,
                RewardTransaction.rule_type.in_([REWARD_RULE_ON_TIME, REWARD_RULE_RESOLUTION]),
            )
            .first()
        )
        if prev_tx:
            handler = prev_tx.user

    if not handler or not _is_role_eligible(settings, handler.role):
        return []

    now = at or utcnow()
    created_txs: list[RewardTransaction] = []

    # Anti-gaming guardrail: maximum 2 ratings per citizen per handler within 24 hours
    if complaint.end_user_id:
        day_ago = now - timedelta(hours=24)
        recent_feedback_count = (
            db.query(func.count(RewardTransaction.id))
            .join(Complaint, RewardTransaction.complaint_id == Complaint.id)
            .filter(
                RewardTransaction.user_id == handler.id,
                Complaint.end_user_id == complaint.end_user_id,
                RewardTransaction.rule_type.in_([REWARD_RULE_FIVE_STAR, REWARD_RULE_FOUR_STAR]),
                RewardTransaction.created_at >= day_ago,
            )
            .scalar()
            or 0
        )
        if recent_feedback_count >= 2:
            return []

    if rating == 5 and settings.points_five_star > 0:
        tx = _apply_reward_transaction(
            db,
            handler,
            REWARD_RULE_FIVE_STAR,
            settings.points_five_star,
            f"Citizen 5★ Review on {complaint.generated_id}",
            complaint,
            at=now,
            send_notification=send_notification,
        )
        created_txs.append(tx)
    elif rating == 4 and settings.points_four_star > 0:
        tx = _apply_reward_transaction(
            db,
            handler,
            REWARD_RULE_FOUR_STAR,
            settings.points_four_star,
            f"Citizen 4★ Review on {complaint.generated_id}",
            complaint,
            at=now,
            send_notification=send_notification,
        )
        created_txs.append(tx)

    return created_txs


def evaluate_reopen_clawback(
    db: Session, complaint: Complaint, at: datetime | None = None,
) -> list[RewardTransaction]:
    """Triggered when complaint is REOPENED. Claws back prematurely awarded resolution points."""
    settings = get_reward_settings(db)
    if not settings.is_enabled:
        return []

    prev_txs = (
        db.query(RewardTransaction)
        .filter(
            RewardTransaction.complaint_id == complaint.id,
            RewardTransaction.rule_type.in_([REWARD_RULE_ON_TIME, REWARD_RULE_RESOLUTION, REWARD_RULE_SPEED_BONUS]),
        )
        .all()
    )
    if not prev_txs:
        return []

    already_clawed = (
        db.query(RewardTransaction)
        .filter(
            RewardTransaction.complaint_id == complaint.id,
            RewardTransaction.rule_type == REWARD_RULE_REOPEN_CLAWBACK,
        )
        .first()
    )
    if already_clawed:
        return []

    total_clawback = sum(t.points for t in prev_txs)
    if total_clawback <= 0:
        return []

    now = at or utcnow()
    handler = prev_txs[0].user
    desc = f"Clawback: {complaint.generated_id} was reopened by citizen (Premature resolution points reversed)"
    tx = _apply_reward_transaction(
        db,
        handler,
        REWARD_RULE_REOPEN_CLAWBACK,
        -total_clawback,
        desc,
        complaint,
        at=now,
    )
    return [tx]


def evaluate_closure_reward(
    db: Session,
    complaint: Complaint,
    at: datetime | None = None,
    send_notification: bool = True,
) -> list[RewardTransaction]:
    """Triggered when complaint is CLOSED."""
    settings = get_reward_settings(db)
    if not settings.is_enabled or settings.points_zero_reopen <= 0:
        return []

    handler = complaint.assigned_to
    if not handler:
        prev_tx = (
            db.query(RewardTransaction)
            .filter(
                RewardTransaction.complaint_id == complaint.id,
                RewardTransaction.rule_type.in_([REWARD_RULE_ON_TIME, REWARD_RULE_RESOLUTION]),
            )
            .first()
        )
        if prev_tx:
            handler = prev_tx.user

    if not handler or not _is_role_eligible(settings, handler.role):
        return []

    # First-time resolution check: 0 reopens
    if complaint.reopen_count > 0:
        return []

    # Avoid duplicate zero_reopen award
    existing = (
        db.query(RewardTransaction)
        .filter(
            RewardTransaction.complaint_id == complaint.id,
            RewardTransaction.rule_type == REWARD_RULE_ZERO_REOPEN,
        )
        .first()
    )
    if existing:
        return []

    now = at or utcnow()
    tx = _apply_reward_transaction(
        db,
        handler,
        REWARD_RULE_ZERO_REOPEN,
        settings.points_zero_reopen,
        f"First-Time Resolution Bonus on {complaint.generated_id} (Closed with zero reopens)",
        complaint,
        at=now,
        send_notification=send_notification,
    )
    return [tx]


def backfill_historical_rewards(db: Session) -> dict[str, Any]:
    """Scans all historical resolved or closed complaints and backfills earned reward points."""
    settings = get_reward_settings(db)
    if not settings.is_enabled:
        settings.is_enabled = True
        db.commit()

    # Ensure eligible_roles includes administrative and operational roles
    try:
        roles = json.loads(settings.eligible_roles) if isinstance(settings.eligible_roles, str) else settings.eligible_roles
    except Exception:
        roles = []
    updated_roles = list(set(roles + ["agent", "field_worker", "supervisor", "manager", "admin"]))
    settings.eligible_roles = json.dumps(updated_roles)
    db.commit()

    complaints = (
        db.query(Complaint)
        .filter(Complaint.status.in_(["RESOLVED", "CLOSED"]))
        .order_by(Complaint.created_at.asc())
        .all()
    )

    complaints_scanned = 0
    txs_created = 0

    for c in complaints:
        complaints_scanned += 1
        res_time = c.resolved_at or c.closed_at or c.updated_at

        # Determine resolver actor
        actor = c.assigned_to
        if not actor:
            ev = (
                db.query(ComplaintEvent)
                .filter(ComplaintEvent.complaint_id == c.id, ComplaintEvent.to_status == "RESOLVED")
                .order_by(ComplaintEvent.id.desc())
                .first()
            )
            if ev and ev.actor_id and ev.actor_type == "staff":
                actor = db.query(User).filter(User.id == ev.actor_id).first()

        if actor:
            txs = evaluate_resolution_reward(db, c, actor, at=res_time, send_notification=False)
            txs_created += len(txs)

        if c.status == "CLOSED":
            txs_close = evaluate_closure_reward(db, c, at=c.closed_at or res_time, send_notification=False)
            txs_created += len(txs_close)

        if c.feedback_rating:
            txs_fb = evaluate_feedback_reward(db, c, c.feedback_rating, at=c.feedback_at or res_time, send_notification=False)
            txs_created += len(txs_fb)

    db.commit()

    return {
        "complaints_scanned": complaints_scanned,
        "transactions_created": txs_created,
    }


def award_manual_points(
    db: Session, user_id: int, points: int, description: str, admin_user: User, at: datetime | None = None,
) -> RewardTransaction:
    target_user = db.get(User, user_id)
    if not target_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff member not found")

    action_label = "Deducted" if points < 0 else "Awarded"
    desc = f"{description.strip()} ({action_label} by {admin_user.name})"
    tx = _apply_reward_transaction(
        db, target_user, REWARD_RULE_MANUAL, points, desc, complaint=None, at=at,
    )
    db.commit()
    db.refresh(tx)
    return tx


# ---------------------------------------------------------------------------
# Queries, Filters & Analytics for Super Admin & Staff
# ---------------------------------------------------------------------------

def _apply_reward_filters(
    query,
    db: Session,
    date_from: str | None = None,
    date_to: str | None = None,
    department_id: int | None = None,
    location_id: int | None = None,
    manager_id: int | None = None,
    supervisor_id: int | None = None,
    user_id: int | None = None,
    rule_type: str | None = None,
    complaint_id: str | None = None,
    q: str | None = None,
):
    if date_from:
        try:
            df = datetime.fromisoformat(date_from)
            query = query.filter(RewardTransaction.created_at >= df)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to)
            if len(date_to) <= 10:
                dt = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
            query = query.filter(RewardTransaction.created_at <= dt)
        except ValueError:
            pass

    if department_id:
        query = query.filter(RewardTransaction.department_id == department_id)

    if location_id:
        loc = db.get(Location, location_id)
        if loc:
            descendant_ids = [
                l.id for l in db.query(Location.id).filter(Location.path.startswith(loc.path)).all()
            ]
            query = query.filter(RewardTransaction.location_id.in_(descendant_ids))

    if manager_id:
        subordinates = get_all_subordinates(db, manager_id)
        user_ids = [s.id for s in subordinates]
        if user_ids:
            query = query.filter(RewardTransaction.user_id.in_(user_ids))
        else:
            query = query.filter(RewardTransaction.user_id == -1)

    if supervisor_id:
        subordinates = (
            db.query(User.id)
            .filter(or_(User.reports_to_id == supervisor_id, User.id == supervisor_id))
            .all()
        )
        user_ids = [s[0] for s in subordinates]
        query = query.filter(RewardTransaction.user_id.in_(user_ids))

    if user_id:
        query = query.filter(RewardTransaction.user_id == user_id)

    if rule_type:
        query = query.filter(RewardTransaction.rule_type == rule_type)

    if complaint_id:
        query = query.outerjoin(Complaint, RewardTransaction.complaint_id == Complaint.id).filter(
            or_(
                Complaint.generated_id.ilike(f"%{complaint_id}%"),
                func.cast(Complaint.id, func.CHAR).ilike(f"%{complaint_id}%"),
            )
        )

    if q:
        term = f"%{q.strip()}%"
        query = (
            query.outerjoin(User, RewardTransaction.user_id == User.id)
            .outerjoin(Complaint, RewardTransaction.complaint_id == Complaint.id)
            .filter(
                or_(
                    User.name.ilike(term),
                    User.email.ilike(term),
                    RewardTransaction.description.ilike(term),
                    Complaint.generated_id.ilike(term),
                )
            )
        )

    return query


def serialize_transaction(tx: RewardTransaction) -> dict[str, Any]:
    u = tx.user
    supervisor = u.reports_to if u else None
    manager = supervisor.reports_to if supervisor else None
    return {
        "id": tx.id,
        "points": tx.points,
        "rule_type": tx.rule_type,
        "description": tx.description,
        "created_at": tx.created_at.isoformat(),
        "user": {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "avatar_url": u.avatar_url,
            "role": {"key": u.role.key, "name": u.role.name} if u and u.role else None,
            "supervisor": {"id": supervisor.id, "name": supervisor.name} if supervisor else None,
            "manager": {"id": manager.id, "name": manager.name} if manager else None,
        } if u else None,
        "complaint": {
            "id": tx.complaint.id,
            "generated_id": tx.complaint.generated_id,
            "title": tx.complaint.title,
        } if tx.complaint else None,
        "department": {"id": tx.department.id, "name": tx.department.name} if tx.department else None,
        "location": {"id": tx.location.id, "name": tx.location.name} if tx.location else None,
    }


def list_reward_transactions(
    db: Session,
    page: int = 1,
    page_size: int = 25,
    **filter_args,
) -> dict[str, Any]:
    query = db.query(RewardTransaction)
    query = _apply_reward_filters(query, db, **filter_args)

    total = query.count()
    items = (
        query.order_by(RewardTransaction.created_at.desc(), RewardTransaction.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Compute summary aggregates for current filter
    total_points = (
        _apply_reward_filters(db.query(func.coalesce(func.sum(RewardTransaction.points), 0)), db, **filter_args).scalar()
        or 0
    )
    active_recipients = (
        _apply_reward_filters(db.query(func.count(func.distinct(RewardTransaction.user_id))), db, **filter_args).scalar()
        or 0
    )

    return {
        "items": [serialize_transaction(t) for t in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_points": total_points,
        "active_recipients": active_recipients,
    }


def get_reward_stats(db: Session, **filter_args) -> dict[str, Any]:
    base_query = _apply_reward_filters(db.query(RewardTransaction), db, **filter_args)

    total_points = (
        _apply_reward_filters(db.query(func.coalesce(func.sum(RewardTransaction.points), 0)), db, **filter_args).scalar()
        or 0
    )
    total_txs = base_query.count()

    # Breakdown by rule type
    rule_breakdown = (
        _apply_reward_filters(
            db.query(
                RewardTransaction.rule_type,
                func.count(RewardTransaction.id).label("count"),
                func.sum(RewardTransaction.points).label("points"),
            ),
            db,
            **filter_args,
        )
        .group_by(RewardTransaction.rule_type)
        .all()
    )

    # Top departments
    dept_breakdown = (
        _apply_reward_filters(
            db.query(
                Department.name,
                func.sum(RewardTransaction.points).label("points"),
            ).join(RewardTransaction.department),
            db,
            **filter_args,
        )
        .group_by(Department.name)
        .order_by(func.sum(RewardTransaction.points).desc())
        .limit(5)
        .all()
    )

    return {
        "total_points": total_points,
        "total_transactions": total_txs,
        "by_rule": [{"rule": r[0], "count": r[1], "points": int(r[2] or 0)} for r in rule_breakdown],
        "by_department": [{"department": d[0], "points": int(d[1] or 0)} for d in dept_breakdown],
    }


def export_reward_transactions_csv(db: Session, **filter_args) -> Response:
    query = db.query(RewardTransaction)
    query = _apply_reward_filters(query, db, **filter_args).order_by(
        RewardTransaction.created_at.desc(), RewardTransaction.id.desc()
    )
    txs = query.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID",
        "Timestamp",
        "Staff Name",
        "Staff Email",
        "Staff Role",
        "Supervisor",
        "Manager",
        "Department",
        "Location",
        "Complaint ID",
        "Trigger Rule",
        "Points",
        "Description",
    ])

    for t in txs:
        u = t.user
        supervisor = u.reports_to.name if u and u.reports_to else "—"
        manager = u.reports_to.reports_to.name if u and u.reports_to and u.reports_to.reports_to else "—"
        writer.writerow([
            t.id,
            t.created_at.isoformat(),
            u.name if u else "—",
            u.email if u else "—",
            u.role.name if u and u.role else "—",
            supervisor,
            manager,
            t.department.name if t.department else "—",
            t.location.name if t.location else "—",
            t.complaint.generated_id if t.complaint else "—",
            t.rule_type,
            t.points,
            t.description,
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="reward_transactions.csv"'},
    )


def get_leaderboard(
    db: Session,
    timeframe: str = "month",
    department_id: int | None = None,
    location_id: int | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Returns top ranked staff members by points earned in the given timeframe."""
    now = utcnow()
    if timeframe == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif timeframe == "week":
        start = now - timedelta(days=7)
    elif timeframe == "month":
        start = now - timedelta(days=30)
    else:
        start = None

    query = (
        db.query(
            User.id,
            User.name,
            User.email,
            User.avatar_url,
            User.reward_points_balance,
            User.lifetime_reward_points,
            Role.name.label("role_name"),
            Department.name.label("dept_name"),
            Location.name.label("loc_name"),
            func.coalesce(func.sum(RewardTransaction.points), 0).label("period_points"),
            func.count(
                func.nullif(RewardTransaction.rule_type != REWARD_RULE_ON_TIME, True)
            ).label("on_time_count"),
            func.count(
                func.nullif(RewardTransaction.rule_type != REWARD_RULE_FIVE_STAR, True)
            ).label("five_star_count"),
        )
        .join(User.role)
        .outerjoin(User.primary_department)
        .outerjoin(User.primary_location)
        .outerjoin(RewardTransaction, RewardTransaction.user_id == User.id)
    )

    if start:
        query = query.filter(or_(RewardTransaction.created_at.is_(None), RewardTransaction.created_at >= start))

    if department_id:
        query = query.filter(User.primary_department_id == department_id)

    if location_id:
        loc = db.get(Location, location_id)
        if loc:
            descendant_ids = [
                l.id for l in db.query(Location.id).filter(Location.path.startswith(loc.path)).all()
            ]
            query = query.filter(User.primary_location_id.in_(descendant_ids))

    results = (
        query.group_by(
            User.id,
            User.name,
            User.email,
            User.avatar_url,
            User.reward_points_balance,
            User.lifetime_reward_points,
            Role.name,
            Department.name,
            Location.name,
        )
        .order_by(func.coalesce(func.sum(RewardTransaction.points), 0).desc())
        .limit(limit)
        .all()
    )

    leaderboard = []
    for rank, row in enumerate(results, start=1):
        leaderboard.append({
            "rank": rank,
            "user": {
                "id": row.id,
                "name": row.name,
                "email": row.email,
                "avatar_url": row.avatar_url,
                "role_name": row.role_name,
                "department": row.dept_name,
                "location": row.loc_name,
            },
            "points": int(row.period_points or 0),
            "balance": row.reward_points_balance or 0,
            "lifetime_points": row.lifetime_reward_points or 0,
            "tier": calculate_user_tier(row.lifetime_reward_points or 0),
            "on_time_count": row.on_time_count or 0,
            "five_star_count": row.five_star_count or 0,
        })
    return leaderboard


def get_user_rewards_summary(db: Session, user_id: int) -> dict[str, Any]:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    settings = get_reward_settings(db)
    recent_txs = (
        db.query(RewardTransaction)
        .filter(RewardTransaction.user_id == user_id)
        .order_by(RewardTransaction.created_at.desc())
        .limit(10)
        .all()
    )

    # Rank calculation
    higher_count = (
        db.query(func.count(User.id))
        .filter(User.lifetime_reward_points > (user.lifetime_reward_points or 0))
        .scalar()
        or 0
    )
    rank = higher_count + 1

    return {
        "balance": user.reward_points_balance or 0,
        "lifetime_points": user.lifetime_reward_points or 0,
        "rank": rank,
        "tier": calculate_user_tier(user.lifetime_reward_points or 0),
        "currency_name": settings.currency_name,
        "currency_symbol": settings.currency_symbol,
        "is_enabled": settings.is_enabled,
        "recent_transactions": [serialize_transaction(t) for t in recent_txs],
    }


# ---------------------------------------------------------------------------
# Perks & Rewards Redemption Catalog
# ---------------------------------------------------------------------------

DEFAULT_PERKS = [
    {
        "title": "Certificate of Excellence",
        "description": "Official commendation signed by Senior Department Leadership.",
        "points_cost": 200,
        "category": "certificate",
        "icon": "📜",
    },
    {
        "title": "Prime Shift / Schedule Preference",
        "description": "Priority selection of your preferred duty shift rotation for next month.",
        "points_cost": 350,
        "category": "perk",
        "icon": "⏱️",
    },
    {
        "title": "Cafeteria / Lunch Meal Pass",
        "description": "Meal voucher redeemable at partner cafeteria.",
        "points_cost": 150,
        "category": "voucher",
        "icon": "☕",
    },
    {
        "title": "Half-Day Discretionary Rest Pass",
        "description": "Flexible half-day compensatory leave pass with supervisor approval.",
        "points_cost": 500,
        "category": "leave",
        "icon": "🏖️",
    },
    {
        "title": "Amazon / Retail E-Voucher (₹500)",
        "description": "Digital shopping gift card delivered to your registered email.",
        "points_cost": 1000,
        "category": "voucher",
        "icon": "🎁",
    },
]


def seed_default_perks_if_empty(db: Session) -> None:
    count = db.query(RewardPerk).count()
    if count == 0:
        for p in DEFAULT_PERKS:
            perk = RewardPerk(
                title=p["title"],
                description=p["description"],
                points_cost=p["points_cost"],
                category=p["category"],
                icon=p["icon"],
                is_active=True,
                created_at=utcnow(),
            )
            db.add(perk)
        db.commit()


def list_perks(db: Session, include_inactive: bool = False) -> list[dict[str, Any]]:
    seed_default_perks_if_empty(db)
    query = db.query(RewardPerk)
    if not include_inactive:
        query = query.filter(RewardPerk.is_active == True)
    perks = query.order_by(RewardPerk.points_cost.asc()).all()
    return [
        {
            "id": p.id,
            "title": p.title,
            "description": p.description,
            "points_cost": p.points_cost,
            "category": p.category,
            "icon": p.icon,
            "is_active": p.is_active,
            "created_at": p.created_at.isoformat(),
        }
        for p in perks
    ]


def redeem_perk(
    db: Session, user: User, perk_id: int, notes: str | None = None,
) -> RewardRedemption:
    perk = db.get(RewardPerk, perk_id)
    if not perk or not perk.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Perk not found or inactive")

    current_balance = user.reward_points_balance or 0
    if current_balance < perk.points_cost:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Insufficient points balance ({current_balance} available, {perk.points_cost} required)",
        )

    now = utcnow()
    desc = f"Redeemed perk: {perk.title}"
    tx = _apply_reward_transaction(
        db,
        user,
        REWARD_RULE_PERK_REDEMPTION,
        -perk.points_cost,
        desc,
        complaint=None,
        at=now,
    )

    redemption = RewardRedemption(
        user_id=user.id,
        perk_id=perk.id,
        points_spent=perk.points_cost,
        status="pending" if perk.category in ("voucher", "leave") else "approved",
        notes=notes[:500] if notes else None,
        created_at=now,
        updated_at=now,
    )
    db.add(redemption)
    db.commit()
    db.refresh(redemption)
    return redemption


def list_redemptions(
    db: Session,
    user_id: int | None = None,
    status_filter: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    query = db.query(RewardRedemption)
    if user_id:
        query = query.filter(RewardRedemption.user_id == user_id)
    if status_filter:
        query = query.filter(RewardRedemption.status == status_filter)

    total = query.count()
    items = (
        query.order_by(RewardRedemption.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "user_name": r.user.name if r.user else "—",
                "user_email": r.user.email if r.user else "—",
                "perk_id": r.perk_id,
                "perk_title": r.perk.title if r.perk else "—",
                "perk_icon": r.perk.icon if r.perk else "🎁",
                "points_spent": r.points_spent,
                "status": r.status,
                "notes": r.notes,
                "admin_notes": r.admin_notes,
                "created_at": r.created_at.isoformat(),
            }
            for r in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def update_redemption_status(
    db: Session,
    redemption_id: int,
    new_status: str,
    admin_notes: str | None,
    admin_user: User,
) -> RewardRedemption:
    redemption = db.get(RewardRedemption, redemption_id)
    if not redemption:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Redemption request not found")

    if new_status not in ("pending", "approved", "fulfilled", "rejected"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid status")

    previous_status = redemption.status
    redemption.status = new_status
    redemption.admin_notes = admin_notes[:500] if admin_notes else None
    redemption.reviewed_by_id = admin_user.id
    redemption.updated_at = utcnow()

    # If rejected, refund the points!
    if new_status == "rejected" and previous_status != "rejected":
        user = redemption.user
        desc = f"Refund: Redemption #{redemption.id} ({redemption.perk.title}) was rejected"
        _apply_reward_transaction(
            db,
            user,
            REWARD_RULE_MANUAL,
            redemption.points_spent,
            desc,
            complaint=None,
        )

    db.commit()
    db.refresh(redemption)
    return redemption


def get_monthly_quests(db: Session, user_id: int) -> list[dict[str, Any]]:
    """Calculates active monthly gamification missions/quests for staff."""
    now = utcnow()
    month_start = datetime(now.year, now.month, 1)

    # 1. Speed Demon Quest (Target: 5 fast resolutions <= 50% SLA)
    speed_count = (
        db.query(func.count(RewardTransaction.id))
        .filter(
            RewardTransaction.user_id == user_id,
            RewardTransaction.rule_type == REWARD_RULE_SPEED_BONUS,
            RewardTransaction.created_at >= month_start,
        )
        .scalar()
        or 0
    )

    # 2. Citizen Favorite Quest (Target: 3 5-star ratings)
    star_count = (
        db.query(func.count(RewardTransaction.id))
        .filter(
            RewardTransaction.user_id == user_id,
            RewardTransaction.rule_type == REWARD_RULE_FIVE_STAR,
            RewardTransaction.created_at >= month_start,
        )
        .scalar()
        or 0
    )

    # 3. Clean Sweep Quest (Target: 10 zero-reopen resolutions)
    clean_count = (
        db.query(func.count(RewardTransaction.id))
        .filter(
            RewardTransaction.user_id == user_id,
            RewardTransaction.rule_type == REWARD_RULE_ZERO_REOPEN,
            RewardTransaction.created_at >= month_start,
        )
        .scalar()
        or 0
    )

    return [
        {
            "id": "speed_sprint",
            "title": "Speed Demon Sprint",
            "description": "Resolve 5 complaints in under 50% of the SLA target time window.",
            "icon": "⚡",
            "current": min(5, speed_count),
            "target": 5,
            "reward_points": 150,
            "completed": speed_count >= 5,
            "progress_pct": min(100, int((speed_count / 5) * 100)),
        },
        {
            "id": "citizen_hero",
            "title": "Citizen Favorite",
            "description": "Earn 3 top five-star reviews directly from citizens on resolved tickets.",
            "icon": "⭐",
            "current": min(3, star_count),
            "target": 3,
            "reward_points": 200,
            "completed": star_count >= 3,
            "progress_pct": min(100, int((star_count / 3) * 100)),
        },
        {
            "id": "clean_sweep",
            "title": "Flawless First-Time Fix",
            "description": "Close 10 complaints with zero citizen reopens.",
            "icon": "🎯",
            "current": min(10, clean_count),
            "target": 10,
            "reward_points": 250,
            "completed": clean_count >= 10,
            "progress_pct": min(100, int((clean_count / 10) * 100)),
        },
    ]


def get_department_leaderboard(db: Session) -> list[dict[str, Any]]:
    """Ranks departments by total reward points and SLA compliance for Department Cup competition."""
    departments = db.query(Department).all()
    results = []

    for dept in departments:
        # Total points in this department
        total_pts = (
            db.query(func.sum(RewardTransaction.points))
            .filter(RewardTransaction.department_id == dept.id)
            .scalar()
            or 0
        )
        total_pts = max(0, int(total_pts))

        # Total resolved complaints
        total_resolved = (
            db.query(func.count(Complaint.id))
            .filter(Complaint.department_id == dept.id, Complaint.status.in_(["RESOLVED", "CLOSED"]))
            .scalar()
            or 0
        )

        # On-time resolutions
        on_time_count = (
            db.query(func.count(RewardTransaction.id))
            .filter(
                RewardTransaction.department_id == dept.id,
                RewardTransaction.rule_type == REWARD_RULE_ON_TIME,
            )
            .scalar()
            or 0
        )

        sla_pct = int(round((on_time_count / total_resolved) * 100)) if total_resolved > 0 else 100

        # Find top agent in this department
        top_user_row = (
            db.query(User.name, func.sum(RewardTransaction.points).label("pts"))
            .join(RewardTransaction, User.id == RewardTransaction.user_id)
            .filter(RewardTransaction.department_id == dept.id)
            .group_by(User.id)
            .order_by(func.sum(RewardTransaction.points).desc())
            .first()
        )
        top_agent = top_user_row[0] if top_user_row else None

        results.append({
            "department_id": dept.id,
            "department_name": dept.name,
            "total_points": total_pts,
            "total_resolved": total_resolved,
            "on_time_count": on_time_count,
            "sla_compliance_pct": sla_pct,
            "top_performer": top_agent,
        })

    # Sort descending by total points
    results.sort(key=lambda x: x["total_points"], reverse=True)

    # Assign ranks & trophies
    trophies = ["🏆", "🥈", "🥉"]
    for idx, item in enumerate(results):
        item["rank"] = idx + 1
        item["trophy"] = trophies[idx] if idx < len(trophies) else f"#{idx + 1}"

    return results

