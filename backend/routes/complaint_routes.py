"""Complaint endpoints for staff. Every query goes through `_scoped`, so a user
only ever sees complaints inside their department/location scopes. End users
use /portal/complaints instead."""
from datetime import date, datetime, time
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import selectinload

from config import DASHBOARD_COMPARISON_DAYS, DASHBOARD_TREND_DAYS, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, NOTE_MAX_LENGTH
from models import Complaint, ComplaintAssignment, Department, EndUser, Location, RejectionRequest, User, max_length
from services import (
    attachment_service, audit_service, priority_service, rejection_service, routing_service, workflow_service,
)
from services.access_service import AccessContext
from services.complaint_service import (
    DETAIL_OPTIONS, LIST_OPTIONS, clean_complaint_text, dashboard_stats, reclassify, register_complaint,
    resolve_classification, serialize_complaints, sla_at_risk_clause, sla_breached_clause, staff_detail,
)
from services.location_service import build_tree
from services.phone_service import phone_format
from services.statuses import ACTIVE_STATUSES, CLOSED, REJECTED, STATUS_GROUPS, STATUS_LABELS, status_label
from services.user_service import visible_reset_tickets
from utils.auth_middleware import get_access_context, require_permission
from utils.security import utcnow
from utils.search import text_match
from utils.text import multi_line, single_line

router = APIRouter()


class ComplaintCreateJSON(BaseModel):
    title: str
    description: str
    additional_details: str | None = None
    department_id: int
    category_id: int
    location_id: int | None = None
    # The category's default priority applies. Choosing another one needs complaint.reclassify
    # and a reason, as changing it later does.
    priority_id: int | None = None
    priority_reason: str | None = None
    end_user_id: int | None = None
    end_user_name: str | None = None
    end_user_phone: str | None = None


class ActionRequest(BaseModel):
    action: str
    note: str | None = None
    reason_id: int | None = None  # required for "reject"


class RejectionRequestBody(BaseModel):
    reason_id: int
    reason: str


class AssignRequest(BaseModel):
    assignee_id: int
    reason: str | None = None


class ReclassifyRequest(BaseModel):
    department_id: int
    category_id: int
    location_id: int
    priority_id: int
    reason: str


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


def _get_scoped(ctx: AccessContext, generated_id: str, detail: bool = True) -> Complaint:
    query = _scoped(ctx).filter(Complaint.generated_id == generated_id)
    if detail:
        query = query.options(*DETAIL_OPTIONS)
    complaint = query.first()
    if complaint is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Complaint not found")
    return complaint


@router.get("/admin/stats")
def get_admin_dashboard_stats(
    date_from: str | None = None,
    date_to: str | None = None,
    ctx: AccessContext = Depends(require_permission("complaint.view"))
):
    scoped = _scoped(ctx)
    stats = dashboard_stats(ctx.db, scoped, DASHBOARD_TREND_DAYS, DASHBOARD_COMPARISON_DAYS, date_from, date_to)

    total_users = None
    if ctx.has("user.view"):
        below_ids = [r.id for r in ctx.assignable_roles()]
        candidates = ctx.db.query(User).filter(User.role_id.in_(below_ids)).all() if below_ids else []
        total_users = sum(1 for u in candidates if ctx.can_manage_user(u))

    stats["pending_summary"] = {
        # None (not 0) when the user can't act on these, so the dashboard leaves the card out.
        "pending_resets": len(visible_reset_tickets(ctx, pending_only=True)) if ctx.has("user.reset_password") else None,
        "unassigned": stats["metrics"]["unassigned"],
        "assigned_to_me": scoped.filter(
            Complaint.assigned_to_id == ctx.user.id, Complaint.status.in_(ACTIVE_STATUSES)
        ).count(),
        "escalated_to_me": scoped.filter(Complaint.escalated_to_id == ctx.user.id).count(),
        "rejection_requests": pending_rejections_for(ctx),
        "total_users": total_users,
    }
    return stats


@router.get("/facets")
def facets(ctx: AccessContext = Depends(require_permission("complaint.view"))):
    """Filter options: departments that have complaints in your scope, and all priorities."""
    departments = (
        _scoped(ctx).join(Department, Complaint.department_id == Department.id)
        .with_entities(Department.id, Department.name).distinct().order_by(Department.name).all()
    )
    return {
        "departments": [{"id": d_id, "name": name} for d_id, name in departments],
        "priorities": [priority_service.serialize(p)
                       for p in priority_service.list_priorities(ctx.db, include_inactive=True)],
        "statuses": [{"key": k, "label": v} for k, v in STATUS_LABELS.items()],
        "locations": build_tree(ctx.db),
    }


