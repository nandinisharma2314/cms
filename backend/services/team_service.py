"""Team management service for Managers and Team Leads.

Provides team hierarchy discovery, performance aggregation using the
same standard calculations as analytics_service, workload distribution,
and complaint reassignment within team scope.
"""
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from models import Complaint, ComplaintAssignment, ComplaintEvent, User, max_length
from services import analytics_service, audit_service, routing_service, settings_service
from services.access_service import AccessContext
from services.analytics_service import Filters, Row, _hours, _performance_row, load_rows, metrics
from services.user_service import serialize_role, serialize_users
from utils.security import utcnow
from utils.text import single_line


def get_direct_reports(db: Session, manager_id: int) -> list[User]:
    """Returns direct subordinates of a manager."""
    return (
        db.query(User)
        .options(selectinload(User.scopes), selectinload(User.custom_permissions))
        .filter(User.reports_to_id == manager_id)
        .order_by(User.name)
        .all()
    )


def get_all_subordinates(db: Session, manager_id: int) -> list[User]:
    """Recursively returns all subordinates (direct + indirect) under a manager."""
    visited = set()
    result = []
    to_visit = [manager_id]

    while to_visit:
        curr_id = to_visit.pop(0)
        directs = (
            db.query(User)
            .options(selectinload(User.scopes), selectinload(User.custom_permissions))
            .filter(User.reports_to_id == curr_id)
            .all()
        )
        for d in directs:
            if d.id not in visited:
                visited.add(d.id)
                result.append(d)
                to_visit.append(d.id)

    return sorted(result, key=lambda u: u.name)


def get_team_filters(db: Session, date_from: date | None = None, date_to: date | None = None) -> Filters:
    """Builds date filters defaulting to the last 30 days in organisation timezone."""
    tz = settings_service.timezone(db)
    today = utcnow().astimezone(tz).date()
    end_date = date_to or today
    start_date = date_from or (end_date - timedelta(days=29))
    return Filters(start_date, end_date, tz)


def get_team_dashboard(
    ctx: AccessContext,
    date_from: date | None = None,
    date_to: date | None = None,
    direct_only: bool = False,
) -> dict[str, Any]:
    """Produces the complete team overview: aggregated KPIs, workload summary, and member table."""
    db = ctx.db
    manager = ctx.user

    members = get_direct_reports(db, manager.id) if direct_only else get_all_subordinates(db, manager.id)
    # If the user has no direct reports but has team.view (e.g. manager testing), include themselves or subordinates
    member_ids = [m.id for m in members]

    filters = get_team_filters(db, date_from, date_to)

    if not member_ids:
        return {
            "period": {"date_from": filters.date_from.isoformat(), "date_to": filters.date_to.isoformat()},
            "team_size": 0,
            "aggregate": None,
            "members": [],
        }

    # Load complaints in period within scope
    rows = load_rows(ctx, filters)
    team_rows = [r for r in rows if r.assignee_id in member_ids]

    # Aggregate metrics for the whole team
    team_metrics = metrics(team_rows)

    # Per-member performance stats
    rows_by_assignee: dict[int, list[Row]] = {uid: [] for uid in member_ids}
    for r in team_rows:
        if r.assignee_id in rows_by_assignee:
            rows_by_assignee[r.assignee_id].append(r)

    # Count currently active complaints per member (not restricted to period)
    active_statuses = ("SUBMITTED", "ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS", "WAITING_FOR_INFORMATION", "REOPENED")
    active_counts = {
        row[0]: row[1]
        for row in (
            db.query(Complaint.assigned_to_id, db.query(Complaint.id).filter(Complaint.assigned_to_id == User.id, Complaint.status.in_(active_statuses)).count())
            .filter(User.id.in_(member_ids))
            .all()
        )
    } if False else {}

    # More efficient active query:
    from sqlalchemy import func
    active_grouped = (
        db.query(Complaint.assigned_to_id, func.count(Complaint.id))
        .filter(Complaint.assigned_to_id.in_(member_ids), Complaint.status.in_(active_statuses))
        .group_by(Complaint.assigned_to_id)
        .all()
    )
    active_counts = {uid: count for uid, count in active_grouped}

    member_stats = []
    for m in members:
        m_rows = rows_by_assignee.get(m.id, [])
        perf = _performance_row(
            m.name,
            m_rows,
            extra={
                "id": m.id,
                "email": m.email,
                "role": m.role.name,
                "is_available": m.is_available,
                "is_active": m.is_active,
                "current_active_complaints": active_counts.get(m.id, 0),
                "reports_to_id": m.reports_to_id,
                "reports_to_name": m.reports_to.name if m.reports_to else None,
                "primary_department": {"id": m.primary_department.id, "name": m.primary_department.name} if m.primary_department else None,
                "primary_location": {"id": m.primary_location.id, "name": m.primary_location.name} if m.primary_location else None,
            },
        )
        member_stats.append(perf)

    return {
        "period": {"date_from": filters.date_from.isoformat(), "date_to": filters.date_to.isoformat()},
        "team_size": len(members),
        "aggregate": {
            "total_assigned": team_metrics["total"],
            "pending": team_metrics["pending"],
            "resolved": team_metrics["resolved"],
            "rejected": team_metrics["rejected"],
            "escalated_now": team_metrics["escalated_now"],
            "avg_response_hours": team_metrics["response_hours"]["avg"],
            "avg_resolution_hours": team_metrics["resolution_hours"]["avg"],
            "response_sla_pct": team_metrics["response_sla"]["met_pct"],
            "resolution_sla_pct": team_metrics["resolution_sla"]["met_pct"],
            "sla_breaches": team_metrics["sla_breaches"],
            "avg_rating": team_metrics["avg_rating"],
            "reopen_pct": team_metrics["reopen_pct"],
        },
        "members": member_stats,
    }


