from datetime import datetime, timedelta, timezone as dt_timezone

from fastapi import HTTPException, status
from sqlalchemy import Integer, and_, case, cast, func, not_, or_, true
from sqlalchemy.orm import Query, Session, selectinload

from config import DESCRIPTION_MAX_LENGTH, NOTE_MAX_LENGTH
from models import (
    Complaint, ComplaintAttachment, ComplaintCategory, ComplaintComment, Department, EndUser, Location, Priority,
    User, max_length,
)
from services import attachment_service, priority_service, rejection_service, routing_service, settings_service, \
    sla_service
from services.access_service import AccessContext
from services.events import record_event
from services.location_service import path_names, require_usable, serialize_location
from services.statuses import (
    ACTIVE_STATUSES, AWAITING_RESPONSE, CLOSED, GROUP_OF, REJECTED, STATUS_GROUPS, SUBMITTED, end_user_status_label,
    status_label,
)
from services.workflow_service import ACTION_PERMISSIONS, end_user_actions_for, reopen_deadline, staff_actions_for
from utils.security import utcnow
from utils.text import multi_line, single_line

# Eager loading for complaint lists (avoids one query per row).
LIST_OPTIONS = (
    selectinload(Complaint.attachments).selectinload(ComplaintAttachment.comment),
    selectinload(Complaint.assigned_to),
    selectinload(Complaint.escalated_to),
)
DETAIL_OPTIONS = LIST_OPTIONS + (
    selectinload(Complaint.comments).selectinload(ComplaintComment.attachments),
    selectinload(Complaint.events),
    selectinload(Complaint.assignments),
    selectinload(Complaint.escalations),
    selectinload(Complaint.rejection_requests),
    selectinload(Complaint.end_user),
)


def resolve_classification(
    db: Session, department_id: int, category_id: int | None, location_id: int | None,
) -> tuple[Department, ComplaintCategory, Location]:
    department = db.get(Department, department_id)
    if department is None or not department.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Department not found or inactive")
    if category_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose a category")
    category = db.get(ComplaintCategory, category_id)
    if category is None or category.department_id != department.id or not category.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Category not found in this department")
    if location_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose the location of the issue")
    location = require_usable(db, db.get(Location, location_id))
    return department, category, location


def highest_number_used(db: Session, prefix: str) -> int | None:
    """The largest number already issued as `<prefix>-<number>`."""
    number = cast(func.substring(Complaint.generated_id, len(prefix) + 2), Integer)
    return db.query(func.max(number)).filter(Complaint.generated_id.like(f"{prefix}-%")).scalar()


def _next_generated_id(db: Session) -> str:
    """Takes the next complaint number under a row lock, so concurrent
    submissions never get the same ID."""
    settings = settings_service.get_settings(db, for_update=True)
    if not settings.complaint_id_prefix:
        raise settings_service.SettingNotConfigured("complaint_id_prefix")
    if settings.complaint_next_number is None:
        raise settings_service.SettingNotConfigured("complaint_next_number")
    number = settings.complaint_next_number
    settings.complaint_next_number = number + 1
    return f"{settings.complaint_id_prefix}-{number}"


def register_complaint(
    db: Session,
    *,
    department: Department,
    category: ComplaintCategory,
    location: Location,
    priority: Priority,
    title: str,
    description: str,
    additional_details: str | None = None,
    end_user: EndUser | None = None,
    created_by: User | None = None,
    end_user_name: str | None = None,
    end_user_phone: str | None = None,
    at: datetime | None = None,
) -> Complaint:
    """Creates a complaint, records its submission and routes it. The caller commits."""
    now = at or utcnow()
    complaint = Complaint(
        generated_id=_next_generated_id(db),
        end_user=end_user,
        created_by_user_id=created_by.id if created_by else None,
        department=department,
        category=category,
        location=location,
        priority=priority,
        title=title,
        description=description,
        additional_details=additional_details,
        end_user_name=end_user_name or (end_user.name if end_user else None),
        end_user_phone=end_user_phone or (end_user.mobile if end_user else None),
        status=SUBMITTED,
        reopen_count=0,
        created_at=now,
        updated_at=now,
    )
    db.add(complaint)
    db.flush()

    submitter = end_user or created_by
    if created_by is None:
        message = public = "Complaint submitted"
    elif end_user is not None:
        message = f"Registered by {created_by.name} for {end_user.name}"
        public = "Complaint registered for you by the support team"
    else:
        message = f"Registered by {created_by.name} for {end_user_name or 'someone without an account'}"
        public = "Complaint registered by the support team"
    record_event(db, complaint, "submitted", submitter, message, public_message=public, to_status=SUBMITTED, at=now)
    record_event(
        db, complaint, "routed", None,
        f"Routed to the {department.name} department for {location.name} ({priority.name} priority)",
        public_message=f"Forwarded to the {department.name} department",
        at=now,
    )
    sla_service.start_clocks(db, complaint, now)
    routing_service.auto_route(db, complaint, at=now)
    return complaint


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def serialize_priority(priority: Priority) -> dict:
    return {"id": priority.id, "key": priority.key, "name": priority.name, "tone": priority.tone,
            "rank": priority.rank}


