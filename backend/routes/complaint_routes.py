"""Complaint endpoints for staff. Every query goes through `_scoped`, so a user
only ever sees complaints inside their department/location scopes. Citizens
use /portal/complaints instead."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel

from models import Complaint, Location, RejectionRequest, User
from services import audit_service, rejection_service, routing_service, workflow_service
from services.access_service import AccessContext
from services.complaint_service import (
    dashboard_stats, register_complaint, resolve_classification, save_attachments, serialize_complaints,
    sla_at_risk_clause, sla_breached_clause, staff_detail, validate_priority,
)
from services.user_service import visible_reset_tickets
from services.workflow_service import ACTIVE_STATUSES, STATUS_GROUPS, STATUS_LABELS
from utils.auth_middleware import require_permission
from utils.security import normalize_mobile, utcnow

router = APIRouter()


class ComplaintCreateJSON(BaseModel):
    title: str
    department_id: int
    category_id: int | None = None
    location_id: int
    priority: str | None = "Medium"
    description: str | None = None
    citizen_name: str | None = None
    citizen_phone: str | None = None


class ActionRequest(BaseModel):
    action: str
    note: str | None = None


class RejectionRequestBody(BaseModel):
    category: str
    reason: str


class AssignRequest(BaseModel):
    assignee_id: int
    reason: str | None = None


def _scoped(ctx: AccessContext):
    query = ctx.db.query(Complaint).join(Location, Complaint.location_id == Location.id)
    return ctx.apply_scope(query, Complaint.department_id)


def pending_rejections_for(ctx: AccessContext) -> int:
    """Pending rejection requests this user could decide."""
    if not ctx.has(rejection_service.APPROVE_PERMISSION):
        return 0
    pending = (
        ctx.apply_scope(
            ctx.db.query(RejectionRequest)
            .join(Complaint, RejectionRequest.complaint_id == Complaint.id)
            .join(Location, Complaint.location_id == Location.id),
            Complaint.department_id,
        )
        .filter(RejectionRequest.status == rejection_service.PENDING)
        .all()
    )
    return sum(1 for r in pending if rejection_service.can_decide(ctx, r))


def _get_scoped(ctx: AccessContext, generated_id: str) -> Complaint:
    complaint = _scoped(ctx).filter(Complaint.generated_id == generated_id).first()
    if complaint is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Complaint not found")
    return complaint


@router.get("/admin/stats")
def get_admin_dashboard_stats(ctx: AccessContext = Depends(require_permission("complaint.view"))):
    scoped = _scoped(ctx)
    stats = dashboard_stats(scoped)

    total_users = None
    if ctx.has("user.view"):
        below_ids = [r.id for r in ctx.assignable_roles()]
        candidates = ctx.db.query(User).filter(User.role_id.in_(below_ids)).all() if below_ids else []
        total_users = sum(1 for u in candidates if ctx.can_manage_user(u))

    stats["pending_summary"] = {
        "pending_resets": sum(
            1 for ticket, _ in visible_reset_tickets(ctx) if ticket.status == "Pending Approval"
        ) if ctx.has("user.reset_password") else 0,
        "pending_assignments": stats["metrics"]["unassigned"],
        "assigned_to_me": scoped.filter(
            Complaint.assigned_to_id == ctx.user.id, Complaint.status.in_(ACTIVE_STATUSES)
        ).count(),
        "escalations": scoped.filter(
            Complaint.priority.in_(["High", "Critical"]), Complaint.status.in_(ACTIVE_STATUSES)
        ).count(),
        "escalated_to_me": scoped.filter(Complaint.escalated_to_id == ctx.user.id).count(),
        "rejection_requests": pending_rejections_for(ctx),
        "total_users": total_users,
    }
    return stats


@router.get("/")
def list_complaints(
    status: str | None = None,  # shadows fastapi.status inside this function only
    group: str | None = None,
    assigned: str | None = None,
    priority: str | None = None,
    department_id: int | None = None,
    search: str | None = None,
    sla: str | None = None,
    escalated: str | None = None,
    limit: int = 500,
    ctx: AccessContext = Depends(require_permission("complaint.view")),
):
    """`status` and `priority` take comma-separated values; `group` is open /
    in_progress / resolved / rejected; `assigned` is "me", "unassigned" or a user id;
    `sla` is "breached" or "at_risk"; `escalated` is "me" or "any"."""
    query = _scoped(ctx)
    if status and status != "All":
        wanted = [s for s in status.split(",") if s in STATUS_LABELS]
        query = query.filter(Complaint.status.in_(wanted))
    if group in STATUS_GROUPS:
        query = query.filter(Complaint.status.in_(STATUS_GROUPS[group]))
    if assigned == "me":
        query = query.filter(Complaint.assigned_to_id == ctx.user.id)
    elif assigned == "unassigned":
        query = query.filter(Complaint.assigned_to_id.is_(None))
    elif assigned and assigned.isdigit():
        query = query.filter(Complaint.assigned_to_id == int(assigned))
    if priority:
        query = query.filter(Complaint.priority.in_(priority.split(",")))
    if department_id is not None:
        query = query.filter(Complaint.department_id == department_id)
    if sla == "breached":
        query = query.filter(sla_breached_clause(utcnow()))
    elif sla == "at_risk":
        query = query.filter(sla_at_risk_clause(utcnow()))
    if escalated == "me":
        query = query.filter(Complaint.escalated_to_id == ctx.user.id)
    elif escalated == "any":
        query = query.filter(Complaint.escalated_to_id.isnot(None))
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            Complaint.title.ilike(like) | Complaint.generated_id.ilike(like) | Location.name.ilike(like)
        )
    complaints = query.order_by(Complaint.created_at.desc()).limit(min(max(limit, 1), 1000)).all()
    return serialize_complaints(ctx.db, complaints)


@router.get("/{complaint_id}")
def get_complaint(complaint_id: str, ctx: AccessContext = Depends(require_permission("complaint.view"))):
    return staff_detail(ctx, _get_scoped(ctx, complaint_id))


# Staff registering a complaint on behalf of a citizen (walk-in, phone call)
@router.post("/quick-create", status_code=201)
def quick_create_complaint(
    data: ComplaintCreateJSON, request: Request,
    ctx: AccessContext = Depends(require_permission("complaint.create")),
):
    db = ctx.db
    title = data.title.strip()
    if not title or len(title) > 200:
        raise HTTPException(400, "Title is required (max 200 characters)")
    department, category, location = resolve_classification(db, data.department_id, data.category_id, data.location_id)
    ctx.require_covers(department.id, location.path)

    complaint = register_complaint(
        db,
        department=department,
        category=category,
        location=location,
        priority=validate_priority(data.priority),
        title=title,
        description=(data.description or "").strip() or title,
        created_by=ctx.user,
        citizen_name=(data.citizen_name or "").strip()[:150] or None,
        citizen_phone=normalize_mobile(data.citizen_phone),
    )
    audit_service.record(
        db, actor=ctx.user, action="complaint.create", entity_type="complaint", entity_id=complaint.generated_id,
        summary=f"Registered {complaint.generated_id} ({department.name}, {location.name}) on behalf of a citizen",
        request=request,
    )
    db.commit()
    return {
        "success": True,
        "id": complaint.generated_id,
        "assignee": complaint.assigned_to.name if complaint.assigned_to else None,
        "message": f"Complaint {complaint.generated_id} created.",
    }


@router.post("/{complaint_id}/actions")
def perform_action(
    complaint_id: str, payload: ActionRequest, request: Request,
    ctx: AccessContext = Depends(require_permission("complaint.view")),
):
    complaint = _get_scoped(ctx, complaint_id)
    old_status = complaint.status
    workflow_service.apply_staff_action(ctx, complaint, payload.action, payload.note)
    audit_service.record(
        ctx.db, actor=ctx.user, action=f"complaint.{payload.action}", entity_type="complaint",
        entity_id=complaint.generated_id,
        summary=f"{complaint.generated_id}: {workflow_service.status_label(old_status)} -> "
                f"{workflow_service.status_label(complaint.status)}",
        changes={"status": [old_status, complaint.status]}, request=request,
    )
    ctx.db.commit()
    return staff_detail(ctx, complaint)


@router.post("/{complaint_id}/rejection-requests", status_code=201)
def request_rejection(
    complaint_id: str, payload: RejectionRequestBody, request: Request,
    ctx: AccessContext = Depends(require_permission("complaint.reject.request")),
):
    complaint = _get_scoped(ctx, complaint_id)
    rejection = rejection_service.request_rejection(ctx, complaint, payload.category, payload.reason)
    audit_service.record(
        ctx.db, actor=ctx.user, action="complaint.rejection_request", entity_type="complaint",
        entity_id=complaint.generated_id,
        summary=f"{complaint.generated_id}: rejection requested ({payload.category})"
                + (f", routed to {rejection.approver.name}" if rejection.approver else ""),
        changes={"status": [rejection.previous_status, complaint.status]}, request=request,
    )
    ctx.db.commit()
    return staff_detail(ctx, complaint)


@router.get("/{complaint_id}/assignee-options")
def assignee_options(complaint_id: str, ctx: AccessContext = Depends(require_permission("complaint.view"))):
    complaint = _get_scoped(ctx, complaint_id)
    return [
        {
            "id": c.user.id,
            "name": c.user.name,
            "role": c.user.role.name,
            "workload": c.workload,
            "is_available": c.user.is_available,
            "is_current": c.user.id == complaint.assigned_to_id,
        }
        for c in routing_service.manual_candidates(ctx, complaint)
    ]


@router.post("/{complaint_id}/assign")
def assign_complaint(
    complaint_id: str, payload: AssignRequest, request: Request,
    ctx: AccessContext = Depends(require_permission("complaint.view")),
):
    complaint = _get_scoped(ctx, complaint_id)
    previous = complaint.assigned_to.name if complaint.assigned_to else None
    assignee = routing_service.manual_assign(ctx, complaint, payload.assignee_id, payload.reason)
    audit_service.record(
        ctx.db, actor=ctx.user, action="complaint.reassign" if previous else "complaint.assign",
        entity_type="complaint", entity_id=complaint.generated_id,
        summary=f"{complaint.generated_id} assigned to {assignee.name}" + (f" (was {previous})" if previous else ""),
        changes={"assignee": [previous, assignee.name]}, request=request,
    )
    ctx.db.commit()
    return staff_detail(ctx, complaint)


@router.post("/{complaint_id}/auto-assign")
def auto_assign_complaint(
    complaint_id: str, request: Request,
    ctx: AccessContext = Depends(require_permission("complaint.assign")),
):
    """Re-runs routing for a complaint that is still waiting in the department queue."""
    complaint = _get_scoped(ctx, complaint_id)
    if complaint.assigned_to_id is not None or complaint.status not in ACTIVE_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only unassigned open complaints can be auto-assigned")
    assignee = routing_service.auto_route(ctx.db, complaint, actor=ctx.user)
    if assignee is not None:
        audit_service.record(
            ctx.db, actor=ctx.user, action="complaint.assign", entity_type="complaint",
            entity_id=complaint.generated_id,
            summary=f"{complaint.generated_id} auto-assigned to {assignee.name}", request=request,
        )
    ctx.db.commit()
    return staff_detail(ctx, complaint)


@router.post("/{complaint_id}/comments", status_code=201)
def add_comment(
    complaint_id: str,
    body: str = Form(...),
    is_internal: bool = Form(False),
    files: list[UploadFile] = File(default=[]),
    ctx: AccessContext = Depends(require_permission("complaint.respond")),
):
    complaint = _get_scoped(ctx, complaint_id)
    if complaint.status in (workflow_service.CLOSED, workflow_service.REJECTED):
        raise HTTPException(status.HTTP_409_CONFLICT, "Reopen the complaint before adding comments")
    comment = workflow_service.add_comment(ctx.db, complaint, ctx.user, body, is_internal=is_internal)
    save_attachments(ctx.db, complaint, files, ctx.user, comment=comment)
    ctx.db.commit()
    return staff_detail(ctx, complaint)
