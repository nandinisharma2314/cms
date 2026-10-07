"""Internal Staff Grievances / Whistleblower Service.

Provides confidential grievance filing against colleagues or superiors,
with strict anti-conflict isolation: accused persons and their subordinates
are blocked from viewing, investigating, or being notified of complaints
filed against them.
"""
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from config import ATTACHMENT_URL_TTL_SECONDS, UPLOAD_DIR
from models import (
    StaffGrievance,
    StaffGrievanceAttachment,
    StaffGrievanceEvent,
    User,
)
from services import attachment_service, settings_service
from services.access_service import AccessContext
from services.attachment_service import StoredFiles, _display_name, _extension, _matches_signature
from utils.security import sign_value


def generate_tracking_id(db: Session) -> str:
    """Returns a unique tracking ID: GRV-YYYY-XXXXX."""
    year = datetime.now(timezone.utc).year
    prefix = f"GRV-{year}-"
    # Find highest number for current year
    highest = (
        db.query(StaffGrievance.tracking_id)
        .filter(StaffGrievance.tracking_id.like(f"{prefix}%"))
        .order_by(StaffGrievance.id.desc())
        .first()
    )
    if highest and highest[0]:
        try:
            seq = int(highest[0].split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:05d}"


def is_in_reporting_line(db: Session, subordinate_id: int, potential_superior_id: int) -> bool:
    """Returns True if potential_superior_id is anywhere in subordinate_id's direct management chain."""
    current_id = subordinate_id
    visited = set()
    for _ in range(25):  # prevent cycle loops
        if current_id in visited or current_id is None:
            break
        visited.add(current_id)
        user = db.get(User, current_id)
        if not user or not user.reports_to_id:
            break
        if user.reports_to_id == potential_superior_id:
            return True
        current_id = user.reports_to_id
    return False


def check_grievance_access(db: Session, grievance: StaffGrievance, ctx: AccessContext) -> None:
    """Enforces strict anti-conflict isolation.

    1. An accused person can NEVER see a grievance naming them.
    2. Subordinates of the accused person cannot manage/investigate.
    3. Non-accused users with grievance.manage/view_all or the reporter/investigator can access.
    """
    user = ctx.user

    # Anti-conflict rule #1: If caller is accused, strictly block access
    if grievance.accused_user_id is not None and grievance.accused_user_id == user.id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Access denied: conflict of interest restriction in effect.",
        )

    # Super Admin has access (unless accused)
    if ctx.is_super_admin:
        return

    # Reporter always has access to their own grievance
    if grievance.reporter_id == user.id:
        return

    # Assigned investigator has access
    if grievance.assigned_investigator_id == user.id:
        return

    # User with grievance.view_all or grievance.manage can access
    if ctx.has("grievance.view_all") or ctx.has("grievance.manage"):
        # Anti-conflict rule #2: A subordinate of the accused person cannot access/investigate
        if grievance.accused_user_id is not None and is_in_reporting_line(db, user.id, grievance.accused_user_id):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Access denied: you report to a subject named in this grievance.",
            )
        return

    raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission to view this grievance.")


def attachment_url(attachment: StaffGrievanceAttachment) -> str:
    """Generate signed URL for grievance attachment download."""
    expires = settings_service.unix_now() + ATTACHMENT_URL_TTL_SECONDS
    sig = sign_value(f"grv:{attachment.id}:{expires}")
    return f"/grievances/attachments/{attachment.id}?expires={expires}&signature={sig}"


def serialize_attachment(att: StaffGrievanceAttachment) -> dict:
    return {
        "id": att.id,
        "file_name": att.file_name,
        "content_type": att.content_type,
        "file_size": att.file_size,
        "url": attachment_url(att),
        "created_at": att.created_at.isoformat(),
    }


def serialize_event(event: StaffGrievanceEvent, is_reporter_only: bool) -> dict | None:
    # Hide confidential investigator notes from reporter
    if is_reporter_only and event.is_confidential_note:
        return None
    return {
        "id": event.id,
        "event_type": event.event_type,
        "actor_name": event.actor_name or "System",
        "from_status": event.from_status,
        "to_status": event.to_status,
        "message": event.message,
        "is_confidential_note": event.is_confidential_note,
        "note": event.note,
        "created_at": event.created_at.isoformat(),
    }


