import os
import shutil
import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import and_, not_, or_
from sqlalchemy.orm import Query, Session

from models import (
    Complaint, ComplaintAttachment, ComplaintCategory, ComplaintComment, Department, EndUser, Location, User,
)
from services import rejection_service, routing_service, sla_service
from services.access_service import AccessContext
from services.location_service import path_names, serialize_location
from services.statuses import AWAITING_RESPONSE, end_user_status_label
from services.workflow_service import (
    ACTION_PERMISSIONS, ACTIVE_STATUSES, CLOSED, GROUP_OF, REJECTED, STATUS_GROUPS, SUBMITTED,
    end_user_actions_for, record_event, reopen_deadline, staff_actions_for, status_label,
)
from utils.security import utcnow

PRIORITIES = ["Low", "Medium", "High", "Critical"]

UPLOAD_DIR = "uploads"
MAX_ATTACHMENTS = 5
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
# SVG/HTML are excluded: they are served from the API origin and can run scripts.
ALLOWED_ATTACHMENT_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".mp4", ".mov", ".csv", ".doc", ".docx",
}


def resolve_classification(
    db: Session, department_id: int, category_id: int | None, location_id: int
) -> tuple[Department, ComplaintCategory | None, Location]:
    department = db.get(Department, department_id)
    if department is None or not department.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Department not found")
    category = None
    if category_id is not None:
        category = db.get(ComplaintCategory, category_id)
        if category is None or category.department_id != department.id or not category.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Category does not belong to this department")
    location = db.get(Location, location_id)
    if location is None or not location.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Location not found")
    return department, category, location


def validate_priority(priority: str | None) -> str:
    priority = (priority or "Medium").strip().capitalize()
    if priority not in PRIORITIES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Priority must be one of: {', '.join(PRIORITIES)}")
    return priority


def register_complaint(
    db: Session,
    *,
    department: Department,
    category: ComplaintCategory | None,
    location: Location,
    priority: str,
    title: str,
    description: str,
    additional_details: str | None = None,
    end_user: EndUser | None = None,
    created_by: User | None = None,
    end_user_name: str | None = None,
    end_user_phone: str | None = None,
    at: datetime | None = None,
) -> Complaint:
    """Creates a complaint, records its submission and routes it to an officer.
    The caller commits."""
    now = at or utcnow()
    complaint = Complaint(
        generated_id=f"TMP-{uuid.uuid4().hex}",
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
    complaint.generated_id = f"CMP-{10000 + complaint.id}"

    submitter = end_user or created_by
    if end_user is not None:
        message = public = f"Complaint submitted by {end_user.name}"
    else:
        message = f"Registered by {created_by.name} on behalf of {end_user_name or 'an end user'}"
        public = "Complaint registered by a municipal officer"
    record_event(db, complaint, "submitted", submitter, message, public_message=public, to_status=SUBMITTED, at=now)
    record_event(
        db, complaint, "routed", None,
        f"Routed to the {department.name} department for {location.name}",
        public_message=f"Forwarded to the {department.name} department",
        at=now,
    )
    sla_service.start_clocks(db, complaint, now)
    routing_service.auto_route(db, complaint, at=now)
    return complaint


def save_attachments(
    db: Session,
    complaint: Complaint,
    files: list[UploadFile],
    uploader: User | EndUser,
    comment: ComplaintComment | None = None,
) -> list[dict]:
    files = [f for f in files if f.filename]
    if len(files) > MAX_ATTACHMENTS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"At most {MAX_ATTACHMENTS} attachments are allowed")
    for upload in files:
        ext = os.path.splitext(upload.filename)[1].lower()
        if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"File type {ext or '(none)'} is not allowed")
        if upload.size is not None and upload.size > MAX_ATTACHMENT_BYTES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{upload.filename} is larger than 10 MB")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    saved = []
    for upload in files:
        ext = os.path.splitext(upload.filename)[1].lower()
        unique_filename = f"{uuid.uuid4()}{ext}"
        with open(os.path.join(UPLOAD_DIR, unique_filename), "wb") as buffer:
            shutil.copyfileobj(upload.file, buffer)
        public_path = f"/uploads/{unique_filename}"
        db.add(ComplaintAttachment(
            complaint=complaint,
            comment=comment,
            file_path=public_path,
            file_type=upload.content_type,
            file_name=upload.filename[:200],
            uploaded_by_type="staff" if isinstance(uploader, User) else "end_user",
            uploaded_by_id=uploader.id,
        ))
        saved.append({"file_path": public_path, "file_name": upload.filename})
    return saved


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _attachment(a: ComplaintAttachment) -> dict:
    return {
        "id": a.id,
        "file_path": a.file_path,
        "file_name": a.file_name,
        "file_type": a.file_type or "",
        "comment_id": a.comment_id,
        "uploaded_by_type": a.uploaded_by_type,
        "created_at": _iso(a.created_at),
    }


