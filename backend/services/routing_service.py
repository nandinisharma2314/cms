"""Complaint routing and assignment.

Automatic routing picks, among active and available staff whose role has
`complaint.receive` and `complaint.respond` and whose scope covers the
complaint's department and location:
  1. the most specific match (department-specific scope beats "all
     departments"; then the deepest location scope wins, so an area agent
     beats a city-wide one),
  2. then the lowest workload (open + in-progress complaints assigned),
  3. then whoever was assigned a complaint least recently.

Complaints nobody could take wait in the department queue; the background
worker retries them, and they are re-routed when their handler leaves or no
longer covers them.
"""
from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from models import Complaint, ComplaintAssignment, Permission, Role, User, max_length, role_permissions
from services import notification_service, rejection_service, sla_service
from services.access_service import AccessContext, scope_specificity, scopes_of
from services.events import record_event
from services.statuses import (
    ACKNOWLEDGED, ACTIVE_STATUSES, ASSIGNED, CLOSED, IN_PROGRESS, REJECTED, SUBMITTED, status_label,
)
from utils.security import utcnow
from utils.text import multi_line

RECEIVE_PERMISSION = "complaint.receive"
RESPOND_PERMISSION = "complaint.respond"


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


def _holders(db: Session, permission: str):
    return (
        db.query(User)
        .join(Role, User.role_id == Role.id)
        .join(role_permissions, role_permissions.c.role_id == Role.id)
        .join(Permission, Permission.id == role_permissions.c.permission_id)
        .filter(Permission.key == permission, User.is_active.is_(True))
        .options(selectinload(User.scopes))
    )


def _candidates(db: Session, users: list[User], complaint: Complaint) -> list[Candidate]:
    matched = []
    for user in users:
        score = scope_specificity(scopes_of(user), complaint.department_id, complaint.location.path)
        if score is not None:
            matched.append((user, score))
    ids = [u.id for u, _ in matched]
    loads = workloads(db, ids)
    last = _last_assigned(db, ids)
    return [Candidate(u, score, loads.get(u.id, 0), last.get(u.id)) for u, score in matched]


def routing_candidates(db: Session, complaint: Complaint) -> list[Candidate]:
    receivers = _holders(db, RECEIVE_PERMISSION).filter(User.is_available.is_(True)).all()
    # Receiving without being able to respond would leave the complaint stuck with them.
    able = [u for u in receivers if any(p.key == RESPOND_PERMISSION for p in u.role.permissions)]
    return _candidates(db, able, complaint)


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
        public_message=f"Assigned to a member of the {complaint.department.name} department",
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
        f"{complaint.title} ({complaint.priority.name}, {complaint.department.name}, {complaint.location.name})",
        complaint, exclude=actor, at=now,
    )


def unassign(db: Session, complaint: Complaint, actor: User | None, reason: str, at: datetime) -> None:
    """Takes the complaint away from its handler; it waits in the department queue."""
    previous = complaint.assigned_to
    for row in complaint.assignments:
        if row.ended_at is None:
            row.ended_at = at
    complaint.assigned_to = None
    complaint.assigned_at = None
    if complaint.status == ASSIGNED:
        complaint.status = SUBMITTED
        record_event(db, complaint, "status_changed", actor, "Status changed from Assigned to Submitted",
                     from_status=ASSIGNED, to_status=SUBMITTED, at=at)
    record_event(db, complaint, "unassigned", actor,
                 f"Taken off {previous.name if previous else 'nobody'}: {reason}; waiting in the department queue",
                 at=at)


def auto_route(db: Session, complaint: Complaint, actor: User | None = None, at: datetime | None = None,
               record_queue_event: bool = True) -> User | None:
    """Assigns the best candidate, or (when `record_queue_event`) records that
    the complaint is waiting in the department queue. The caller commits."""
    candidates = routing_candidates(db, complaint)
    if not candidates:
        if record_queue_event:
            record_event(
                db, complaint, "unassigned", actor,
                "No available staff member covers this department and location; waiting for manual assignment",
                public_message=f"Received by the {complaint.department.name} department",
                at=at,
            )
        return None
    best = min(candidates, key=_rank)
    reason = f"department + location match, {best.workload} open complaint{'s' if best.workload != 1 else ''}"
    assign(db, complaint, best.user, actor=actor, method="auto", reason=reason, at=at)
    return best.user


