"""Import history and downloadable per-row reports."""
import json

from fastapi import APIRouter, Depends, HTTPException, status

from models import ImportBatch
from services.access_service import AccessContext
from utils.auth_middleware import get_access_context
from utils.csv_export import csv_response

router = APIRouter()

KIND_PERMISSIONS = {"locations": "location.import", "end_users": "end_user.import"}


def _visible_kinds(ctx: AccessContext) -> list[str]:
    return [kind for kind, permission in KIND_PERMISSIONS.items() if ctx.has(permission)]


def _query(ctx: AccessContext):
    kinds = _visible_kinds(ctx)
    if not kinds:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot import data")
    query = ctx.db.query(ImportBatch).filter(ImportBatch.kind.in_(kinds))
    # Everyone sees their own uploads; auditors see everybody's.
    if not ctx.has("audit.view"):
        query = query.filter(ImportBatch.uploaded_by_id == ctx.user.id)
    return query


def _serialize(batch: ImportBatch) -> dict:
    return {
        "id": batch.id,
        "kind": batch.kind,
        "filename": batch.filename,
        "uploaded_by": batch.uploaded_by.name,
        "dry_run": batch.dry_run,
        "status": batch.status,
        "error": batch.error,
        "total_rows": batch.total_rows,
        "created": batch.created,
        "updated": batch.updated,
        "unchanged": batch.unchanged,
        "failed": batch.failed,
        "warnings": batch.warnings,
        "started_at": batch.started_at.isoformat(),
        "finished_at": batch.finished_at.isoformat() if batch.finished_at else None,
    }


def _get(ctx: AccessContext, batch_id: int) -> ImportBatch:
    batch = _query(ctx).filter(ImportBatch.id == batch_id).first()
    if batch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import not found")
    return batch


@router.get("/")
def list_imports(kind: str | None = None, limit: int = 100, ctx: AccessContext = Depends(get_access_context)):
    query = _query(ctx)
    if kind:
        query = query.filter(ImportBatch.kind == kind)
    batches = query.order_by(ImportBatch.started_at.desc(), ImportBatch.id.desc()).limit(min(max(limit, 1), 500)).all()
    return [_serialize(b) for b in batches]


@router.get("/{batch_id}")
def get_import(batch_id: int, ctx: AccessContext = Depends(get_access_context)):
    batch = _get(ctx, batch_id)
    data = _serialize(batch)
    data["issues"] = [
        {"row": i.row_number, "severity": i.severity, "message": i.message} for i in batch.issues[:2000]
    ]
    return data


@router.get("/{batch_id}/report")
def issue_report(batch_id: int, severity: str = "error", ctx: AccessContext = Depends(get_access_context)):
    """CSV of the rows with problems, in the original columns plus row and issue.
    severity=error gives the rows that were not imported (fix and re-upload them)."""
    batch = _get(ctx, batch_id)
    headers = json.loads(batch.headers) if batch.headers else []
    issues = [i for i in batch.issues if severity == "all" or i.severity == severity]
    rows = []
    for issue in issues:
        data = json.loads(issue.data) if issue.data else {}
        rows.append([data.get(h, "") for h in headers] + [issue.row_number, issue.severity, issue.message])
    name = f"{batch.kind.replace('_', '-')}-import-{batch.id}-{'failed-rows' if severity == 'error' else severity}"
    return csv_response(name, headers + ["source_row", "severity", "issue"], rows)