def serialize_complaints(db: Session, complaints: list[Complaint], for_end_user: bool = False) -> list[dict]:
    names = path_names(db, [c.location for c in complaints])
    now = utcnow()
    result = []
    for num, c in enumerate(complaints, start=1):
        attachments = [
            a for a in c.attachments
            if not (for_end_user and a.comment is not None and a.comment.is_internal)
        ]
        item = {
            "num": num,
            "id": c.generated_id,
            "generated_id": c.generated_id,
            "title": c.title,
            "description": c.description,
            "additional_details": c.additional_details,
            "department": c.department.name,
            "department_id": c.department_id,
            "category": c.category.name if c.category else None,
            "category_id": c.category_id,
            "priority": c.priority,
            "location": c.location.name,
            "location_detail": serialize_location(c.location, names),
            "end_user_name": c.end_user_name,
            "end_user_phone": c.end_user_phone,
            "status": c.status,
            "status_label": end_user_status_label(c.status) if for_end_user else status_label(c.status),
            "status_group": GROUP_OF.get(c.status, "open"),
            "date": c.created_at.strftime("%d %b %Y"),
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
            "attachments": [_attachment(a) for a in attachments],
            # targets the end user can see; breach details stay internal
            "response_due_at": _iso(c.response_due_at) if c.status in AWAITING_RESPONSE else None,
            "resolution_due_at": _iso(c.resolution_due_at) if c.status in ACTIVE_STATUSES else None,
            "is_escalated": c.escalated_to_id is not None,
        }
        if not for_end_user:
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
        # End users see the department rather than the individual officer.
        "author_name": f"{department_name} Department" if (staff and for_end_user) else comment.author_name,
        "body": comment.body,
        "is_internal": comment.is_internal,
        "created_at": comment.created_at.isoformat(),
        "attachments": [_attachment(a) for a in comment.attachments],
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
            "actor_name": e.actor_name or "System",
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
            "assigned_by": a.assigned_by.name if a.assigned_by else "Routing engine",
            "assigned_at": a.assigned_at.isoformat(),
            "ended_at": _iso(a.ended_at),
        }
        for a in complaint.assignments
    ]
    data["escalations"] = [
        {
            "type": e.breach_type,
            "level": e.level,
            "from": e.from_user.name if e.from_user else "Department queue",
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
        "categories": rejection_service.REASON_CATEGORIES,
        "requests": [rejection_service.serialize(r, ctx) for r in complaint.rejection_requests],
    }
    open_for_assignment = complaint.status not in (CLOSED, REJECTED)
    data["can_assign"] = open_for_assignment and ctx.has(
        "complaint.reassign" if complaint.assigned_to_id else "complaint.assign"
    )
    data["can_comment"] = ctx.has("complaint.respond") and open_for_assignment
    return data


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
            actor = "You" if e.actor_id == end_user.id else "End User"
        elif e.actor_type == "staff":
            actor = f"{department} Department"
        else:
            actor = "System"
        timeline.append({
            "id": e.id,
            "type": e.event_type,
            "message": e.public_message,
            # routing/assignment notes are internal; status notes are addressed to the end user
            "note": e.note if e.event_type in ("status_changed", "feedback") else None,
            "from_status": e.from_status,
            "to_status": e.to_status,
            "actor_name": actor,
            "created_at": e.created_at.isoformat(),
        })
    data["timeline"] = timeline
    data["comments"] = [_comment(c, True, department) for c in complaint.comments if not c.is_internal]
    data["actions"] = [a for a in end_user_actions_for(complaint) if ACTION_PERMISSIONS[a] in permissions]
    deadline = reopen_deadline(complaint)
    data["reopen_until"] = _iso(deadline) if "reopen" in data["actions"] else None
    return data


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

def _trend(current: int, previous: int) -> tuple[str | None, str]:
    """Percentage change vs the previous 30 days; None when there is no baseline."""
    if previous == 0:
        return None, "positive"
    change = round((current - previous) / previous * 100)
    return f"{abs(change)}%", "positive" if change >= 0 else "negative"


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
    return {group: scoped.filter(Complaint.status.in_(statuses)).count() for group, statuses in STATUS_GROUPS.items()}


def dashboard_stats(scoped: Query) -> dict:
    """Counts and trends over an already-scoped Complaint query."""
    total = scoped.count()
    counts = group_counts(scoped)
    by_status: dict[str, int] = {}
    for (value,) in scoped.with_entities(Complaint.status).all():
        by_status[value] = by_status.get(value, 0) + 1

    now = utcnow()
    last_30 = now - timedelta(days=30)
    prev_30 = now - timedelta(days=60)

    def created_between(start: datetime, end: datetime | None = None, statuses: list[str] | None = None) -> int:
        q = scoped.filter(Complaint.created_at >= start)
        if end is not None:
            q = q.filter(Complaint.created_at < end)
        if statuses is not None:
            q = q.filter(Complaint.status.in_(statuses))
        return q.count()

    total_trend, total_type = _trend(created_between(last_30), created_between(prev_30, last_30))
    trends = {
        group: _trend(
            created_between(last_30, statuses=statuses),
            created_between(prev_30, last_30, statuses=statuses),
        )
        for group, statuses in STATUS_GROUPS.items()
    }

    by_department: dict[str, int] = {}
    for (name,) in scoped.with_entities(Department.name).join(Department, Complaint.department_id == Department.id).all():
        by_department[name] = by_department.get(name, 0) + 1

    today = now.date()
    trend = []
    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        start = datetime.combine(day, datetime.min.time())
        end = start + timedelta(days=1)
        trend.append({
            "date": day.strftime("%d %b"),
            "received": scoped.filter(Complaint.created_at >= start, Complaint.created_at < end).count(),
            "resolved": scoped.filter(Complaint.resolved_at >= start, Complaint.resolved_at < end).count(),
        })

    denominator = total or 1

    def bad_when_up(group: str) -> str:
        # more open / in-progress complaints is bad news
        return "negative" if trends[group][1] == "positive" else "positive"

    return {
        "metrics": {
            "total": total,
            "total_trend": total_trend,
            "total_trend_type": total_type,
            "open": counts["open"],
            "open_trend": trends["open"][0],
            "open_trend_type": bad_when_up("open"),
            "in_progress": counts["in_progress"],
            "in_progress_trend": trends["in_progress"][0],
            "in_progress_trend_type": bad_when_up("in_progress"),
            "resolved": counts["resolved"],
            "resolved_trend": trends["resolved"][0],
            "resolved_trend_type": trends["resolved"][1],
            "rejected": counts["rejected"],
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
        "departments": [
            {"name": name, "count": count}
            for name, count in sorted(by_department.items(), key=lambda item: -item[1])
        ],
        "trend": trend,
    }
