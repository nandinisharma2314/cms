"""Reports over complaints in the viewer's scope.

Complaints are selected by submission date (the period), loaded with only the
columns the metrics need, and aggregated in Python so the maths is identical
on SQLite and MySQL. Suitable for tens of thousands of complaints per query;
beyond that, move the aggregation into SQL or a reporting table.

Definitions
  response time    submission -> first staff response (acknowledged_at)
  resolution time  submission -> marked resolved (resolved_at)
  response SLA     met when the first response came without a recorded
                   response breach; breached when a breach was recorded or the
                   complaint is still awaiting a response past its due time
  resolution SLA   likewise for resolution
"""
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from statistics import median

from sqlalchemy.orm import Session

from models import Complaint, ComplaintEvent, Department, Location, User
from services.access_service import AccessContext
from services.location_service import location_types_by_depth, path_ids, path_names
from services.sla_service import RESOLUTION_BREACH_EVENT, RESPONSE_BREACH_EVENT
from services.statuses import AWAITING_RESPONSE, GROUP_OF
from utils.security import utcnow


@dataclass
class Filters:
    date_from: date
    date_to: date
    department_id: int | None = None
    location_id: int | None = None
    priority: str | None = None

    @property
    def start(self) -> datetime:
        return datetime.combine(self.date_from, datetime.min.time())

    @property
    def end(self) -> datetime:
        return datetime.combine(self.date_to + timedelta(days=1), datetime.min.time())


def default_filters(date_from: date | None, date_to: date | None, **rest) -> Filters:
    today = utcnow().date()
    date_to = date_to or today
    date_from = date_from or date_to - timedelta(days=29)
    if date_from > date_to:
        date_from, date_to = date_to, date_from
    return Filters(date_from, date_to, **rest)


@dataclass
class Row:
    id: int
    department_id: int
    location_id: int
    location_path: str
    assignee_id: int | None
    status: str
    created_at: datetime
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    response_due_at: datetime | None
    resolution_due_at: datetime | None
    sla_paused: bool
    escalated: bool
    rating: int | None
    reopen_count: int
    response_breached: bool = False
    resolution_breached: bool = False


def load_rows(ctx: AccessContext, filters: Filters) -> list[Row]:
    db = ctx.db
    query = (
        db.query(
            Complaint.id, Complaint.department_id, Complaint.location_id, Location.path, Complaint.assigned_to_id,
            Complaint.status, Complaint.created_at, Complaint.acknowledged_at, Complaint.resolved_at,
            Complaint.response_due_at, Complaint.resolution_due_at, Complaint.sla_paused_at,
            Complaint.escalated_to_id, Complaint.feedback_rating, Complaint.reopen_count,
        )
        .join(Location, Complaint.location_id == Location.id)
        .filter(Complaint.created_at >= filters.start, Complaint.created_at < filters.end)
    )
    query = ctx.apply_scope(query, Complaint.department_id)
    if filters.department_id is not None:
        query = query.filter(Complaint.department_id == filters.department_id)
    if filters.priority:
        query = query.filter(Complaint.priority == filters.priority)
    if filters.location_id is not None:
        within = db.get(Location, filters.location_id)
        if within is not None:
            query = query.filter(Location.path.startswith(within.path))

    rows = [
        Row(
            id=r[0], department_id=r[1], location_id=r[2], location_path=r[3], assignee_id=r[4], status=r[5],
            created_at=r[6], acknowledged_at=r[7], resolved_at=r[8], response_due_at=r[9],
            resolution_due_at=r[10], sla_paused=r[11] is not None, escalated=r[12] is not None,
            rating=r[13], reopen_count=r[14] or 0,
        )
        for r in query.all()
    ]
    by_id = {row.id: row for row in rows}
    ids = list(by_id)
    for start in range(0, len(ids), 900):  # stay under SQLite's parameter limit
        chunk = ids[start:start + 900]
        for complaint_id, event_type in (
            db.query(ComplaintEvent.complaint_id, ComplaintEvent.event_type)
            .filter(ComplaintEvent.complaint_id.in_(chunk),
                    ComplaintEvent.event_type.in_([RESPONSE_BREACH_EVENT, RESOLUTION_BREACH_EVENT]))
            .all()
        ):
            if event_type == RESPONSE_BREACH_EVENT:
                by_id[complaint_id].response_breached = True
            else:
                by_id[complaint_id].resolution_breached = True
    # Late answers count even if the SLA checker wasn't running at the time.
    # (After a reopen the response clock restarts, so the first response can't
    # be compared with it any more.)
    for row in rows:
        if (row.acknowledged_at and row.response_due_at and row.reopen_count == 0
                and row.acknowledged_at > row.response_due_at):
            row.response_breached = True
        if row.resolved_at and row.resolution_due_at and row.resolved_at > row.resolution_due_at:
            row.resolution_breached = True
    return rows


