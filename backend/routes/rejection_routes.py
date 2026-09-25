"""Rejection requests: agents ask, someone above them decides."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from models import Complaint, Location, RejectionRequest
from services import audit_service, rejection_service
from services.access_service import AccessContext
from services.complaint_service import staff_detail
from utils.auth_middleware import get_access_context, require_permission

router = APIRouter()


class DecisionRequest(BaseModel):
    note: str | None = None


def _scoped_requests(ctx: AccessContext):
    query = (
        ctx.db.query(RejectionRequest)
        .join(Complaint, RejectionRequest.complaint_id == Complaint.id)
        .join(Location, Complaint.location_id == Location.id)
    )
    return ctx.apply_scope(query, Complaint.department_id)


def _get(ctx: AccessContext, request_id: int) -> RejectionRequest:
    request = _scoped_requests(ctx).filter(RejectionRequest.id == request_id).first()
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rejection request not found")
    return request


@router.get("/categories")
def categories(_: AccessContext = Depends(get_access_context)):
    return rejection_service.REASON_CATEGORIES


@router.get("/")
def list_requests(
    view: str = "to_decide",  # to_decide | mine | all
    status_filter: str | None = None,
    ctx: AccessContext = Depends(require_permission("complaint.view")),
):
    """to_decide: pending requests you can approve/deny; mine: requests you made;
    all: every request in your scope (approvers only)."""
    query = _scoped_requests(ctx)
    if view == "mine":
        query = query.filter(RejectionRequest.requested_by_id == ctx.user.id)
    elif view == "to_decide":
        query = query.filter(RejectionRequest.status == rejection_service.PENDING)
    elif not ctx.has(rejection_service.APPROVE_PERMISSION):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing permission: complaint.reject.approve")
    if status_filter:
        query = query.filter(RejectionRequest.status == status_filter.upper())
    rows = query.order_by(RejectionRequest.created_at.desc()).limit(300).all()
    if view == "to_decide":
        rows = [r for r in rows if rejection_service.can_decide(ctx, r)]
    return [rejection_service.serialize(r, ctx) for r in rows]


def _audit(ctx: AccessContext, request: RejectionRequest, action: str, summary: str, http_request: Request):
    audit_service.record(
        ctx.db, actor=ctx.user, action=action, entity_type="complaint", entity_id=request.complaint.generated_id,
        summary=summary,
        changes={"rejection_request": [None, request.status], "category": [None, request.category]},
        request=http_request,
    )


@router.post("/{request_id}/approve")
def approve(request_id: int, payload: DecisionRequest, http_request: Request,
            ctx: AccessContext = Depends(require_permission("complaint.reject.approve"))):
    request = _get(ctx, request_id)
    rejection_service.approve(ctx, request, payload.note)
    _audit(ctx, request, "complaint.rejection_approve",
           f"{request.complaint.generated_id}: rejection requested by {request.requested_by.name} approved "
           f"({request.category})", http_request)
    ctx.db.commit()
    return staff_detail(ctx, request.complaint)


@router.post("/{request_id}/deny")
def deny(request_id: int, payload: DecisionRequest, http_request: Request,
         ctx: AccessContext = Depends(require_permission("complaint.reject.approve"))):
    request = _get(ctx, request_id)
    rejection_service.deny(ctx, request, payload.note or "")
    _audit(ctx, request, "complaint.rejection_deny",
           f"{request.complaint.generated_id}: rejection requested by {request.requested_by.name} denied",
           http_request)
    ctx.db.commit()
    return staff_detail(ctx, request.complaint)


@router.post("/{request_id}/withdraw")
def withdraw(request_id: int, http_request: Request, ctx: AccessContext = Depends(get_access_context)):
    request = _get(ctx, request_id)
    rejection_service.withdraw(ctx, request)
    _audit(ctx, request, "complaint.rejection_withdraw",
           f"{request.complaint.generated_id}: {ctx.user.name} withdrew their rejection request", http_request)
    ctx.db.commit()
    return staff_detail(ctx, request.complaint)
