"""Analytics over complaints in the caller's scope (reports.view)."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status

from services import analytics_service
from services.access_service import AccessContext
from services.analytics_service import Filters
from utils.auth_middleware import require_permission
from utils.csv_export import csv_response

router = APIRouter()


def report_filters(
    date_from: date | None = None,
    date_to: date | None = None,
    department_id: int | None = None,
    location_id: int | None = None,
    priority_id: int | None = None,
    ctx: AccessContext = Depends(require_permission("reports.view")),
) -> tuple[AccessContext, Filters]:
    """Complaints submitted in [date_from, date_to] (organisation time zone);
    without dates, the last REPORT_DEFAULT_DAYS days."""
    return ctx, analytics_service.build_filters(ctx.db, date_from, date_to, department_id, location_id, priority_id)


def _period(filters: Filters) -> dict:
    return {"date_from": filters.date_from.isoformat(), "date_to": filters.date_to.isoformat()}


@router.get("/overview")
def overview(scope=Depends(report_filters)):
    """Metrics for the period, the same-length previous period, and the trend."""
    ctx, filters = scope
    rows = analytics_service.load_rows(ctx, filters)
    previous = filters.shifted_back()
    return {
        "period": _period(filters),
        "previous_period": _period(previous),
        "metrics": analytics_service.metrics(rows),
        "previous": analytics_service.metrics(analytics_service.load_rows(ctx, previous)),
        "trend": analytics_service.trend(rows, filters),
    }


@router.get("/levels")
def levels(ctx: AccessContext = Depends(require_permission("reports.view"))):
    """Location levels the location table can be grouped by."""
    return analytics_service.levels(ctx.db)


def _table(name: str, rows: list[dict], format: str | None, extra_columns: list[tuple[str, str]] = ()):
    if format is None:
        return rows
    if format != "csv":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "format must be csv (or omitted for JSON)")
    columns = analytics_service.PERFORMANCE_COLUMNS[:1] + list(extra_columns) + analytics_service.PERFORMANCE_COLUMNS[1:]
    return csv_response(
        f"{name}-performance",
        [label for _, label in columns],
        ([row.get(key) if row.get(key) is not None else "" for key, _ in columns] for row in rows),
    )


@router.get("/agents")
def agents(format: str | None = None, scope=Depends(report_filters)):
    ctx, filters = scope
    rows = analytics_service.by_agent(ctx.db, analytics_service.load_rows(ctx, filters))
    return _table("staff", rows, format, [("role", "Role")])


@router.get("/departments")
def departments(format: str | None = None, scope=Depends(report_filters)):
    ctx, filters = scope
    rows = analytics_service.by_department(ctx.db, analytics_service.load_rows(ctx, filters))
    return _table("department", rows, format)


@router.get("/locations")
def locations(level: str, format: str | None = None, scope=Depends(report_filters)):
    ctx, filters = scope
    rows = analytics_service.by_location(ctx.db, analytics_service.load_rows(ctx, filters), level)
    return _table(f"location-{level}", rows, format, [("path", "Location"), ("type", "Level")])
