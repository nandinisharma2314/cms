"""API routes for internal staff grievances and whistleblower protection."""
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from config import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, UPLOAD_DIR
from models import (
    GRIEVANCE_CATEGORIES,
    GRIEVANCE_SEVERITIES,
    GRIEVANCE_STATUSES,
    GRIEVANCE_STATUS_ACTION_TAKEN,
    GRIEVANCE_STATUS_DISMISSED,
    GRIEVANCE_STATUS_RESOLVED,
    GRIEVANCE_STATUS_SUBMITTED,
    GRIEVANCE_STATUS_UNDER_REVIEW,
    GRIEVANCE_TARGET_TYPES,
    Department,
    Location,
    StaffGrievance,
    StaffGrievanceAttachment,
    StaffGrievanceEvent,
    User,
    max_length,
)
from services import audit_service, settings_service
from services.access_service import AccessContext
from services.attachment_service import StoredFiles
from services.grievance_service import (
    check_grievance_access,
    generate_tracking_id,
    is_in_reporting_line,
    save_grievance_attachments,
    serialize_grievance,
)
from utils.auth_middleware import get_access_context, require_permission
from utils.security import signature_valid, utcnow
from utils.text import multi_line, single_line

router = APIRouter()


class AssignInvestigatorRequest(BaseModel):
    investigator_id: int
    note: str | None = None


class UpdateStatusRequest(BaseModel):
    status: str
    message: str
    is_confidential_note: bool = False
    resolution_action: str | None = None
    resolution_summary: str | None = None


class AddNoteRequest(BaseModel):
    note: str
    is_confidential: bool = True


def _get_grievance(db: Session, identifier: str | int) -> StaffGrievance:
    if isinstance(identifier, int) or (isinstance(identifier, str) and identifier.isdigit()):
        grievance = db.get(StaffGrievance, int(identifier))
    else:
        grievance = db.query(StaffGrievance).filter(StaffGrievance.tracking_id == identifier).first()
    if grievance is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grievance not found")
    return grievance


@router.get("/options")
def get_options(ctx: AccessContext = Depends(require_permission("grievance.file"))):
    """Returns valid taxonomy options and assignable colleagues."""
    db = ctx.db
    # List active staff members that can be named or assigned
    users = (
        db.query(User.id, User.name, User.role_id)
        .filter(User.is_active.is_(True))
        .order_by(User.name)
        .all()
    )
    colleagues = [{"id": u.id, "name": u.name} for u in users if u.id != ctx.user.id]

    # Investigators must have grievance.manage
    investigators = []
    for u in db.query(User).filter(User.is_active.is_(True)).all():
        u_ctx = AccessContext(db, u)
        if u_ctx.has("grievance.manage"):
            investigators.append({"id": u.id, "name": u.name, "role": u.role.name})

    departments = [{"id": d.id, "name": d.name} for d in db.query(Department).filter(Department.is_active.is_(True)).all()]
    locations = [{"id": loc.id, "name": loc.name} for loc in db.query(Location).filter(Location.is_active.is_(True)).all()]

    return {
        "target_types": list(GRIEVANCE_TARGET_TYPES),
        "categories": list(GRIEVANCE_CATEGORIES),
        "severities": list(GRIEVANCE_SEVERITIES),
        "statuses": list(GRIEVANCE_STATUSES),
        "colleagues": colleagues,
        "investigators": investigators,
        "departments": departments,
        "locations": locations,
    }