def _int_list(raw: str | None, label: str) -> list[int]:
    if not raw:
        return []
    try:
        return [int(v) for v in raw.split(",") if v.strip()]
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{label} must be a comma-separated list of ids") from None


@router.get("", include_in_schema=False)
@router.get("")
def list_complaints(
    status_filter: str | None = None,
    group: str | None = None,
    assigned: str | None = None,
    priority_ids: str | None = None,
    department_id: int | None = None,
    location_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    search: str | None = None,
    sla: str | None = None,
    escalated: str | None = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    ctx: AccessContext = Depends(require_permission("complaint.view")),
):
    """`status_filter` takes comma-separated status keys; `group` is open /
    in_progress / resolved / rejected; `assigned` is "me", "unassigned" or a
    user id; `sla` is "breached" or "at_risk"; `escalated` is "me" or "any"."""
    page, page_size = max(page, 1), min(max(page_size, 1), MAX_PAGE_SIZE)
    query = _scoped(ctx)
    if status_filter:
        wanted = [s for s in status_filter.split(",") if s]
        unknown = [s for s in wanted if s not in STATUS_LABELS]
        if unknown:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown status: {', '.join(unknown)}")
        query = query.filter(Complaint.status.in_(wanted))
    if group:
        if group not in STATUS_GROUPS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"group must be one of: {', '.join(STATUS_GROUPS)}")
        query = query.filter(Complaint.status.in_(STATUS_GROUPS[group]))
    if assigned == "me":
        query = query.filter(Complaint.assigned_to_id == ctx.user.id)
    elif assigned == "unassigned":
        query = query.filter(Complaint.assigned_to_id.is_(None))
    elif assigned:
        if not assigned.isdigit():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "assigned must be 'me', 'unassigned' or a user id")
        query = query.filter(Complaint.assigned_to_id == int(assigned))
    priorities = _int_list(priority_ids, "priority_ids")
    if priorities:
        query = query.filter(Complaint.priority_id.in_(priorities))
    if department_id is not None:
        query = query.filter(Complaint.department_id == department_id)
    if location_id is not None:
        loc = ctx.db.get(Location, location_id)
        if loc is not None:
            query = query.filter(Location.path.startswith(loc.path))
    if date_from and date_from.strip():
        val = date_from.strip()
        try:
            if "T" in val:
                dt_from = datetime.fromisoformat(val)
            else:
                dt_from = datetime.combine(date.fromisoformat(val), time.min)
            query = query.filter(Complaint.created_at >= dt_from)
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "date_from must be YYYY-MM-DD or ISO datetime")
    if date_to and date_to.strip():
        val = date_to.strip()
        try:
            if "T" in val:
                dt_to = datetime.fromisoformat(val)
            else:
                dt_to = datetime.combine(date.fromisoformat(val), time.max)
            query = query.filter(Complaint.created_at <= dt_to)
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "date_to must be YYYY-MM-DD or ISO datetime")
    if sla == "breached":
        query = query.filter(sla_breached_clause(utcnow()))
    elif sla == "at_risk":
        query = query.filter(sla_at_risk_clause(utcnow()))
    elif sla:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "sla must be 'breached' or 'at_risk'")
    if escalated == "me":
        query = query.filter(Complaint.escalated_to_id == ctx.user.id)
    elif escalated == "any":
        query = query.filter(Complaint.escalated_to_id.isnot(None))
    elif escalated:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "escalated must be 'me' or 'any'")
    if search and search.strip():
        term = search.strip()
        query = query.filter(
            text_match(term, Complaint.title, Complaint.generated_id, Location.name)
        )
    total = query.count()
    complaints = (
        query.options(*LIST_OPTIONS).order_by(Complaint.created_at.desc(), Complaint.id.desc())
        .offset((page - 1) * page_size).limit(page_size).all()
    )
    return {"items": serialize_complaints(ctx.db, complaints), "total": total, "page": page, "page_size": page_size}


