"""Import history and downloadable per-row reports."""
import json

from fastapi import APIRouter, Depends, HTTPException, status

from config import DEFAULT_PAGE_SIZE, IMPORT_RESULT_ISSUE_LIMIT, MAX_PAGE_SIZE
from models import ImportBatch, ImportIssue
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
def list_imports(kind: str | None = None, page: int = 1, page_size: int = DEFAULT_PAGE_SIZE,
                 ctx: AccessContext = Depends(get_access_context)):
    page, page_size = max(page, 1), min(max(page_size, 1), MAX_PAGE_SIZE)
    query = _query(ctx)
    if kind:
        if kind not in KIND_PERMISSIONS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown import kind")
        query = query.filter(ImportBatch.kind == kind)
    total = query.count()
    batches = (query.order_by(ImportBatch.started_at.desc(), ImportBatch.id.desc())
               .offset((page - 1) * page_size).limit(page_size).all())
    return {"items": [_serialize(b) for b in batches], "total": total, "page": page, "page_size": page_size}


@router.get("/{batch_id}")
def get_import(batch_id: int, ctx: AccessContext = Depends(get_access_context)):
    batch = _get(ctx, batch_id)
    data = _serialize(batch)
    issues = (ctx.db.query(ImportIssue).filter(ImportIssue.batch_id == batch.id)
              .order_by(ImportIssue.row_number, ImportIssue.id).limit(IMPORT_RESULT_ISSUE_LIMIT + 1).all())
    data["issues"] = [{"row": i.row_number, "severity": i.severity, "message": i.message}
                      for i in issues[:IMPORT_RESULT_ISSUE_LIMIT]]
    data["issues_truncated"] = len(issues) > IMPORT_RESULT_ISSUE_LIMIT
    return data


@router.get("/{batch_id}/report")
def issue_report(batch_id: int, severity: str = "error", ctx: AccessContext = Depends(get_access_context)):
    """CSV of the rows with problems, in the original columns plus row and issue.
    severity=error gives the rows that were not imported (fix and re-upload them)."""
    if severity not in ("error", "warning", "all"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "severity must be error, warning or all")
    batch = _get(ctx, batch_id)
    headers = json.loads(batch.headers) if batch.headers else []
    issues = [i for i in batch.issues if severity == "all" or i.severity == severity]
    if any(i.data is None for i in issues if i.row_number > 1):
        raise HTTPException(status.HTTP_410_GONE,
                            "The original rows of this import have been deleted (retention period); "
                            "only the messages are kept")
    rows = []
    for issue in issues:
        data = json.loads(issue.data) if issue.data else {}
        rows.append([data.get(h, "") for h in headers] + [issue.row_number, issue.severity, issue.message])
    name = f"{batch.kind.replace('_', '-')}-import-{batch.id}-{'failed-rows' if severity == 'error' else severity}"
    return csv_response(name, headers + ["source_row", "severity", "issue"], rows)
