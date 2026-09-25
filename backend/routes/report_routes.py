"""Analytics over complaints in the caller's scope (reports.view)."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends

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
    priority: str | None = None,
) -> Filters:
    """Complaints submitted in [date_from, date_to]; defaults to the last 30 days."""
    return analytics_service.default_filters(
        date_from, date_to, department_id=department_id, location_id=location_id, priority=priority or None,
    )


def _period(filters: Filters) -> dict:
    return {"date_from": filters.date_from.isoformat(), "date_to": filters.date_to.isoformat()}


@router.get("/summary")
def summary(filters: Filters = Depends(report_filters), ctx: AccessContext = Depends(require_permission("reports.view"))):
    rows = analytics_service.load_rows(ctx, filters)
    # the same number of days just before, for comparison
    length = filters.date_to - filters.date_from
    previous = Filters(filters.date_from - length - timedelta(days=1), filters.date_from - timedelta(days=1),
                       filters.department_id, filters.location_id, filters.priority)
    return {
        "period": _period(filters),
        "previous_period": _period(previous),
        "metrics": analytics_service.metrics(rows),
        "previous": analytics_service.metrics(analytics_service.load_rows(ctx, previous)),
    }


@router.get("/trend")
def trend(filters: Filters = Depends(report_filters), ctx: AccessContext = Depends(require_permission("reports.view"))):
    return analytics_service.trend(analytics_service.load_rows(ctx, filters), filters)


def _table(name: str, rows: list[dict], format: str | None, extra_columns: list[tuple[str, str]] = ()):
    if format != "csv":
        return rows
    columns = analytics_service.PERFORMANCE_COLUMNS[:1] + list(extra_columns) + analytics_service.PERFORMANCE_COLUMNS[1:]
    return csv_response(
        f"{name}-performance",
        [label for _, label in columns],
        ([row.get(key) if row.get(key) is not None else "" for key, _ in columns] for row in rows),
    )


@router.get("/agents")
def agents(format: str | None = None, filters: Filters = Depends(report_filters),
           ctx: AccessContext = Depends(require_permission("reports.view"))):
    rows = analytics_service.by_agent(ctx.db, analytics_service.load_rows(ctx, filters))
    return _table("agent", rows, format, [("role", "Role")])


@router.get("/departments")
def departments(format: str | None = None, filters: Filters = Depends(report_filters),
                ctx: AccessContext = Depends(require_permission("reports.view"))):
    rows = analytics_service.by_department(ctx.db, analytics_service.load_rows(ctx, filters))
    return _table("department", rows, format)


@router.get("/locations")
def locations(level: str = "district", format: str | None = None, filters: Filters = Depends(report_filters),
              ctx: AccessContext = Depends(require_permission("reports.view"))):
    rows = analytics_service.by_location(ctx.db, analytics_service.load_rows(ctx, filters), level)
    return _table(f"{level}", rows, format, [("path", "Location"), ("type", "Level")])
