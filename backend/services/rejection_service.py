"""Controlled rejection: an agent may not reject a complaint on their own.

    handler requests rejection (reason category + explanation required)
        -> complaint goes to REJECTION_REQUESTED ("Under Review" for the end user)
        -> someone above them with complaint.reject.approve decides:
             approve  -> REJECTED, end user told why
             deny     -> back to work (note required)
        (or the requester withdraws it)

Approvers who reject directly (the "reject" workflow action) get the same
record with direct=True, so every rejection has requester, reason, approver
and time on file. Reason categories are managed by admins (rejection_reasons).
"""
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from config import NOTE_MAX_LENGTH, REJECTION_REASON_MIN_LENGTH
from models import Complaint, RejectionReason, RejectionRequest, User
from services import notification_service, sla_service
from services.access_service import AccessContext
from services.events import record_event
from services.statuses import (
    ACKNOWLEDGED, ASSIGNED, AWAITING_RESPONSE, IN_PROGRESS, REJECTED, REJECTION_REQUESTED, REOPENED,
    SUBMITTED, WAITING,
)
from utils.security import utcnow

REQUEST_PERMISSION = "complaint.reject.request"
APPROVE_PERMISSION = "complaint.reject.approve"

PENDING, APPROVED, DENIED, WITHDRAWN = "PENDING", "APPROVED", "DENIED", "WITHDRAWN"
REQUESTABLE_STATUSES = {SUBMITTED, ASSIGNED, ACKNOWLEDGED, IN_PROGRESS, WAITING, REOPENED}


# ---------------------------------------------------------------------------
# Reason categories
# ---------------------------------------------------------------------------

def list_reasons(db: Session, include_inactive: bool = False) -> list[RejectionReason]:
    query = db.query(RejectionReason)
    if not include_inactive:
        query = query.filter(RejectionReason.is_active.is_(True))
    return query.order_by(RejectionReason.sort_order, RejectionReason.id).all()


def serialize_reason(reason: RejectionReason) -> dict:
    return {"id": reason.id, "name": reason.name, "sort_order": reason.sort_order, "is_active": reason.is_active}


def active_reason(db: Session, reason_id: int | None) -> RejectionReason:
    reason = db.get(RejectionReason, reason_id) if reason_id is not None else None
    if reason is None or not reason.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose a rejection reason")
    return reason


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------

def pending_request(complaint: Complaint) -> RejectionRequest | None:
    return next((r for r in complaint.rejection_requests if r.status == PENDING), None)


def can_request(ctx: AccessContext, complaint: Complaint) -> bool:
    """Handlers who hold the request permission but cannot reject on their own
    (approvers use the direct "reject" action instead)."""
    from services.workflow_service import is_handler  # avoid an import cycle
    return (
        ctx.has(REQUEST_PERMISSION)
        and not ctx.has(APPROVE_PERMISSION)
        and complaint.status in REQUESTABLE_STATUSES
        and is_handler(ctx, complaint)
        and pending_request(complaint) is None
    )


def can_decide(ctx: AccessContext, request: RejectionRequest) -> bool:
    """Approvers above the requester (never the requester themself). The caller
    must already have checked the complaint is in the user's scope."""
    return (
        request.status == PENDING
        and ctx.has(APPROVE_PERMISSION)
        and request.requested_by_id != ctx.user.id
        and (ctx.is_super_admin or ctx.can_manage_user(request.requested_by))
    )


def _clean_reason(reason: str) -> str:
    reason = (reason or "").strip()
    if len(reason) < REJECTION_REASON_MIN_LENGTH:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Please explain the reason (at least {REJECTION_REASON_MIN_LENGTH} characters)")
    if len(reason) > NOTE_MAX_LENGTH:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"The reason is too long (max {NOTE_MAX_LENGTH} characters)")
    return reason