def serialize_grievance(
    db: Session,
    grievance: StaffGrievance,
    ctx: AccessContext,
    include_events: bool = True,
) -> dict:
    user = ctx.user
    is_reporter_only = (grievance.reporter_id == user.id) and not (
        ctx.is_super_admin or ctx.has("grievance.manage") or (grievance.assigned_investigator_id == user.id)
    )

    # Anonymity handling
    if grievance.is_anonymous:
        if user.id == grievance.reporter_id or ctx.is_super_admin:
            reporter_data = {
                "id": grievance.reporter.id if grievance.reporter else None,
                "name": grievance.reporter.name if grievance.reporter else "Unknown Staff",
                "email": grievance.reporter.email if grievance.reporter else None,
                "is_anonymous": True,
            }
        else:
            reporter_data = {
                "id": None,
                "name": "Anonymous Staff Member",
                "email": None,
                "is_anonymous": True,
            }
    else:
        reporter_data = {
            "id": grievance.reporter.id if grievance.reporter else None,
            "name": grievance.reporter.name if grievance.reporter else "Unknown Staff",
            "email": grievance.reporter.email if grievance.reporter else None,
            "is_anonymous": False,
        }

    accused_data = None
    if grievance.accused_user:
        accused_data = {
            "id": grievance.accused_user.id,
            "name": grievance.accused_user.name,
            "role": grievance.accused_user.role.name if grievance.accused_user.role else None,
        }

    investigator_data = None
    if grievance.assigned_investigator:
        investigator_data = {
            "id": grievance.assigned_investigator.id,
            "name": grievance.assigned_investigator.name,
            "role": grievance.assigned_investigator.role.name if grievance.assigned_investigator.role else None,
        }

    events = []
    if include_events and grievance.events:
        for ev in grievance.events:
            ev_dict = serialize_event(ev, is_reporter_only)
            if ev_dict:
                events.append(ev_dict)

    return {
        "id": grievance.id,
        "tracking_id": grievance.tracking_id,
        "reporter": reporter_data,
        "is_anonymous": grievance.is_anonymous,
        "accused_user": accused_data,
        "target_type": grievance.target_type,
        "category": grievance.category,
        "severity": grievance.severity,
        "subject": grievance.subject,
        "description": grievance.description,
        "incident_date": grievance.incident_date.isoformat() if grievance.incident_date else None,
        "department": {"id": grievance.department.id, "name": grievance.department.name} if grievance.department else None,
        "location": {"id": grievance.location.id, "name": grievance.location.name} if grievance.location else None,
        "status": grievance.status,
        "assigned_investigator": investigator_data,
        "resolution_summary": grievance.resolution_summary,
        "resolution_action": grievance.resolution_action,
        "resolved_at": grievance.resolved_at.isoformat() if grievance.resolved_at else None,
        "created_at": grievance.created_at.isoformat(),
        "updated_at": grievance.updated_at.isoformat(),
        "attachments": [serialize_attachment(a) for a in grievance.attachments],
        "events": events,
    }


def save_grievance_attachments(
    db: Session,
    grievance: StaffGrievance,
    files: list[UploadFile],
    uploader: User,
    stored: StoredFiles,
) -> list[StaffGrievanceAttachment]:
    """Validates and stores uploads for staff grievance."""
    files = [f for f in files if f.filename]
    if not files:
        return []
    allowed = settings_service.allowed_attachment_types(db)
    max_count = settings_service.require(db, "max_attachments_per_complaint") or 10
    max_bytes = (settings_service.require(db, "max_attachment_mb") or 10) * 1024 * 1024

    existing = len(grievance.attachments)
    if existing + len(files) > max_count:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"A grievance can have at most {max_count} attachments; {max(0, max_count - existing)} more can be added",
        )

    for upload in files:
        ext = _extension(upload.filename)
        if ext not in allowed or ext not in settings_service.SUPPORTED_ATTACHMENT_TYPES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"{upload.filename}: file type not allowed (allowed: {', '.join(allowed)})",
            )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    rows = []
    for upload in files:
        ext = _extension(upload.filename)
        storage_name = f"grv_{uuid.uuid4().hex}.{ext}"
        path = UPLOAD_DIR / storage_name
        stored.paths.append(path)
        size = 0
        head = b""
        try:
            with open(path, "wb") as f:
                while chunk := upload.file.read(64 * 1024):
                    size += len(chunk)
                    if size > max_bytes:
                        raise HTTPException(
                            status.HTTP_400_BAD_REQUEST,
                            f"{upload.filename}: file exceeds the size limit",
                        )
                    if len(head) < 32:
                        head += chunk[: 32 - len(head)]
                    f.write(chunk)
        except Exception:
            path.unlink(missing_ok=True)
            raise

        if not _matches_signature(ext, head):
            path.unlink(missing_ok=True)
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"{upload.filename}: file content does not match its .{ext} extension",
            )

        content_type = attachment_service._CONTENT_TYPES.get(ext, "application/octet-stream")
        attachment = StaffGrievanceAttachment(
            grievance=grievance,
            storage_name=storage_name,
            content_type=content_type,
            file_name=_display_name(upload.filename, ext),
            file_size=size,
            uploaded_by_id=uploader.id,
        )
        db.add(attachment)
        rows.append(attachment)
    return rows