def serialize_complaints(db: Session, complaints: list[Complaint], for_end_user: bool = False) -> list[dict]:
    names = path_names(db, [c.location for c in complaints])
    now = utcnow()
    result = []
    for c in complaints:
        attachments = [
            a for a in c.attachments
            if not (for_end_user and a.comment is not None and a.comment.is_internal)
        ]
        item = {
            "id": c.generated_id,
            "title": c.title,
            "description": c.description,
            "additional_details": c.additional_details,
            "department": c.department.name,
            "department_id": c.department_id,
            "category": c.category.name if c.category else None,
            "category_id": c.category_id,
            "priority": serialize_priority(c.priority),
            "location": c.location.name,
            "location_detail": serialize_location(c.location, names),
            "status": c.status,
            "status_label": end_user_status_label(c.status) if for_end_user else status_label(c.status),
            "status_group": GROUP_OF[c.status],
            "created_at": c.created_at.isoformat(),
            "updated_at": c.updated_at.isoformat(),
            "assigned_at": _iso(c.assigned_at),
            "acknowledged_at": _iso(c.acknowledged_at),
            "resolved_at": _iso(c.resolved_at),
            "closed_at": _iso(c.closed_at),
            "resolution_note": c.resolution_note,
            "reopen_count": c.reopen_count,
            "feedback_rating": c.feedback_rating,
            "feedback_comment": c.feedback_comment,
            "attachments": [attachment_service.serialize(a) for a in attachments],
            # targets the end user can see; breach details stay internal
            "response_due_at": _iso(c.response_due_at) if c.status in AWAITING_RESPONSE else None,
            "resolution_due_at": _iso(c.resolution_due_at) if c.status in ACTIVE_STATUSES else None,
        }
        if not for_end_user:
            item["end_user_name"] = c.end_user_name
            item["end_user_phone"] = c.end_user_phone
            item["assignee"] = (
                {"id": c.assigned_to.id, "name": c.assigned_to.name, "role": c.assigned_to.role.name}
                if c.assigned_to else None
            )
            item["sla"] = sla_service.sla_state(c, now)
            item["sla_paused"] = c.sla_paused_at is not None
            item["escalation"] = (
                {
                    "level": c.escalation_level,
                    "type": c.escalation_type,
                    "to": {"id": c.escalated_to.id, "name": c.escalated_to.name, "role": c.escalated_to.role.name},
                    "next_at": _iso(c.escalation_due_at),
                }
                if c.escalated_to else None
            )
        result.append(item)
    return result


def _comment(comment: ComplaintComment, for_end_user: bool, department_name: str) -> dict:
    staff = comment.author_type == "staff"
    return {
        "id": comment.id,
        "author_type": comment.author_type,
        # End users see the department rather than the individual staff member.
        "author_name": f"{department_name} department" if (staff and for_end_user) else comment.author_name,
        "body": comment.body,
        "is_internal": comment.is_internal,
        "created_at": comment.created_at.isoformat(),
        "attachments": [attachment_service.serialize(a) for a in comment.attachments],
    }