def _hours(delta: timedelta) -> float:
    return delta.total_seconds() / 3600


def _stats(values: list[float]) -> dict:
    if not values:
        return {"avg": None, "median": None, "p90": None, "count": 0}
    ordered = sorted(values)
    p90 = ordered[min(len(ordered) - 1, int(round(0.9 * (len(ordered) - 1))))]
    return {
        "avg": round(sum(values) / len(values), 1),
        "median": round(median(values), 1),
        "p90": round(p90, 1),
        "count": len(values),
    }


def _pct(part: int, whole: int) -> float | None:
    return round(100 * part / whole, 1) if whole else None


def metrics(rows: list[Row], now: datetime | None = None) -> dict:
    now = now or utcnow()
    groups = {"open": 0, "in_progress": 0, "resolved": 0, "rejected": 0}
    for row in rows:
        groups[GROUP_OF.get(row.status, "open")] += 1

    response_times = [_hours(r.acknowledged_at - r.created_at) for r in rows if r.acknowledged_at]
    resolution_times = [_hours(r.resolved_at - r.created_at) for r in rows if r.resolved_at]

    response_met = sum(1 for r in rows if r.status not in AWAITING_RESPONSE and r.acknowledged_at and not r.response_breached)
    response_missed = sum(
        1 for r in rows
        if r.response_breached or (r.status in AWAITING_RESPONSE and r.response_due_at and now > r.response_due_at)
    )
    active = {"open", "in_progress"}
    resolution_met = sum(1 for r in rows if r.resolved_at and not r.resolution_breached)
    resolution_missed = sum(
        1 for r in rows
        if r.resolution_breached or (
            GROUP_OF.get(r.status) in active and not r.sla_paused and r.resolution_due_at and now > r.resolution_due_at
        )
    )
    ratings = [r.rating for r in rows if r.rating]
    finished = groups["resolved"]
    return {
        "total": len(rows),
        "open": groups["open"],
        "in_progress": groups["in_progress"],
        "pending": groups["open"] + groups["in_progress"],
        "resolved": groups["resolved"],
        "rejected": groups["rejected"],
        "unassigned": sum(1 for r in rows if r.assignee_id is None and GROUP_OF.get(r.status) in active),
        "escalated_now": sum(1 for r in rows if r.escalated),
        "response_hours": _stats(response_times),
        "resolution_hours": _stats(resolution_times),
        "response_sla": {"met": response_met, "missed": response_missed,
                         "met_pct": _pct(response_met, response_met + response_missed)},
        "resolution_sla": {"met": resolution_met, "missed": resolution_missed,
                           "met_pct": _pct(resolution_met, resolution_met + resolution_missed)},
        "sla_breaches": sum(1 for r in rows if r.response_breached or r.resolution_breached),
        "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "rated": len(ratings),
        "reopened": sum(1 for r in rows if r.reopen_count > 0),
        "reopen_pct": _pct(sum(1 for r in rows if r.reopen_count > 0), finished),
        "rejection_pct": _pct(groups["rejected"], len(rows)),
    }


