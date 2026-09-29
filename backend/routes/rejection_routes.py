"""Rejection requests: agents ask, someone above them decides."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from config import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from models import Complaint, Location, RejectionRequest
from services import audit_service, rejection_service
from services.access_service import AccessContext
from services.complaint_service import staff_detail
from utils.auth_middleware import get_access_context, require_permission

router = APIRouter()

VIEWS = ("to_decide", "mine", "all")
STATUSES = (rejection_service.PENDING, rejection_service.APPROVED, rejection_service.DENIED, rejection_service.WITHDRAWN)


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


@router.get("/reasons")
def reasons(ctx: AccessContext = Depends(get_access_context)):
    """Active reason categories, for the request and reject forms."""
    return [rejection_service.serialize_reason(r) for r in rejection_service.list_reasons(ctx.db)]


@router.get("/")
def list_requests(
    view: str,
    status_filter: str | None = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    ctx: AccessContext = Depends(require_permission("complaint.view")),
):
    """to_decide: pending requests you can approve/deny; mine: requests you made;
    all: every request in your scope (approvers only)."""
    if view not in VIEWS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"view must be one of: {', '.join(VIEWS)}")
    page, page_size = max(page, 1), min(max(page_size, 1), MAX_PAGE_SIZE)
    query = _scoped_requests(ctx)
    if view == "mine":
        query = query.filter(RejectionRequest.requested_by_id == ctx.user.id)
    elif view == "to_decide":
        query = query.filter(RejectionRequest.status == rejection_service.PENDING)
    elif not ctx.has(rejection_service.APPROVE_PERMISSION):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing permission: complaint.reject.approve")
    if status_filter:
        if status_filter.upper() not in STATUSES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"status_filter must be one of: {', '.join(STATUSES)}")
        query = query.filter(RejectionRequest.status == status_filter.upper())
    query = query.order_by(RejectionRequest.created_at.desc(), RejectionRequest.id.desc())
    if view == "to_decide":
        # Who may decide depends on the hierarchy, so this is filtered in Python before paging.
        rows = [r for r in query.all() if rejection_service.can_decide(ctx, r)]
        total, rows = len(rows), rows[(page - 1) * page_size: page * page_size]
    else:
        total = query.count()
        rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [rejection_service.serialize(r, ctx) for r in rows], "total": total, "page": page,
            "page_size": page_size}


def _audit(ctx: AccessContext, request: RejectionRequest, action: str, summary: str, http_request: Request):
    audit_service.record(
        ctx.db, actor=ctx.user, action=action, entity_type="complaint", entity_id=request.complaint.generated_id,
        summary=summary,
        changes={"rejection_request": [None, request.status], "category": [None, request.reason_category.name]},
        request=http_request,
    )


@router.post("/{request_id}/approve")
def approve(request_id: int, payload: DecisionRequest, http_request: Request,
            ctx: AccessContext = Depends(require_permission("complaint.reject.approve"))):
    request = _get(ctx, request_id)
    rejection_service.approve(ctx, request, payload.note)
    _audit(ctx, request, "complaint.rejection_approve",
           f"{request.complaint.generated_id}: rejection requested by {request.requested_by.name} approved "
           f"({request.reason_category.name})", http_request)
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