def reassign_team_complaint(
    db: Session,
    ctx: AccessContext,
    complaint_id: str,
    new_assignee_id: int,
    reason: str | None,
) -> Complaint:
    """Allows a manager or team lead to reassign a complaint to a team member."""
    complaint = db.query(Complaint).filter(Complaint.generated_id == complaint_id).first()
    if not complaint and str(complaint_id).isdigit():
        complaint = db.get(Complaint, int(complaint_id))
    if not complaint:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Complaint not found")

    new_assignee = db.get(User, new_assignee_id)
    if not new_assignee or not new_assignee.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Assignee not found or inactive")

    # Verify that the new assignee is in the manager's team or manageable
    subordinates = {u.id for u in get_all_subordinates(db, ctx.user.id)}
    if not ctx.is_super_admin and new_assignee.id not in subordinates and new_assignee.id != ctx.user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Assignee is not a member of your team")

    old_assignee_id = complaint.assigned_to_id
    old_assignee_name = complaint.assigned_to.name if complaint.assigned_to else "Unassigned"

    # End current open assignment
    open_assignment = (
        db.query(ComplaintAssignment)
        .filter(ComplaintAssignment.complaint_id == complaint.id, ComplaintAssignment.ended_at.is_(None))
        .first()
    )
    if open_assignment:
        open_assignment.ended_at = utcnow()

    complaint.assigned_to = new_assignee
    if complaint.status == "SUBMITTED":
        complaint.status = "ASSIGNED"

    clean_reason = single_line(reason, "Reason", max_length(ComplaintAssignment.reason), required=False)

    assignment = ComplaintAssignment(
        complaint_id=complaint.id,
        assignee_id=new_assignee.id,
        method="manual",
        reason=clean_reason or "Team workload rebalance by manager",
        assigned_by_id=ctx.user.id,
    )
    db.add(assignment)

    event = ComplaintEvent(
        complaint_id=complaint.id,
        event_type="assigned",
        actor_type="staff",
        actor_id=ctx.user.id,
        actor_name=ctx.user.name,
        from_status=complaint.status,
        to_status=complaint.status,
        message=f"Reassigned from {old_assignee_name} to {new_assignee.name} by {ctx.user.name}.",
        note=clean_reason,
    )
    db.add(event)
    db.commit()

    return complaint