@router.get("")
def list_grievances(
    view: str = "my_filed",  # "my_filed" | "investigations" | "all"
    status_filter: str | None = None,
    severity: str | None = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    ctx: AccessContext = Depends(get_access_context),
):
    """Lists grievances accessible to the caller with strict anti-conflict exclusion."""
    db = ctx.db
    user = ctx.user
    page, page_size = max(page, 1), min(max(page_size, 1), MAX_PAGE_SIZE)

    query = db.query(StaffGrievance).options(
        selectinload(StaffGrievance.attachments),
        selectinload(StaffGrievance.events),
    )

    # ANTI-CONFLICT RULE: The accused user can NEVER see records where they are named!
    query = query.filter(
        or_(StaffGrievance.accused_user_id.is_(None), StaffGrievance.accused_user_id != user.id)
    )

    if view == "my_filed":
        ctx.require("grievance.view_own")
        query = query.filter(StaffGrievance.reporter_id == user.id)
    elif view == "investigations":
        ctx.require("grievance.manage")
        query = query.filter(StaffGrievance.assigned_investigator_id == user.id)
    elif view == "all":
        if not (ctx.has("grievance.view_all") or ctx.has("grievance.manage") or ctx.is_super_admin):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing permission: grievance.view_all")
        # Subordinates cannot see grievances against their superior
        # Filter handled after loading or in memory
    else:
        query = query.filter(StaffGrievance.reporter_id == user.id)

    if status_filter:
        query = query.filter(StaffGrievance.status == status_filter)
    if severity:
        query = query.filter(StaffGrievance.severity == severity)

    all_items = query.order_by(StaffGrievance.created_at.desc()).all()

    # Filter out any where caller is a subordinate of the accused person
    accessible = []
    for g in all_items:
        try:
            check_grievance_access(db, g, ctx)
            accessible.append(g)
        except HTTPException:
            continue

    total = len(accessible)
    paged = accessible[(page - 1) * page_size : page * page_size]

    return {
        "items": [serialize_grievance(db, g, ctx, include_events=False) for g in paged],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def file_grievance(
    request: Request,
    subject: Annotated[str, Form()],
    description: Annotated[str, Form()],
    target_type: Annotated[str, Form()],
    category: Annotated[str, Form()],
    severity: Annotated[str, Form()] = "medium",
    is_anonymous: Annotated[bool, Form()] = False,
    accused_user_id: Annotated[int | None, Form()] = None,
    incident_date: Annotated[str | None, Form()] = None,
    department_id: Annotated[int | None, Form()] = None,
    location_id: Annotated[int | None, Form()] = None,
    files: list[UploadFile] = File([]),
    ctx: AccessContext = Depends(require_permission("grievance.file")),
):
    """File a confidential staff grievance."""
    db = ctx.db
    reporter = ctx.user

    clean_subject = single_line(subject, "Subject", max_length(StaffGrievance.subject))
    clean_description = multi_line(description, "Description", 5000)
    if category not in GRIEVANCE_CATEGORIES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid category: {category}")
    if target_type not in GRIEVANCE_TARGET_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid target type: {target_type}")
    if severity not in GRIEVANCE_SEVERITIES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid severity: {severity}")

    accused_user = None
    if accused_user_id is not None:
        if accused_user_id == reporter.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot file a grievance against yourself.")
        accused_user = db.get(User, accused_user_id)
        if accused_user is None or not accused_user.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected accused staff member was not found.")

    parsed_date = None
    if incident_date:
        try:
            parsed_date = date.fromisoformat(incident_date)
        except ValueError as err:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid incident date format (YYYY-MM-DD)") from err
        if parsed_date > utcnow().date():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incident date cannot be in the future")

    if department_id is not None and db.get(Department, department_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Department not found")
    if location_id is not None and db.get(Location, location_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Location not found")

    tracking_id = generate_tracking_id(db)

    grievance = StaffGrievance(
        tracking_id=tracking_id,
        reporter_id=reporter.id,
        is_anonymous=is_anonymous,
        accused_user_id=accused_user.id if accused_user else None,
        target_type=target_type,
        category=category,
        severity=severity,
        subject=clean_subject,
        description=clean_description,
        incident_date=parsed_date,
        department_id=department_id,
        location_id=location_id,
        status=GRIEVANCE_STATUS_SUBMITTED,
    )
    db.add(grievance)
    db.flush()

    # Create initial timeline event
    initial_event = StaffGrievanceEvent(
        grievance_id=grievance.id,
        event_type="created",
        actor_id=reporter.id,
        actor_name="Anonymous" if is_anonymous else reporter.name,
        from_status=None,
        to_status=GRIEVANCE_STATUS_SUBMITTED,
        message="Grievance lodged in the whistleblower system.",
        is_confidential_note=False,
    )
    db.add(initial_event)

    # Save evidence attachments
    stored = StoredFiles()
    try:
        if files:
            save_grievance_attachments(db, grievance, files, reporter, stored)
        db.commit()
    except Exception:
        stored.discard()
        db.rollback()
        raise

    audit_service.record(
        db,
        actor=reporter if not is_anonymous else None,
        action="grievance.file",
        entity_type="staff_grievance",
        entity_id=str(grievance.id),
        summary=f"Filed staff grievance {tracking_id} ({category})",
        request=request,
    )
    db.commit()

    return serialize_grievance(db, grievance, ctx)


@router.get("/{identifier}")
def get_grievance(identifier: str, ctx: AccessContext = Depends(get_access_context)):
    """Fetch grievance details with strict anti-conflict verification."""
    db = ctx.db
    grievance = _get_grievance(db, identifier)
    check_grievance_access(db, grievance, ctx)
    return serialize_grievance(db, grievance, ctx, include_events=True)


@router.post("/{identifier}/assign")
def assign_investigator(
    identifier: str,
    payload: AssignInvestigatorRequest,
    request: Request,
    ctx: AccessContext = Depends(require_permission("grievance.manage")),
):
    """Assign an investigator to the grievance."""
    db = ctx.db
    grievance = _get_grievance(db, identifier)
    check_grievance_access(db, grievance, ctx)

    investigator = db.get(User, payload.investigator_id)
    if not investigator or not investigator.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Investigator not found or inactive")

    # Anti-conflict checks for investigator
    if grievance.accused_user_id and investigator.id == grievance.accused_user_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Cannot assign the accused person as investigator.",
        )
    if grievance.accused_user_id and is_in_reporting_line(db, investigator.id, grievance.accused_user_id):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Cannot assign {investigator.name}: they report to the person accused in this grievance.",
        )

    inv_ctx = AccessContext(db, investigator)
    if not inv_ctx.has("grievance.manage"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Assigned user does not hold grievance.manage permission.")

    grievance.assigned_investigator = investigator
    if grievance.status == GRIEVANCE_STATUS_SUBMITTED:
        grievance.status = GRIEVANCE_STATUS_UNDER_REVIEW

    clean_assign_note = multi_line(payload.note, "Note", 2000, required=False) if payload.note else None

    event = StaffGrievanceEvent(
        grievance_id=grievance.id,
        event_type="assigned",
        actor_id=ctx.user.id,
        actor_name=ctx.user.name,
        from_status=GRIEVANCE_STATUS_SUBMITTED,
        to_status=grievance.status,
        message=f"Investigator {investigator.name} assigned.",
        note=clean_assign_note,
        is_confidential_note=False,
    )
    db.add(event)
    db.commit()

    audit_service.record(
        db,
        actor=ctx.user,
        action="grievance.assign",
        entity_type="staff_grievance",
        entity_id=str(grievance.id),
        summary=f"Assigned {investigator.name} to grievance {grievance.tracking_id}",
        request=request,
    )
    db.commit()

    return serialize_grievance(db, grievance, ctx)


@router.post("/{identifier}/status")
def update_status(
    identifier: str,
    payload: UpdateStatusRequest,
    request: Request,
    ctx: AccessContext = Depends(require_permission("grievance.manage")),
):
    """Transition grievance status and optionally record resolution."""
    db = ctx.db
    grievance = _get_grievance(db, identifier)
    check_grievance_access(db, grievance, ctx)

    if payload.status not in GRIEVANCE_STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid status: {payload.status}")

    clean_message = single_line(payload.message, "Status update message", max_length(StaffGrievanceEvent.message))
    clean_action = (
        single_line(payload.resolution_action, "Resolution action", max_length(StaffGrievance.resolution_action), required=False)
        if payload.resolution_action else None
    )
    clean_summary = (
        multi_line(payload.resolution_summary, "Resolution summary", 5000, required=False)
        if payload.resolution_summary else None
    )

    prev_status = grievance.status
    grievance.status = payload.status

    if payload.status in (GRIEVANCE_STATUS_RESOLVED, GRIEVANCE_STATUS_ACTION_TAKEN, GRIEVANCE_STATUS_DISMISSED):
        grievance.resolved_at = utcnow()
        if clean_action:
            grievance.resolution_action = clean_action
        if clean_summary:
            grievance.resolution_summary = clean_summary

    event = StaffGrievanceEvent(
        grievance_id=grievance.id,
        event_type="status_change",
        actor_id=ctx.user.id,
        actor_name=ctx.user.name,
        from_status=prev_status,
        to_status=payload.status,
        message=clean_message,
        is_confidential_note=payload.is_confidential_note,
    )
    db.add(event)
    db.commit()

    audit_service.record(
        db,
        actor=ctx.user,
        action="grievance.update_status",
        entity_type="staff_grievance",
        entity_id=str(grievance.id),
        summary=f"Grievance {grievance.tracking_id} status changed: {prev_status} -> {payload.status}",
        request=request,
    )
    db.commit()

    return serialize_grievance(db, grievance, ctx)


@router.post("/{identifier}/notes")
def add_note(
    identifier: str,
    payload: AddNoteRequest,
    request: Request,
    ctx: AccessContext = Depends(require_permission("grievance.manage")),
):
    """Add an investigation progress note to the timeline."""
    db = ctx.db
    grievance = _get_grievance(db, identifier)
    check_grievance_access(db, grievance, ctx)

    clean_note = multi_line(payload.note, "Note", 3000)

    event = StaffGrievanceEvent(
        grievance_id=grievance.id,
        event_type="note_added",
        actor_id=ctx.user.id,
        actor_name=ctx.user.name,
        from_status=grievance.status,
        to_status=grievance.status,
        message="Investigation note recorded.",
        note=clean_note,
        is_confidential_note=payload.is_confidential,
    )
    db.add(event)
    db.commit()

    return serialize_grievance(db, grievance, ctx)


@router.get("/attachments/{attachment_id}")
def download_attachment(
    attachment_id: int,
    expires: int,
    signature: str,
    ctx: AccessContext = Depends(get_access_context),
):
    """Download grievance attachment using signed URL with anti-conflict check."""
    if not signature_valid(f"grv:{attachment_id}:{expires}", signature):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid or expired download link.")
    if settings_service.unix_now() > expires:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Download link has expired.")

    att = ctx.db.get(StaffGrievanceAttachment, attachment_id)
    if att is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found.")

    check_grievance_access(ctx.db, att.grievance, ctx)

    from services import storage_service
    from fastapi.responses import RedirectResponse, Response

    if storage_service.is_r2_enabled():
        presigned = storage_service.get_presigned_url(att.storage_name, expires_in=max(60, expires - settings_service.unix_now()))
        if presigned:
            return RedirectResponse(presigned, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
        try:
            data, _ = storage_service.get_file(att.storage_name)
            return Response(
                content=data,
                media_type=att.content_type,
                headers={"Content-Disposition": f"attachment; filename=\"{att.file_name}\""},
            )
        except Exception:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found in storage.")

    path = UPLOAD_DIR / att.storage_name
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found on storage disk.")

    return FileResponse(
        path,
        media_type=att.content_type,
        filename=att.file_name,
        content_disposition_type="attachment",
    )