def still_handles(user: User, complaint: Complaint) -> bool:
    return (
        user.is_active
        and any(p.key == RESPOND_PERMISSION for p in user.role.permissions)
        and sla_service.covers(user, complaint)
    )


def reroute_complaints_of(db: Session, user: User, actor: User | None, reason: str, at: datetime,
                          only_uncovered: bool) -> int:
    """Moves the user's open complaints to someone else (or the queue). With
    `only_uncovered`, only the complaints they can no longer handle. Also hands
    their escalations and pending rejection decisions to the next person up.
    Returns how many complaints moved. The caller commits."""
    moved = 0
    assigned = db.query(Complaint).filter(
        Complaint.assigned_to_id == user.id, Complaint.status.in_(ACTIVE_STATUSES),
    ).all()
    for complaint in assigned:
        if only_uncovered and still_handles(user, complaint):
            continue
        unassign(db, complaint, actor, reason, at)
        auto_route(db, complaint, actor=actor, at=at)
        moved += 1
    for complaint in db.query(Complaint).filter(
        Complaint.escalated_to_id == user.id, Complaint.status.in_(ACTIVE_STATUSES),
    ).all():
        if only_uncovered and sla_service.covers(user, complaint) and user.is_active:
            continue
        target = sla_service.next_up(db, complaint, user)
        if target is None:
            sla_service.end_escalation(complaint, at)
            record_event(db, complaint, "escalation_stopped", actor,
                         f"{user.name} can no longer take the escalation and nobody above covers it", at=at)
            continue
        complaint.escalated_to = target
        record_event(db, complaint, "escalated", actor,
                     f"Escalation moved from {user.name} to {target.name} ({target.role.name}): {reason}", at=at)
        notification_service.notify(db, [target], "complaint.escalated", f"{complaint.generated_id} escalated to you",
                                    f"Moved from {user.name}: {reason}.", complaint, at=at)
    if not user.is_active:
        rejection_service.reroute_pending_for(db, user, at)
    return moved


def retry_queue(db: Session, at: datetime) -> int:
    """Tries to route complaints waiting in the department queue. Returns how
    many were assigned. The caller commits."""
    waiting = db.query(Complaint).filter(
        Complaint.assigned_to_id.is_(None), Complaint.status.in_(ACTIVE_STATUSES),
    ).order_by(Complaint.created_at).all()
    assigned = 0
    for complaint in waiting:
        if rejection_service.pending_request(complaint) is not None:
            continue
        if auto_route(db, complaint, at=at, record_queue_event=False) is not None:
            assigned += 1
    return assigned


# ---------------------------------------------------------------------------
# Manual assignment
# ---------------------------------------------------------------------------

def manual_candidates(ctx: AccessContext, complaint: Complaint) -> list[Candidate]:
    """Staff the user may hand this complaint to: active, able to respond to
    complaints, covering its department and location, and either the user
    themself or someone below them."""
    users = [
        u for u in _holders(ctx.db, RESPOND_PERMISSION).all()
        if u.id == ctx.user.id or ctx.can_manage_user(u)
    ]
    return sorted(_candidates(ctx.db, users, complaint), key=_rank)


def manual_assign(ctx: AccessContext, complaint: Complaint, assignee_id: int, reason: str | None) -> User:
    if complaint.status in (CLOSED, REJECTED):
        raise HTTPException(status.HTTP_409_CONFLICT, "Closed or rejected complaints cannot be reassigned")
    if rejection_service.pending_request(complaint) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "A rejection request is pending; decide or withdraw it before reassigning")
    ctx.require("complaint.reassign" if complaint.assigned_to_id else "complaint.assign")
    candidate = next((c for c in manual_candidates(ctx, complaint) if c.user.id == assignee_id), None)
    if candidate is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "That person cannot take this complaint (inactive, outside its scope, or not under you)",
        )
    if complaint.assigned_to_id == assignee_id:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already assigned to {candidate.user.name}")
    reason = multi_line(reason, "The reason", max_length(ComplaintAssignment.reason), required=False)
    assign(ctx.db, complaint, candidate.user, actor=ctx.user, method="manual", reason=reason)
    return candidate.user
