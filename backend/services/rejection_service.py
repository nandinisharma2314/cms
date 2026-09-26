"""Controlled rejection: an agent may not reject a complaint on their own.

    handler requests rejection (category + reason required)
        -> complaint goes to REJECTION_REQUESTED ("Under Review" for the end user)
        -> someone above them with complaint.reject.approve decides:
             approve  -> REJECTED, end user told why
             deny     -> back to work (note required)
        (or the requester withdraws it)

Approvers who reject directly (the "reject" workflow action) get the same
record with direct=True, so every rejection has requester, reason, approver
and time on file.
"""
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models import Complaint, RejectionRequest, User
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

REASON_CATEGORIES = [
    "Outside department jurisdiction",
    "Outside municipal jurisdiction",
    "Duplicate complaint",
    "Insufficient or false information",
    "Private property matter",
    "Other",
]

PENDING, APPROVED, DENIED, WITHDRAWN = "PENDING", "APPROVED", "DENIED", "WITHDRAWN"
REQUESTABLE_STATUSES = {SUBMITTED, ASSIGNED, ACKNOWLEDGED, IN_PROGRESS, WAITING, REOPENED}


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


def _validate(category: str, reason: str) -> tuple[str, str]:
    if category not in REASON_CATEGORIES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Category must be one of: {', '.join(REASON_CATEGORIES)}")
    reason = (reason or "").strip()
    if len(reason) < 10:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please explain the reason (at least 10 characters)")
    if len(reason) > 2000:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reason is too long")
    return category, reason


def request_rejection(
    ctx: AccessContext, complaint: Complaint, category: str, reason: str, at: datetime | None = None,
) -> RejectionRequest:
    from services.workflow_service import change_status

    if not can_request(ctx, complaint):
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot request rejection of this complaint")
    category, reason = _validate(category, reason)
    db, now = ctx.db, at or utcnow()
    approver = sla_service.next_up(db, complaint, ctx.user, permission=APPROVE_PERMISSION)
    request = RejectionRequest(
        complaint=complaint, requested_by=ctx.user, approver=approver, category=category, reason=reason,
        previous_status=complaint.status, created_at=now,
    )
    db.add(request)
    if complaint.acknowledged_at is None:
        complaint.acknowledged_at = now  # looking into it and asking counts as a response

    change_status(
        db, complaint, REJECTION_REQUESTED, ctx.user,
        message=f"{ctx.user.name} requested rejection ({category})"
                + (f"; awaiting {approver.name}" if approver else ""),
        public_message="Your complaint is under review by a senior officer",
        at=now,
    )
    # The reason is internal until an approver decides what to tell the end user.
    record_event(db, complaint, "rejection_requested", ctx.user, f"Reason given by {ctx.user.name}",
                 note=reason, at=now)
    notification_service.notify(
        db, [approver], "rejection.requested",
        f"Rejection requested for {complaint.generated_id}",
        f"{ctx.user.name}: {category}. {reason[:200]}", complaint, at=now,
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
    public_reason = (message_to_end_user or "").strip() or f"{request.category}. {request.reason}"
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
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tell the officer why the rejection is denied")
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
                            reason: str, at: datetime) -> None:
    """Called by the workflow when an approver uses the direct "reject" action."""
    db.add(RejectionRequest(
        complaint=complaint, requested_by=approver, approver=approver, category="Other", reason=reason,
        previous_status=previous_status, status=APPROVED, direct=True,
        decided_by=approver, decided_at=at, decision_note=reason, created_at=at,
    ))
    notification_service.notify(
        db, [complaint.assigned_to], "rejection.approved", f"{complaint.generated_id} was rejected",
        f"Rejected by {approver.name}: {reason[:200]}", complaint, exclude=approver, at=at,
    )


def serialize(request: RejectionRequest, ctx: AccessContext | None = None) -> dict:
    complaint = request.complaint
    data = {
        "id": request.id,
        "complaint": {
            "id": complaint.generated_id,
            "title": complaint.title,
            "department": complaint.department.name,
            "location": complaint.location.name,
            "priority": complaint.priority,
            "status": complaint.status,
        },
        "requested_by": {"id": request.requested_by.id, "name": request.requested_by.name,
                         "role": request.requested_by.role.name},
        "approver": request.approver.name if request.approver else None,
        "category": request.category,
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