@router.get("/classification-options")
def classification_options(ctx: AccessContext = Depends(get_access_context)):
    """Active departments with their categories, the location tree and the active
    priorities: what the register and reclassify forms offer. The chosen
    department and location must still be inside the user's scope."""
    if not (ctx.has("complaint.create") or ctx.has("complaint.reclassify")):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing permission: complaint.create")
    departments = (
        ctx.db.query(Department).filter(Department.is_active.is_(True))
        .options(selectinload(Department.categories)).order_by(Department.name).all()
    )
    return {
        "departments": [
            {
                "id": d.id,
                "name": d.name,
                "categories": [
                    {"id": c.id, "name": c.name,
                     "default_priority": {"id": c.default_priority.id, "name": c.default_priority.name,
                                          "tone": c.default_priority.tone}}
                    for c in sorted(d.categories, key=lambda c: c.name) if c.is_active
                ],
            }
            for d in departments if any(c.is_active for c in d.categories)
        ],
        "locations": build_tree(ctx.db),
        "priorities": [priority_service.serialize(p) for p in priority_service.list_priorities(ctx.db, False)],
    }


@router.get("/{complaint_id}")
def get_complaint(complaint_id: str, ctx: AccessContext = Depends(require_permission("complaint.view"))):
    return staff_detail(ctx, _get_scoped(ctx, complaint_id))


@router.post("/quick-create", status_code=status.HTTP_201_CREATED)
def quick_create_complaint(
    data: ComplaintCreateJSON, request: Request,
    ctx: AccessContext = Depends(require_permission("complaint.create")),
):
    """Staff registering a complaint for someone (walk-in, phone call): either an
    existing end user (who then follows it in the portal) or contact details."""
    db = ctx.db
    title, description, additional_details = clean_complaint_text(data.title, data.description,
                                                                  data.additional_details)
    end_user = None
    contact_name = contact_phone = None
    if data.end_user_id is not None:
        end_user = db.get(EndUser, data.end_user_id)
        if end_user is None or not end_user.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "End user not found or inactive")
    else:
        contact_name = single_line(data.end_user_name, "Name", max_length(Complaint.end_user_name), required=False)
        if contact_name is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "Choose the end user, or enter the name of the person reporting it")
        if data.end_user_phone and data.end_user_phone.strip():
            fmt = phone_format(db)
            contact_phone = fmt.normalize(data.end_user_phone)
            if contact_phone is None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Mobile must be {fmt.describe()}")

    resolved_location_id = data.location_id if data.location_id is not None else (end_user.location_id if end_user else None)
    if resolved_location_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No location is assigned to this employee. Please assign a location first.",
        )
    department, category, location = resolve_classification(db, data.department_id, data.category_id, resolved_location_id)
    ctx.require_covers(department.id, location.path)
    priority, priority_reason = category.default_priority, None
    if data.priority_id is not None and data.priority_id != priority.id:
        ctx.require("complaint.reclassify")
        priority = priority_service.get_active(db, data.priority_id)
        priority_reason = multi_line(data.priority_reason, "The reason for the priority", NOTE_MAX_LENGTH)

    complaint = register_complaint(
        db, department=department, category=category, location=location, priority=priority, title=title,
        description=description, additional_details=additional_details, end_user=end_user, created_by=ctx.user,
        end_user_name=contact_name, end_user_phone=contact_phone,
    )
    summary = (f"Registered {complaint.generated_id} ({department.name}, {location.name}) for "
               f"{end_user.name if end_user else contact_name}")
    changes = None
    if priority_reason is not None:
        summary += f"; priority {priority.name} instead of {category.default_priority.name}: {priority_reason}"
        changes = {"priority": [category.default_priority.name, priority.name]}
    audit_service.record(
        db, actor=ctx.user, action="complaint.create", entity_type="complaint", entity_id=complaint.generated_id,
        summary=summary, changes=changes, request=request,
    )
    db.commit()
    return {
        "id": complaint.generated_id,
        "assignee": complaint.assigned_to.name if complaint.assigned_to else None,
    }


@router.post("/{complaint_id}/actions")
def perform_action(
    complaint_id: str, payload: ActionRequest, request: Request,
    ctx: AccessContext = Depends(require_permission("complaint.view")),
):
    complaint = _get_scoped(ctx, complaint_id)
    old_status = complaint.status
    workflow_service.apply_staff_action(ctx, complaint, payload.action, payload.note, payload.reason_id)
    audit_service.record(
        ctx.db, actor=ctx.user, action=f"complaint.{payload.action}", entity_type="complaint",
        entity_id=complaint.generated_id,
        summary=f"{complaint.generated_id}: {status_label(old_status)} -> {status_label(complaint.status)}",
        changes={"status": [old_status, complaint.status]}, request=request,
    )
    ctx.db.commit()
    return staff_detail(ctx, complaint)