def trend(rows: list[Row], filters: Filters) -> dict:
    """Received / resolved / breached per day (or per week for periods over 62 days)."""
    days = (filters.date_to - filters.date_from).days + 1
    weekly = days > 62
    step = 7 if weekly else 1

    def bucket(d: date) -> date:
        return d - timedelta(days=(d - filters.date_from).days % step)

    buckets: dict[date, dict] = {}
    current = filters.date_from
    while current <= filters.date_to:
        buckets[current] = {"received": 0, "resolved": 0, "breached": 0}
        current += timedelta(days=step)
    for row in rows:
        key = bucket(row.created_at.date())
        if key in buckets:
            buckets[key]["received"] += 1
            if row.response_breached or row.resolution_breached:
                buckets[key]["breached"] += 1
        if row.resolved_at:
            resolved_key = bucket(row.resolved_at.date())
            if resolved_key in buckets:
                buckets[resolved_key]["resolved"] += 1
    return {
        "interval": "week" if weekly else "day",
        "points": [
            {"date": key.isoformat(), "label": key.strftime("%d %b"), **values} for key, values in buckets.items()
        ],
    }


def _grouped(rows: list[Row], key) -> dict:
    groups: dict = {}
    for row in rows:
        groups.setdefault(key(row), []).append(row)
    return groups


def _performance_row(name: str, rows: list[Row], extra: dict | None = None) -> dict:
    m = metrics(rows)
    return {
        "name": name,
        **(extra or {}),
        "total": m["total"],
        "pending": m["pending"],
        "resolved": m["resolved"],
        "rejected": m["rejected"],
        "escalated_now": m["escalated_now"],
        "avg_response_hours": m["response_hours"]["avg"],
        "avg_resolution_hours": m["resolution_hours"]["avg"],
        "response_sla_pct": m["response_sla"]["met_pct"],
        "resolution_sla_pct": m["resolution_sla"]["met_pct"],
        "sla_breaches": m["sla_breaches"],
        "avg_rating": m["avg_rating"],
        "reopened": m["reopened"],
    }


def by_agent(db: Session, rows: list[Row]) -> list[dict]:
    """Per current handler. Unassigned complaints are grouped separately."""
    groups = _grouped(rows, lambda r: r.assignee_id)
    users = {u.id: u for u in db.query(User).filter(User.id.in_([k for k in groups if k is not None])).all()}
    result = []
    for user_id, group in groups.items():
        if user_id is None:
            result.append(_performance_row("Unassigned (department queue)", group, {"id": None, "role": None}))
        else:
            user = users[user_id]
            result.append(_performance_row(user.name, group, {"id": user.id, "role": user.role.name}))
    return sorted(result, key=lambda r: (r["id"] is None, -r["total"]))


def by_department(db: Session, rows: list[Row]) -> list[dict]:
    groups = _grouped(rows, lambda r: r.department_id)
    names = dict(db.query(Department.id, Department.name).filter(Department.id.in_(list(groups))).all()) if groups else {}
    return sorted(
        (_performance_row(names.get(dept_id, "?"), group, {"id": dept_id}) for dept_id, group in groups.items()),
        key=lambda r: -r["total"],
    )


def by_location(db: Session, rows: list[Row], level: str) -> list[dict]:
    """Rolls complaints up to their ancestor at `level` (e.g. "district").
    Complaints filed at a higher level than that stay at their own location."""
    types = location_types_by_depth(db)
    depth = next((t.depth for t in types if t.key == level), len(types) - 1)

    def ancestor(row: Row) -> int:
        ids = path_ids(row.location_path)
        return ids[depth] if len(ids) > depth else ids[-1]

    groups = _grouped(rows, ancestor)
    locations = db.query(Location).filter(Location.id.in_(list(groups))).all() if groups else []
    names = path_names(db, locations)
    by_id = {loc.id: loc for loc in locations}
    return sorted(
        (
            _performance_row(
                names.get(loc_id, [by_id[loc_id].name])[-1], group,
                {"id": loc_id, "path": " > ".join(names.get(loc_id, [])), "type": by_id[loc_id].type.name},
            )
            for loc_id, group in groups.items()
        ),
        key=lambda r: -r["total"],
    )


PERFORMANCE_COLUMNS = [
    ("name", "Name"), ("total", "Total"), ("pending", "Pending"), ("resolved", "Resolved"),
    ("rejected", "Rejected"), ("escalated_now", "Escalated now"), ("avg_response_hours", "Avg response (h)"),
    ("avg_resolution_hours", "Avg resolution (h)"), ("response_sla_pct", "Response SLA met %"),
    ("resolution_sla_pct", "Resolution SLA met %"), ("sla_breaches", "SLA breaches"),
    ("avg_rating", "Avg rating"), ("reopened", "Reopened"),
]
