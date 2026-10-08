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
    Complaint, Department, Location, Priority, Role, User,
    RewardSettings, RewardTransaction,
    REWARD_RULE_ON_TIME, REWARD_RULE_SPEED_BONUS, REWARD_RULE_FIVE_STAR,
    REWARD_RULE_FOUR_STAR, REWARD_RULE_ZERO_REOPEN, REWARD_RULE_STREAK,
    REWARD_RULE_MANUAL,
)
from services import notification_service
from services.team_service import get_all_subordinates
from utils.security import utcnow

DEFAULT_ELIGIBLE_ROLES = ["agent", "field_worker"]
DEFAULT_PRIORITY_MULTIPLIERS = {
    "critical": 2.0,
    "danger": 1.5,
    "warning": 1.2,
    "info": 1.0,
    "neutral": 1.0,
}


def get_reward_settings(db: Session) -> RewardSettings:
    """Returns the singleton RewardSettings row, creating it if it doesn't exist."""
    settings = db.query(RewardSettings).filter(RewardSettings.id == 1).first()
    if not settings:
        settings = RewardSettings(
            id=1,
            is_enabled=False,
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

    db.flush()

    # Send in-app notification to staff member
    settings = get_reward_settings(db)
    notification_service.notify(
        db,
        [user],
        "reward.earned",
        f"{settings.currency_symbol} You earned {points} {settings.currency_name}!",
        description,
        complaint=complaint,
        at=now,
    )
    return tx


def evaluate_resolution_reward(
    db: Session, complaint: Complaint, actor: User, at: datetime | None = None,
) -> list[RewardTransaction]:
    """Triggered when complaint is marked RESOLVED."""
    settings = get_reward_settings(db)
    if not settings.is_enabled:
        return []
    if not _is_role_eligible(settings, actor.role):
        return []

    # Check already awarded on_time_resolution for this complaint to avoid double-minting
    existing = (
        db.query(RewardTransaction)
        .filter(
            RewardTransaction.complaint_id == complaint.id,
            RewardTransaction.rule_type == REWARD_RULE_ON_TIME,
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
    if not is_on_time:
        return []

    created_txs: list[RewardTransaction] = []
    multiplier = _get_priority_multiplier(settings, complaint.priority)
    base_points = int(round(settings.points_on_time_resolution * multiplier))

    if base_points > 0:
        tx1 = _apply_reward_transaction(
            db,
            actor,
            REWARD_RULE_ON_TIME,
            base_points,
            f"Resolved {complaint.generated_id} within SLA target ({multiplier}x priority multiplier)",
            complaint,
            at=now,
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
                actor,
                REWARD_RULE_SPEED_BONUS,
                speed_points,
                f"Speed Bonus: Resolved {complaint.generated_id} in under 50% of SLA time window",
                complaint,
                at=now,
            )
            created_txs.append(tx_speed)

    # Streak bonus check: count on-time resolutions by this user since the last breach
    if settings.streak_interval > 0 and settings.streak_bonus > 0:
        total_on_time = (
            db.query(func.count(RewardTransaction.id))
            .filter(
                RewardTransaction.user_id == actor.id,
                RewardTransaction.rule_type == REWARD_RULE_ON_TIME,
            )
            .scalar()
            or 0
        )
        if total_on_time > 0 and total_on_time % settings.streak_interval == 0:
            tx_streak = _apply_reward_transaction(
                db,
                actor,
                REWARD_RULE_STREAK,
                settings.streak_bonus,
                f"Streak Milestone: {total_on_time} consecutive complaints resolved on time!",
                complaint,
                at=now,
            )
            created_txs.append(tx_streak)

    return created_txs


def evaluate_feedback_reward(
    db: Session, complaint: Complaint, rating: int, at: datetime | None = None,
) -> list[RewardTransaction]:
    """Triggered when end-user submits feedback rating."""
    settings = get_reward_settings(db)
    if not settings.is_enabled:
        return []

    handler = complaint.assigned_to
    if not handler or not _is_role_eligible(settings, handler.role):
        return []

    now = at or utcnow()
    created_txs: list[RewardTransaction] = []

    if rating == 5 and settings.points_five_star > 0:
        tx = _apply_reward_transaction(
            db,
            handler,
            REWARD_RULE_FIVE_STAR,
            settings.points_five_star,
            f"Citizen 5★ Review on {complaint.generated_id}",
            complaint,
            at=now,
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
        )
        created_txs.append(tx)

    return created_txs


def evaluate_closure_reward(
    db: Session, complaint: Complaint, at: datetime | None = None,
) -> list[RewardTransaction]:
    """Triggered when complaint is CLOSED."""
    settings = get_reward_settings(db)
    if not settings.is_enabled or settings.points_zero_reopen <= 0:
        return []

    handler = complaint.assigned_to
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
    )
    return [tx]


def award_manual_points(
    db: Session, user_id: int, points: int, description: str, admin_user: User, at: datetime | None = None,
) -> RewardTransaction:
    target_user = db.get(User, user_id)
    if not target_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff member not found")

    desc = f"{description.strip()} (Awarded by {admin_user.name})"
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
        "currency_name": settings.currency_name,
        "currency_symbol": settings.currency_symbol,
        "is_enabled": settings.is_enabled,
        "recent_transactions": [serialize_transaction(t) for t in recent_txs],
    }
