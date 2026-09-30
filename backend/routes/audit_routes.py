"""Read-only audit trail (there are deliberately no update/delete endpoints)."""
import json
from datetime import date

from fastapi import APIRouter, Depends

from config import AUDIT_EXPORT_MAX_ROWS, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from models import AuditLog
from services import settings_service
from services.access_service import AccessContext
from utils.auth_middleware import require_permission
from utils.csv_export import csv_response
from utils.search import text_match

router = APIRouter()


def _filtered(
    ctx: AccessContext,
    action: str | None,
    entity_type: str | None,
    entity_id: str | None,
    actor_id: int | None,
    actor: str | None,
    q: str | None,
    date_from: date | None,
    date_to: date | None,
):
    query = ctx.db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action.startswith(action))
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id.strip())
    if actor_id is not None:
        query = query.filter(AuditLog.actor_type == "staff", AuditLog.actor_id == actor_id)
    if actor:
        query = query.filter(text_match(actor.strip(), AuditLog.actor_name))
    if q:
        query = query.filter(text_match(q.strip(), AuditLog.summary))
    # Dates are days in the organisation's time zone, as everywhere else in the app.
    if date_from:
        query = query.filter(AuditLog.created_at >= settings_service.day_start_utc(settings_service.timezone(ctx.db),
                                                                                    date_from))
    if date_to:
        query = query.filter(AuditLog.created_at < settings_service.day_end_utc(settings_service.timezone(ctx.db),
                                                                                 date_to))
    return query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())


def _serialize(r: AuditLog) -> dict:
    return {
        "id": r.id,
        "actor_type": r.actor_type,
        "actor_id": r.actor_id,
        "actor_name": r.actor_name,
        "action": r.action,
        "entity_type": r.entity_type,
        "entity_id": r.entity_id,
        "summary": r.summary,
        "changes": json.loads(r.changes) if r.changes else None,
        "ip_address": r.ip_address,
        "created_at": r.created_at.isoformat(),
    }


@router.get("")
def list_audit_logs(
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    actor_id: int | None = None,
    actor: str | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    ctx: AccessContext = Depends(require_permission("audit.view")),
):
    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    query = _filtered(ctx, action, entity_type, entity_id, actor_id, actor, q, date_from, date_to)
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_serialize(r) for r in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/entity-types")
def entity_types(ctx: AccessContext = Depends(require_permission("audit.view"))):
    """Entity types that appear in the log, for the filter."""
    return sorted(t for (t,) in ctx.db.query(AuditLog.entity_type).distinct().all())


@router.get("/export")
def export_audit_logs(
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    actor_id: int | None = None,
    actor: str | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    ctx: AccessContext = Depends(require_permission("audit.view")),
):
    """CSV of the filtered log (newest first, up to AUDIT_EXPORT_MAX_ROWS rows)."""
    rows = _filtered(ctx, action, entity_type, entity_id, actor_id, actor, q, date_from, date_to).limit(AUDIT_EXPORT_MAX_ROWS)
    return csv_response(
        "audit-log",
        ["time_utc", "actor_type", "actor", "action", "entity_type", "entity_id", "summary", "changes", "ip"],
        (
            [r.created_at.isoformat(), r.actor_type, r.actor_name or "", r.action, r.entity_type, r.entity_id or "",
             r.summary, r.changes or "", r.ip_address or ""]
            for r in rows
        ),
    )