def staff_detail(ctx: AccessContext, complaint: Complaint) -> dict:
    data = serialize_complaints(ctx.db, [complaint])[0]
    department = complaint.department.name
    data["end_user"] = (
        {"id": complaint.end_user.id, "name": complaint.end_user.name, "mobile": complaint.end_user.mobile,
         "email": complaint.end_user.email}
        if complaint.end_user else None
    )
    data["timeline"] = [
        {
            "id": e.id,
            "type": e.event_type,
            "message": e.message,
            "public": e.public_message is not None,
            "note": e.note,
            "from_status": e.from_status,
            "to_status": e.to_status,
            "actor_type": e.actor_type,
            "actor_name": e.actor_name,
            "created_at": e.created_at.isoformat(),
        }
        for e in complaint.events
    ]
    data["comments"] = [_comment(c, False, department) for c in complaint.comments]
    data["assignments"] = [
        {
            "assignee": {"id": a.assignee.id, "name": a.assignee.name, "role": a.assignee.role.name},
            "method": a.method,
            "reason": a.reason,
            "assigned_by": a.assigned_by.name if a.assigned_by else None,
            "assigned_at": a.assigned_at.isoformat(),
            "ended_at": _iso(a.ended_at),
        }
        for a in complaint.assignments
    ]
    data["escalations"] = [
        {
            "type": e.breach_type,
            "level": e.level,
            "from": e.from_user.name if e.from_user else None,
            "to": e.to_user.name if e.to_user else None,
            "created_at": e.created_at.isoformat(),
            "resolved_at": _iso(e.resolved_at),
        }
        for e in complaint.escalations
    ]
    data["sla_due"] = {
        "response_due_at": _iso(complaint.response_due_at),
        "response_breached_at": _iso(complaint.response_breached_at),
        "resolution_due_at": _iso(complaint.resolution_due_at),
        "resolution_breached_at": _iso(complaint.resolution_breached_at),
    }
    data["actions"] = [
        {"key": a.key, "label": a.label, "note": a.note, "note_label": a.note_label}
        for a in staff_actions_for(ctx, complaint)
    ]
    data["rejection"] = {
        "can_request": rejection_service.can_request(ctx, complaint),
        "reasons": [rejection_service.serialize_reason(r) for r in rejection_service.list_reasons(ctx.db)],
        "requests": [rejection_service.serialize(r, ctx) for r in complaint.rejection_requests],
    }
    open_for_changes = complaint.status not in (CLOSED, REJECTED)
    pending = rejection_service.pending_request(complaint) is not None
    data["can_assign"] = open_for_changes and not pending and ctx.has(
        "complaint.reassign" if complaint.assigned_to_id else "complaint.assign"
    )
    data["can_comment"] = ctx.has("complaint.respond") and open_for_changes
    data["can_reclassify"] = ctx.has("complaint.reclassify") and open_for_changes
    data["attachment_room"] = attachment_room(ctx.db, complaint)
    return data


def attachment_room(db: Session, complaint: Complaint) -> int | None:
    """How many more files the complaint may take (every attachment counts, including
    those on internal notes), or None while the limit is not configured."""
    limit = settings_service.get_settings(db).max_attachments_per_complaint
    return None if limit is None else max(0, limit - len(complaint.attachments))


def end_user_detail(db: Session, end_user: EndUser, complaint: Complaint, permissions: frozenset[str]) -> dict:
    """The end user's view of their complaint. `actions` lists only what both the
    complaint's state and the End User role's `permissions` allow."""
    data = serialize_complaints(db, [complaint], for_end_user=True)[0]
    department = complaint.department.name
    timeline = []
    for e in complaint.events:
        if e.public_message is None:
            continue
        if e.actor_type == "end_user":
            actor = "You"
        elif e.actor_type == "staff":
            actor = f"{department} department"
        else:
            actor = None
        timeline.append({
            "id": e.id,
            "type": e.event_type,
            "message": e.public_message,
            # routing/assignment notes are internal; status notes are addressed to the end user
            "note": e.note if e.event_type in ("status_changed", "feedback") else None,
            "actor_name": actor,
            "created_at": e.created_at.isoformat(),
        })
    data["timeline"] = timeline
    data["comments"] = [_comment(c, True, department) for c in complaint.comments if not c.is_internal]
    data["actions"] = [a for a in end_user_actions_for(db, complaint) if ACTION_PERMISSIONS[a] in permissions]
    data["reopen_until"] = _iso(reopen_deadline(db, complaint)) if "reopen" in data["actions"] else None
    data["attachment_room"] = attachment_room(db, complaint)
    return data


# ---------------------------------------------------------------------------
# Reclassification
# ---------------------------------------------------------------------------

