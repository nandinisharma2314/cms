"""Complaint routing and assignment.

Automatic routing picks, among active and available staff whose role has
`complaint.receive` and whose scope covers the complaint's department and
location:
  1. the most specific match (department-specific scope beats "all
     departments"; then the deepest location scope wins, so an area agent
     beats a city-wide one),
  2. then the lowest workload (open + in-progress complaints assigned),
  3. then whoever was assigned a complaint least recently.
"""
from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Complaint, ComplaintAssignment, Permission, Role, User, role_permissions
from services import notification_service, sla_service
from services.access_service import AccessContext, scope_specificity, scopes_of
from services.workflow_service import (
    ACKNOWLEDGED, ACTIVE_STATUSES, ASSIGNED, CLOSED, IN_PROGRESS, REJECTED, SUBMITTED, record_event,
    status_label,
)
from utils.security import utcnow

RECEIVE_PERMISSION = "complaint.receive"


@dataclass
class Candidate:
    user: User
    specificity: tuple[int, int]
    workload: int
    last_assigned_at: datetime | None


def workloads(db: Session, user_ids: list[int]) -> dict[int, int]:
    if not user_ids:
        return {}
    rows = (
        db.query(Complaint.assigned_to_id, func.count(Complaint.id))
        .filter(Complaint.assigned_to_id.in_(user_ids), Complaint.status.in_(ACTIVE_STATUSES))
        .group_by(Complaint.assigned_to_id)
        .all()
    )
    return {user_id: count for user_id, count in rows}


def _last_assigned(db: Session, user_ids: list[int]) -> dict[int, datetime]:
    if not user_ids:
        return {}
    rows = (
        db.query(ComplaintAssignment.assignee_id, func.max(ComplaintAssignment.assigned_at))
        .filter(ComplaintAssignment.assignee_id.in_(user_ids))
        .group_by(ComplaintAssignment.assignee_id)
        .all()
    )
    return dict(rows)


def routing_candidates(db: Session, complaint: Complaint) -> list[Candidate]:
    receivers = (
        db.query(User)
        .join(Role, User.role_id == Role.id)
        .join(role_permissions, role_permissions.c.role_id == Role.id)
        .join(Permission, Permission.id == role_permissions.c.permission_id)
        .filter(Permission.key == RECEIVE_PERMISSION, User.is_active.is_(True), User.is_available.is_(True))
        .all()
    )
    matched = []
    for user in receivers:
        score = scope_specificity(scopes_of(user), complaint.department_id, complaint.location.path)
        if score is not None:
            matched.append((user, score))
    ids = [u.id for u, _ in matched]
    loads = workloads(db, ids)
    last = _last_assigned(db, ids)
    return [Candidate(u, score, loads.get(u.id, 0), last.get(u.id)) for u, score in matched]


def _rank(candidate: Candidate):
    # Highest specificity, then lowest workload, then least recently assigned (never = first).
    last = candidate.last_assigned_at
    return (
        tuple(-x for x in candidate.specificity),
        candidate.workload,
        last is not None,
        last or datetime.min,
        candidate.user.id,
    )


def assign(
    db: Session,
    complaint: Complaint,
    assignee: User,
    *,
    actor: User | None,
    method: str,
    reason: str | None = None,
    at: datetime | None = None,
) -> None:
    """Makes `assignee` the complaint's handler. Adds history; the caller commits."""
    now = at or utcnow()
    previous = complaint.assigned_to
    for row in complaint.assignments:
        if row.ended_at is None:
            row.ended_at = now
    db.add(ComplaintAssignment(
        complaint=complaint, assignee=assignee, method=method, reason=reason,
        assigned_by=actor, assigned_at=now,
    ))
    complaint.assigned_to = assignee
    complaint.assigned_at = now

    who = f"{assignee.name} ({assignee.role.name})"
    if method == "auto":
        message = f"Automatically assigned to {who}"
    elif previous is not None:
        message = f"Reassigned from {previous.name} to {who}"
    else:
        message = f"Assigned to {who}"
    if reason:
        message += f": {reason}"
    record_event(
        db, complaint, "assigned", actor, message,
        public_message=f"Assigned to an officer of the {complaint.department.name} department",
        note=reason, at=now,
    )

    # A new handler has to acknowledge it again.
    if complaint.status in (SUBMITTED, ACKNOWLEDGED, IN_PROGRESS):
        old = complaint.status
        complaint.status = ASSIGNED
        record_event(
            db, complaint, "status_changed", actor, f"Status changed from {status_label(old)} to Assigned",
            from_status=old, to_status=ASSIGNED, at=now,
        )
        sla_service.on_status_change(db, complaint, old, ASSIGNED, now)
    sla_service.on_assigned(db, complaint, now)

    notification_service.notify(
        db, [assignee], "complaint.assigned", f"{complaint.generated_id} assigned to you",
        f"{complaint.title} ({complaint.priority}, {complaint.department.name}, {complaint.location.name})",
        complaint, exclude=actor, at=now,
    )


def auto_route(db: Session, complaint: Complaint, actor: User | None = None, at: datetime | None = None) -> User | None:
    """Assigns the best candidate, or records that the complaint is waiting in
    the department queue. The caller commits."""
    candidates = routing_candidates(db, complaint)
    if not candidates:
        record_event(
            db, complaint, "unassigned", actor,
            "No available officer covers this department and location; waiting for manual assignment",
            public_message=f"Received by the {complaint.department.name} department",
            at=at,
        )
        return None
    best = min(candidates, key=_rank)
    reason = f"department + location match, {best.workload} open complaint{'s' if best.workload != 1 else ''}"
    assign(db, complaint, best.user, actor=actor, method="auto", reason=reason, at=at)
    return best.user


# ---------------------------------------------------------------------------
# Manual assignment
# ---------------------------------------------------------------------------

def manual_candidates(ctx: AccessContext, complaint: Complaint) -> list[Candidate]:
    """Staff the user may hand this complaint to: active, able to respond to
    complaints, covering its department and location, and either the user
    themself or someone below them."""
    users = ctx.db.query(User).filter(User.is_active.is_(True)).all()
    matched = []
    for user in users:
        if user.id != ctx.user.id and not ctx.can_manage_user(user):
            continue
        if not any(p.key == "complaint.respond" for p in user.role.permissions):
            continue
        score = scope_specificity(scopes_of(user), complaint.department_id, complaint.location.path)
        if score is not None:
            matched.append((user, score))
    ids = [u.id for u, _ in matched]
    loads = workloads(ctx.db, ids)
    last = _last_assigned(ctx.db, ids)
    return sorted((Candidate(u, s, loads.get(u.id, 0), last.get(u.id)) for u, s in matched), key=_rank)


def manual_assign(ctx: AccessContext, complaint: Complaint, assignee_id: int, reason: str | None) -> User:
    if complaint.status in (CLOSED, REJECTED):
        raise HTTPException(status.HTTP_409_CONFLICT, "Closed or rejected complaints cannot be reassigned")
    ctx.require("complaint.reassign" if complaint.assigned_to_id else "complaint.assign")
    candidate = next((c for c in manual_candidates(ctx, complaint) if c.user.id == assignee_id), None)
    if candidate is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "That officer cannot take this complaint (inactive, outside its scope, or not under you)",
        )
    if complaint.assigned_to_id == assignee_id:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already assigned to {candidate.user.name}")
    assign(ctx.db, complaint, candidate.user, actor=ctx.user, method="manual", reason=(reason or "").strip() or None)
    return candidate.user