def request_rejection(
    ctx: AccessContext, complaint: Complaint, reason_id: int | None, reason: str, at: datetime | None = None,
) -> RejectionRequest:
    from services.workflow_service import change_status

    if not can_request(ctx, complaint):
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot request rejection of this complaint")
    category = active_reason(ctx.db, reason_id)
    reason = _clean_reason(reason)
    db, now = ctx.db, at or utcnow()
    approver = sla_service.next_up(db, complaint, ctx.user, permission=APPROVE_PERMISSION)
    request = RejectionRequest(
        complaint=complaint, requested_by=ctx.user, approver=approver, reason_category=category, reason=reason,
        previous_status=complaint.status, status=PENDING, created_at=now,
    )
    db.add(request)
    if complaint.acknowledged_at is None:
        complaint.acknowledged_at = now  # looking into it and asking counts as a response

    change_status(
        db, complaint, REJECTION_REQUESTED, ctx.user,
        message=f"{ctx.user.name} requested rejection ({category.name})"
                + (f"; awaiting {approver.name}" if approver else ""),
        public_message="Your complaint is being reviewed",
        at=now,
    )
    # The reason is internal until an approver decides what to tell the end user.
    record_event(db, complaint, "rejection_requested", ctx.user, f"Reason given by {ctx.user.name}",
                 note=reason, at=now)
    notification_service.notify(
        db, [approver], "rejection.requested",
        f"Rejection requested for {complaint.generated_id}",
        f"{ctx.user.name}: {category.name}. {reason[:200]}", complaint, at=now,
    )
    return request


def _restore_status(request: RejectionRequest) -> str:
    # Asking for rejection was a response, so don't go back to "awaiting response".
    return ACKNOWLEDGED if request.previous_status in AWAITING_RESPONSE else request.previous_status


def approve(
    ctx: AccessContext, request: RejectionRequest, message_to_end_user: str | None, at: datetime | None = None,
) -> None:
    from services.workflow_service import change_status

    if not can_decide(ctx, request):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot decide this rejection request")
    db, now, complaint = ctx.db, at or utcnow(), request.complaint
    message = (message_to_end_user or "").strip()
    if len(message) > NOTE_MAX_LENGTH:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"The message is too long (max {NOTE_MAX_LENGTH} characters)")
    # The requester's explanation is internal; without a message the end user is given the reason category.
    public_reason = message or request.reason_category.name
    request.status = APPROVED
    request.decided_by = ctx.user
    request.decided_at = now
    request.decision_note = public_reason
    complaint.closed_at = now
    change_status(
        db, complaint, REJECTED, ctx.user,
        message=f"Rejection approved by {ctx.user.name} (requested by {request.requested_by.name})",
        public_message="Your complaint was rejected",
        note=public_reason, at=now,
    )
    notification_service.notify(
        db, [request.requested_by], "rejection.approved",
        f"Rejection of {complaint.generated_id} approved", f"Approved by {ctx.user.name}.", complaint, at=now,
    )


def deny(ctx: AccessContext, request: RejectionRequest, note: str, at: datetime | None = None) -> None:
    from services.workflow_service import change_status

    if not can_decide(ctx, request):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot decide this rejection request")
    note = (note or "").strip()
    if not note:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Explain why the rejection is denied")
    if len(note) > NOTE_MAX_LENGTH:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"The note is too long (max {NOTE_MAX_LENGTH} characters)")
    db, now, complaint = ctx.db, at or utcnow(), request.complaint
    request.status = DENIED
    request.decided_by = ctx.user
    request.decided_at = now
    request.decision_note = note
    change_status(
        db, complaint, _restore_status(request), ctx.user,
        message=f"Rejection denied by {ctx.user.name}; back to work", note=note, at=now, public=False,
    )
    record_event(db, complaint, "review_completed", ctx.user, "Review completed",
                 public_message="Review completed; work on your complaint continues", at=now)
    notification_service.notify(
        db, [request.requested_by], "rejection.denied",
        f"Rejection of {complaint.generated_id} denied", f"{ctx.user.name}: {note[:300]}", complaint, at=now,
    )