def reclassify(
    ctx: AccessContext, complaint: Complaint, *, department_id: int, category_id: int, location_id: int,
    priority_id: int, reason: str, at: datetime | None = None,
) -> list[str]:
    """Changes department, category, location and/or priority. Re-routes the
    complaint when its handler no longer covers it and shifts the SLA clocks
    to the new targets. Returns the names of the changed fields. The caller commits."""
    ctx.require("complaint.reclassify")
    if complaint.status in (CLOSED, REJECTED):
        raise HTTPException(status.HTTP_409_CONFLICT, "Closed or rejected complaints cannot be changed")
    reason = multi_line(reason, "The reason for the change", NOTE_MAX_LENGTH)
    db, now = ctx.db, at or utcnow()
    # Values that stay the same are kept even if they were switched off since the complaint was filed.
    if (department_id, category_id) == (complaint.department_id, complaint.category_id):
        department, category = complaint.department, complaint.category
        location = (complaint.location if location_id == complaint.location_id
                    else require_usable(db, db.get(Location, location_id)))
    else:
        department, category, location = resolve_classification(db, department_id, category_id, location_id)
    priority = complaint.priority if priority_id == complaint.priority_id else priority_service.get_active(db, priority_id)
    ctx.require_covers(department.id, location.path)

    before = {"department": complaint.department.name, "category": complaint.category.name if complaint.category else None,
              "location": complaint.location.name, "priority": complaint.priority.name}
    after = {"department": department.name, "category": category.name, "location": location.name,
             "priority": priority.name}
    changed = [field for field in before if before[field] != after[field]]
    if not changed:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing was changed")

    old_rule = sla_service.sla_for(db, complaint)
    complaint.department, complaint.category, complaint.location, complaint.priority = (
        department, category, location, priority,
    )
    db.flush()
    sla_service.apply_target_change(db, complaint, old_rule, now)

    public = []
    if "department" in changed:
        public.append(f"moved to the {department.name} department")
    if "location" in changed:
        public.append(f"location updated to {location.name}")
    if "priority" in changed:
        public.append(f"priority set to {priority.name}")
    summary = ", ".join(f"{field} {before[field] or '—'} → {after[field]}" for field in changed)
    record_event(db, complaint, "reclassified", ctx.user, f"Changed {summary}",
                 public_message=("Complaint " + ", ".join(public)) if public else None, note=reason, at=now)

    if complaint.escalated_to is not None and not sla_service.covers(complaint.escalated_to, complaint):
        sla_service.end_escalation(complaint, now)
    handler = complaint.assigned_to
    if handler is not None and not routing_service.still_handles(handler, complaint):
        routing_service.unassign(db, complaint, ctx.user, "no longer covers the complaint after it was changed", now)
        routing_service.auto_route(db, complaint, actor=ctx.user, at=now)
    elif handler is None:
        routing_service.auto_route(db, complaint, actor=ctx.user, at=now, record_queue_event=False)
    return changed


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

def _change(current: int, previous: int, good_when: str) -> dict | None:
    """Change vs the previous period: signed percent, direction, and whether it
    is good news. None when there is no baseline."""
    if previous == 0:
        return None
    percent = round((current - previous) / previous * 100)
    direction = "up" if percent > 0 else "down" if percent < 0 else "flat"
    if direction == "flat" or good_when == "neutral":
        sentiment = "neutral"
    else:
        sentiment = "good" if direction == good_when else "bad"
    return {"percent": percent, "direction": direction, "sentiment": sentiment}


def sla_breached_clause(now: datetime):
    """Open complaints past a response or (running) resolution target, or with a
    breach already recorded by the SLA check."""
    return or_(
        and_(Complaint.status.in_(AWAITING_RESPONSE),
             or_(Complaint.response_due_at <= now, Complaint.response_breached_at.isnot(None))),
        and_(Complaint.status.in_(ACTIVE_STATUSES), Complaint.sla_paused_at.is_(None),
             or_(Complaint.resolution_due_at <= now, Complaint.resolution_breached_at.isnot(None))),
    )


def sla_at_risk_clause(now: datetime):
    """Open complaints inside the warning window of a target, not yet breached."""
    return and_(
        not_(sla_breached_clause(now)),
        or_(
            and_(Complaint.status.in_(AWAITING_RESPONSE), Complaint.response_warn_at <= now),
            and_(Complaint.status.in_(ACTIVE_STATUSES), Complaint.sla_paused_at.is_(None),
                 Complaint.resolution_warn_at <= now),
        ),
    )


def group_counts(scoped: Query) -> dict[str, int]:
    counts = dict(scoped.with_entities(Complaint.status, func.count(Complaint.id)).group_by(Complaint.status).all())
    return {group: sum(counts.get(s, 0) for s in statuses) for group, statuses in STATUS_GROUPS.items()}


