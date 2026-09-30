"""Complaint priorities. Any staff user can list them; `sla.manage` manages them."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from models import Priority
from services import audit_service, priority_service
from services.access_service import AccessContext
from utils.auth_middleware import get_access_context, require_permission

router = APIRouter()


class CreatePriorityRequest(BaseModel):
    key: str
    name: str
    tone: str
    response_hours: int
    resolution_hours: int
    warning_minutes: int


class UpdatePriorityRequest(BaseModel):
    name: str | None = None
    tone: str | None = None
    is_active: bool | None = None


class PriorityOrder(BaseModel):
    ids: list[int]


@router.get("", include_in_schema=False)
@router.get("/")
def list_priorities(include_inactive: bool = False, ctx: AccessContext = Depends(get_access_context)):
    return [priority_service.serialize(p) for p in priority_service.list_priorities(ctx.db, include_inactive)]


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_priority(payload: CreatePriorityRequest, request: Request,
                    ctx: AccessContext = Depends(require_permission("sla.manage"))):
    ctx.require_covers(None, None)
    priority = priority_service.create(ctx.db, payload.key, payload.name, payload.tone, payload.response_hours,
                                       payload.resolution_hours, payload.warning_minutes)
    audit_service.record(
        ctx.db, actor=ctx.user, action="priority.create", entity_type="priority", entity_id=priority.id,
        summary=f"Added priority {priority.name}: respond {payload.response_hours}h, resolve {payload.resolution_hours}h",
        request=request,
    )
    ctx.db.commit()
    return priority_service.serialize(priority)


@router.patch("/{priority_id}")
def update_priority(priority_id: int, payload: UpdatePriorityRequest, request: Request,
                    ctx: AccessContext = Depends(require_permission("sla.manage"))):
    ctx.require_covers(None, None)
    priority = ctx.db.get(Priority, priority_id)
    if priority is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Priority not found")
    before = priority_service.serialize(priority)
    priority_service.update(ctx.db, priority, payload.name, payload.tone, payload.is_active)
    changes = audit_service.diff(before, priority_service.serialize(priority))
    if changes:
        audit_service.record(ctx.db, actor=ctx.user, action="priority.update", entity_type="priority",
                             entity_id=priority.id, summary=f"Updated priority {priority.name}: {', '.join(changes)}",
                             changes=changes, request=request)
    ctx.db.commit()
    return priority_service.serialize(priority)


@router.put("/order")
def reorder_priorities(payload: PriorityOrder, request: Request,
                       ctx: AccessContext = Depends(require_permission("sla.manage"))):
    ctx.require_covers(None, None)
    priority_service.reorder(ctx.db, payload.ids)
    audit_service.record(ctx.db, actor=ctx.user, action="priority.reorder", entity_type="priority", entity_id=None,
                         summary="Changed the order of priorities", request=request)
    ctx.db.commit()
    return [priority_service.serialize(p) for p in priority_service.list_priorities(ctx.db, include_inactive=True)]