@router.post("/{complaint_id}/reclassify")
def reclassify_complaint(
    complaint_id: str, payload: ReclassifyRequest, request: Request,
    ctx: AccessContext = Depends(require_permission("complaint.reclassify")),
):
    complaint = _get_scoped(ctx, complaint_id)
    before = {"department": complaint.department.name, "category": complaint.category.name if complaint.category else None,
              "location": complaint.location.name, "priority": complaint.priority.name}
    changed = reclassify(ctx, complaint, department_id=payload.department_id, category_id=payload.category_id,
                         location_id=payload.location_id, priority_id=payload.priority_id, reason=payload.reason)
    after = {"department": complaint.department.name, "category": complaint.category.name,
             "location": complaint.location.name, "priority": complaint.priority.name}
    audit_service.record(
        ctx.db, actor=ctx.user, action="complaint.reclassify", entity_type="complaint",
        entity_id=complaint.generated_id,
        summary=f"{complaint.generated_id}: changed {', '.join(changed)} ({payload.reason.strip()[:200]})",
        changes={field: [before[field], after[field]] for field in changed}, request=request,
    )
    ctx.db.commit()
    return staff_detail(ctx, _get_scoped(ctx, complaint_id))


@router.post("/{complaint_id}/rejection-requests", status_code=status.HTTP_201_CREATED)
def request_rejection(
    complaint_id: str, payload: RejectionRequestBody, request: Request,
    ctx: AccessContext = Depends(require_permission("complaint.reject.request")),
):
    complaint = _get_scoped(ctx, complaint_id)
    rejection = rejection_service.request_rejection(ctx, complaint, payload.reason_id, payload.reason)
    audit_service.record(
        ctx.db, actor=ctx.user, action="complaint.rejection_request", entity_type="complaint",
        entity_id=complaint.generated_id,
        summary=f"{complaint.generated_id}: rejection requested ({rejection.reason_category.name})"
                + (f", routed to {rejection.approver.name}" if rejection.approver else ""),
        changes={"status": [rejection.previous_status, complaint.status]}, request=request,
    )
    ctx.db.commit()
    return staff_detail(ctx, complaint)


@router.get("/{complaint_id}/assignee-options")
def assignee_options(complaint_id: str, ctx: AccessContext = Depends(require_permission("complaint.view"))):
    if not (ctx.has("complaint.assign") or ctx.has("complaint.reassign")):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing permission: complaint.assign")
    complaint = _get_scoped(ctx, complaint_id, detail=False)
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
    reason = single_line(payload.reason, "Reason", max_length(ComplaintAssignment.reason), required=False)
    assignee = routing_service.manual_assign(ctx, complaint, payload.assignee_id, reason)
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
    if rejection_service.pending_request(complaint) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A rejection request is pending; decide or withdraw it first")
    assignee = routing_service.auto_route(ctx.db, complaint, actor=ctx.user)
    if assignee is not None:
        audit_service.record(
            ctx.db, actor=ctx.user, action="complaint.assign", entity_type="complaint",
            entity_id=complaint.generated_id,
            summary=f"{complaint.generated_id} auto-assigned to {assignee.name}", request=request,
        )
    ctx.db.commit()
    return staff_detail(ctx, complaint)


@router.post("/{complaint_id}/comments", status_code=status.HTTP_201_CREATED)
def add_comment(
    complaint_id: str,
    body: str = Form(...),
    is_internal: bool = Form(...),
    files: list[UploadFile] = File(default=[]),
    ctx: AccessContext = Depends(require_permission("complaint.respond")),
):
    complaint = _get_scoped(ctx, complaint_id)
    if complaint.status in (CLOSED, REJECTED):
        raise HTTPException(status.HTTP_409_CONFLICT, "Reopen the complaint before adding comments")
    stored = attachment_service.StoredFiles()
    try:
        comment = workflow_service.add_comment(ctx.db, complaint, ctx.user, body, is_internal=is_internal)
        attachment_service.save_attachments(ctx.db, complaint, files, ctx.user, stored, comment=comment)
        ctx.db.commit()
    except BaseException:
        ctx.db.rollback()
        stored.discard()
        raise
    return staff_detail(ctx, _get_scoped(ctx, complaint_id))