def dashboard_stats(
    db: Session,
    scoped: Query,
    trend_days: int,
    comparison_days: int,
    date_from: str = None,
    date_to: str = None,
) -> dict:
    """Counts, changes over the last `comparison_days` (vs the same span before)
    and a daily trend over an already-scoped Complaint query. Days follow the
    organisation's time zone."""
    tz = settings_service.timezone(db)
    now = utcnow()

    # Apply date filters if provided
    if date_from:
        d_from = datetime.fromisoformat(date_from)
        scoped = scoped.filter(Complaint.created_at >= d_from)
    if date_to:
        d_to = datetime.fromisoformat(date_to) + timedelta(days=1)
        scoped = scoped.filter(Complaint.created_at < d_to)

    by_status = dict(scoped.with_entities(Complaint.status, func.count(Complaint.id)).group_by(Complaint.status).all())
    total = sum(by_status.values())
    counts = {group: sum(by_status.get(s, 0) for s in statuses) for group, statuses in STATUS_GROUPS.items()}

    current_start = now - timedelta(days=comparison_days)
    previous_start = now - timedelta(days=2 * comparison_days)

    def window_counts(statuses: list[str] | None) -> tuple[int, int]:
        condition = Complaint.status.in_(statuses) if statuses is not None else true()
        current, previous = scoped.with_entities(
            func.coalesce(func.sum(case((and_(condition, Complaint.created_at >= current_start), 1), else_=0)), 0),
            func.coalesce(func.sum(case((and_(condition, Complaint.created_at >= previous_start,
                                              Complaint.created_at < current_start), 1), else_=0)), 0),
        ).one()
        return int(current), int(previous)

    total_change = _change(*window_counts(None), good_when="neutral")
    good_when = {"open": "down", "in_progress": "down", "resolved": "up", "rejected": "neutral"}
    changes = {group: _change(*window_counts(statuses), good_when=good_when[group])
               for group, statuses in STATUS_GROUPS.items()}

    departments = scoped.with_entities(Department.name, func.count(Complaint.id)).join(
        Department, Complaint.department_id == Department.id,
    ).group_by(Department.name).order_by(func.count(Complaint.id).desc()).all()

    # Determine the end date for the trend
    trend_end_date = datetime.fromisoformat(date_to).date() if date_to else datetime.now(tz).date()
    actual_trend_days = trend_days
    if date_from and date_to:
        d_from_date = datetime.fromisoformat(date_from).date()
        actual_trend_days = max(1, (trend_end_date - d_from_date).days + 1)

    trend = []
    for offset in range(actual_trend_days - 1, -1, -1):
        day = trend_end_date - timedelta(days=offset)
        local_start = datetime.combine(day, datetime.min.time(), tz)
        start = local_start.astimezone(dt_timezone.utc).replace(tzinfo=None)
        end = (local_start + timedelta(days=1)).astimezone(dt_timezone.utc).replace(tzinfo=None)
        received, resolved = scoped.with_entities(
            func.coalesce(func.sum(case((and_(Complaint.created_at >= start, Complaint.created_at < end), 1),
                                        else_=0)), 0),
            func.coalesce(func.sum(case((and_(Complaint.resolved_at >= start, Complaint.resolved_at < end), 1),
                                        else_=0)), 0),
        ).one()
        trend.append({"date": day.isoformat(), "received": int(received), "resolved": int(resolved)})

    denominator = total or 1
    return {
        "metrics": {
            "total": total,
            "total_change": total_change,
            **{group: counts[group] for group in STATUS_GROUPS},
            **{f"{group}_change": changes[group] for group in STATUS_GROUPS},
            "unassigned": scoped.filter(
                Complaint.assigned_to_id.is_(None), Complaint.status.in_(ACTIVE_STATUSES)
            ).count(),
            "sla_breached": scoped.filter(sla_breached_clause(now)).count(),
            "sla_at_risk": scoped.filter(sla_at_risk_clause(now)).count(),
            "escalated": scoped.filter(Complaint.escalated_to_id.isnot(None)).count(),
        },
        "status_breakdown": {
            group: {"count": counts[group], "percentage": round(counts[group] / denominator * 100)}
            for group in STATUS_GROUPS
        },
        "by_status": [
            {"status": value, "label": status_label(value), "count": count}
            for value, count in sorted(by_status.items(), key=lambda item: -item[1])
        ],
        "departments": [{"name": name, "count": count} for name, count in departments],
        "trend": trend,
    }


def clean_complaint_text(title: str | None, description: str | None,
                         additional_details: str | None) -> tuple[str, str, str | None]:
    return (
        single_line(title, "Title", max_length(Complaint.title)),
        multi_line(description, "Description", DESCRIPTION_MAX_LENGTH),
        multi_line(additional_details, "Additional details", max_length(Complaint.additional_details), required=False),
    )
