"""Read-only audit trail (there are deliberately no update/delete endpoints)."""
import json
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends

from models import AuditLog
from services.access_service import AccessContext
from utils.auth_middleware import require_permission
from utils.csv_export import csv_response

router = APIRouter()

EXPORT_LIMIT = 50_000


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
        query = query.filter(AuditLog.actor_name.ilike(f"%{actor.strip()}%"))
    if q:
        query = query.filter(AuditLog.summary.ilike(f"%{q.strip()}%"))
    if date_from:
        query = query.filter(AuditLog.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(AuditLog.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
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


@router.get("/")
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
    page_size: int = 50,
    ctx: AccessContext = Depends(require_permission("audit.view")),
):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    query = _filtered(ctx, action, entity_type, entity_id, actor_id, actor, q, date_from, date_to)
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_serialize(r) for r in rows], "total": total, "page": page, "page_size": page_size}


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
    """CSV of the filtered log (newest first, up to 50,000 rows)."""
    rows = _filtered(ctx, action, entity_type, entity_id, actor_id, actor, q, date_from, date_to).limit(EXPORT_LIMIT)
    return csv_response(
        "audit-log",
        ["time_utc", "actor_type", "actor", "action", "entity_type", "entity_id", "summary", "changes", "ip"],
        (
            [r.created_at.isoformat(), r.actor_type, r.actor_name or "", r.action, r.entity_type, r.entity_id or "",
             r.summary, r.changes or "", r.ip_address or ""]
            for r in rows
        ),
    )