def withdraw(ctx: AccessContext, request: RejectionRequest) -> None:
    from services.workflow_service import change_status

    if request.status != PENDING or request.requested_by_id != ctx.user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the requester can withdraw a pending request")
    db, now, complaint = ctx.db, utcnow(), request.complaint
    request.status = WITHDRAWN
    request.decided_at = now
    change_status(
        db, complaint, _restore_status(request), ctx.user,
        message=f"{ctx.user.name} withdrew the rejection request", at=now, public=False,
    )
    record_event(db, complaint, "review_completed", ctx.user, "Review completed",
                 public_message="Review completed; work on your complaint continues", at=now)
    notification_service.notify(
        db, [request.approver], "rejection.withdrawn",
        f"Rejection request for {complaint.generated_id} withdrawn", None, complaint, exclude=ctx.user, at=now,
    )


def record_direct_rejection(db: Session, approver: User, complaint: Complaint, previous_status: str,
                            category: RejectionReason, reason: str, at: datetime) -> None:
    """Called by the workflow when an approver uses the direct "reject" action."""
    db.add(RejectionRequest(
        complaint=complaint, requested_by=approver, approver=approver, reason_category=category, reason=reason,
        previous_status=previous_status, status=APPROVED, direct=True,
        decided_by=approver, decided_at=at, decision_note=reason, created_at=at,
    ))
    notification_service.notify(
        db, [complaint.assigned_to], "rejection.approved", f"{complaint.generated_id} was rejected",
        f"Rejected by {approver.name}: {reason[:200]}", complaint, exclude=approver, at=at,
    )


def reroute_pending_for(db: Session, user: User, at: datetime) -> int:
    """Pending requests routed to `user` (who is leaving) go to the next
    approver above each requester. Returns how many were moved."""
    moved = 0
    for request in db.query(RejectionRequest).filter(
        RejectionRequest.approver_id == user.id, RejectionRequest.status == PENDING,
    ).all():
        request.approver = sla_service.next_up(db, request.complaint, request.requested_by,
                                               permission=APPROVE_PERMISSION)
        record_event(db, request.complaint, "rejection_rerouted", None,
                     f"Rejection request moved from {user.name} to "
                     f"{request.approver.name if request.approver else 'nobody (no approver above the requester)'}",
                     at=at)
        notification_service.notify(
            db, [request.approver], "rejection.requested",
            f"Rejection requested for {request.complaint.generated_id}",
            f"{request.requested_by.name}: {request.reason_category.name}. {request.reason[:200]}",
            request.complaint, at=at,
        )
        moved += 1
    return moved


def serialize(request: RejectionRequest, ctx: AccessContext | None = None) -> dict:
    complaint = request.complaint
    data = {
        "id": request.id,
        "complaint": {
            "id": complaint.generated_id,
            "title": complaint.title,
            "department": complaint.department.name,
            "location": complaint.location.name,
            "priority": {"name": complaint.priority.name, "tone": complaint.priority.tone},
            "status": complaint.status,
        },
        "requested_by": {"id": request.requested_by.id, "name": request.requested_by.name,
                         "role": request.requested_by.role.name},
        "approver": request.approver.name if request.approver else None,
        "category": request.reason_category.name,
        "reason": request.reason,
        "status": request.status,
        "direct": request.direct,
        "decided_by": request.decided_by.name if request.decided_by else None,
        "decision_note": request.decision_note,
        "decided_at": request.decided_at.isoformat() if request.decided_at else None,
        "created_at": request.created_at.isoformat(),
    }
    if ctx is not None:
        data["can_decide"] = can_decide(ctx, request)
        data["can_withdraw"] = request.status == PENDING and request.requested_by_id == ctx.user.id
    return data

