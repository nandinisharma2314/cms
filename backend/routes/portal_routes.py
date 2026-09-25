"""End-user (citizen) portal. Citizens are imported by CSV; they sign in with
mobile + email + OTP and only ever see their own complaints."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import EXPOSE_DEV_OTP, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_MINUTES
from database import get_db
from models import Complaint, ComplaintEvent, Department, EndUser, Notification
from services import audit_service, notification_service, otp_service, routing_service, workflow_service
from services.complaint_service import (
    citizen_detail, group_counts, register_complaint, resolve_classification, save_attachments,
    serialize_complaints, validate_priority,
)
from services.location_service import build_tree, path_names, serialize_location
from services.token_service import issue_token_pair
from utils.auth_middleware import get_current_end_user
from utils.security import PRINCIPAL_END_USER, looks_like_email, normalize_email, normalize_mobile

router = APIRouter()


class RequestOtp(BaseModel):
    mobile: str
    email: str
    channel: str = "sms"


class VerifyOtp(BaseModel):
    challenge_id: str
    otp: str


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    mobile: str | None = None
    dob: str | None = None
    gender: str | None = None
    address: str | None = None
    language: str | None = None
    notify_sms: bool | None = None
    notify_email: bool | None = None
    notify_alerts: bool | None = None


class ConfirmRequest(BaseModel):
    rating: int | None = None
    comment: str | None = None


class ReopenRequest(BaseModel):
    reason: str


class FeedbackRequest(BaseModel):
    rating: int
    comment: str | None = None


def _profile(db: Session, end_user: EndUser) -> dict:
    return {
        "id": end_user.id,
        "external_id": end_user.external_id,
        "name": end_user.name,
        "mobile": end_user.mobile,
        "email": end_user.email,
        "location": serialize_location(end_user.location, path_names(db, [end_user.location])),
        "dob": end_user.dob or "",
        "gender": end_user.gender or "",
        "address": end_user.address or "",
        "language": end_user.language,
        "notify_sms": end_user.notify_sms,
        "notify_email": end_user.notify_email,
        "notify_alerts": end_user.notify_alerts,
    }


@router.post("/auth/request-otp")
def request_otp(payload: RequestOtp, db: Session = Depends(get_db)):
    if payload.channel not in otp_service.CHANNELS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Channel must be 'sms' or 'email'")
    mobile = normalize_mobile(payload.mobile)
    email = normalize_email(payload.email)
    if not mobile or not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mobile number and email are both required")

    end_user = db.query(EndUser).filter(EndUser.mobile == mobile, EndUser.email == email).first()
    if end_user is None or not end_user.is_active:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "No registered citizen matches this mobile number and email. "
            "Please contact your municipal office to be registered.",
        )

    challenge, code = otp_service.issue_challenge(db, end_user, payload.channel)
    otp_service.deliver(end_user, payload.channel, code)
    response = {
        "success": True,
        "challenge_id": challenge.challenge_id,
        "channel": payload.channel,
        "sent_to": otp_service.mask_target(end_user, payload.channel),
        "expires_in_seconds": OTP_TTL_MINUTES * 60,
        "resend_after_seconds": OTP_RESEND_COOLDOWN_SECONDS,
    }
    if EXPOSE_DEV_OTP:
        response["dev_otp"] = code
    return response


@router.post("/auth/verify-otp")
def verify_otp(payload: VerifyOtp, request: Request, db: Session = Depends(get_db)):
    end_user = otp_service.verify_challenge(db, payload.challenge_id, payload.otp)
    if not end_user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated")
    audit_service.record(
        db, actor=end_user, action="auth.login", entity_type="end_user", entity_id=end_user.id,
        summary=f"Citizen {end_user.name} signed in", request=request,
    )
    tokens = issue_token_pair(db, PRINCIPAL_END_USER, end_user.id)
    return {"success": True, **tokens, "user": _profile(db, end_user)}


@router.get("/me")
def me(end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    return _profile(db, end_user)


@router.put("/profile")
def update_profile(
    payload: UpdateProfileRequest, request: Request,
    end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db),
):
    """Citizens keep their own details up to date. Mobile + email are also the
    login identity, so they stay valid and unique as a pair."""
    before = _profile(db, end_user)
    if payload.name is not None:
        name = " ".join(payload.name.split())
        if not name or len(name) > 150:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name is required (max 150 characters)")
        end_user.name = name
    if payload.mobile is not None:
        mobile = normalize_mobile(payload.mobile)
        if not mobile or len(mobile) != 10:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mobile must be a 10-digit number")
        end_user.mobile = mobile
    if payload.email is not None:
        email = normalize_email(payload.email)
        if not email or not looks_like_email(email):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email is not valid")
        end_user.email = email
    clash = db.query(EndUser).filter(
        EndUser.mobile == end_user.mobile, EndUser.email == end_user.email, EndUser.id != end_user.id,
    ).first()
    if clash is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Another account already uses this mobile number and email")
    for field, limit in (("dob", 20), ("gender", 20), ("address", 500)):
        value = getattr(payload, field)
        if value is not None:
            setattr(end_user, field, value.strip()[:limit] or None)
    if payload.language is not None and payload.language.strip():
        end_user.language = payload.language.strip()[:50]
    for field in ("notify_sms", "notify_email", "notify_alerts"):
        value = getattr(payload, field)
        if value is not None:
            setattr(end_user, field, value)

    after = _profile(db, end_user)
    changes = audit_service.diff(before, after)
    if changes:
        audit_service.record(
            db, actor=end_user, action="end_user.profile_update", entity_type="end_user", entity_id=end_user.id,
            summary=f"Citizen {end_user.name} updated their profile: {', '.join(changes)}",
            changes=changes, request=request,
        )
    db.commit()
    return {"success": True, "message": "Profile updated successfully", "user": _profile(db, end_user)}


# Timeline entries -> the activity kinds the portal's feed shows
ACTIVITY_TYPES = {"submitted": "forwarded", "routed": "forwarded", "assigned": "assigned", "escalated": "in_progress"}


@router.get("/activities")
def my_activities(limit: int = 30, end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    """Recent public updates across the citizen's complaints."""
    events = (
        db.query(ComplaintEvent)
        .join(Complaint, ComplaintEvent.complaint_id == Complaint.id)
        .filter(Complaint.end_user_id == end_user.id, ComplaintEvent.public_message.isnot(None))
        .order_by(ComplaintEvent.created_at.desc(), ComplaintEvent.id.desc())
        .limit(min(max(limit, 1), 100))
        .all()
    )
    activities = []
    for event in events:
        if event.event_type == "status_changed":
            kind = "resolved" if event.to_status in (workflow_service.RESOLVED, workflow_service.CLOSED) else "in_progress"
        else:
            kind = ACTIVITY_TYPES.get(event.event_type, "in_progress")
        activities.append({
            "id": event.id,
            "title": event.complaint.title,
            "desc": f"{event.complaint.generated_id}: {event.public_message}",
            "type": kind,
            "complaint_id": event.complaint.generated_id,
            "created_at": event.created_at.isoformat(),
        })
    return {"success": True, "activities": activities}


@router.get("/departments")
def departments(_: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    return [
        {
            "id": d.id,
            "name": d.name,
            "code": d.code,
            "categories": [{"id": c.id, "name": c.name} for c in d.categories if c.is_active],
        }
        for d in db.query(Department).filter(Department.is_active.is_(True)).order_by(Department.name).all()
    ]


@router.get("/locations/tree")
def locations_tree(_: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    return build_tree(db)


def _own(db: Session, end_user: EndUser):
    return db.query(Complaint).filter(Complaint.end_user_id == end_user.id)


def _get_own(db: Session, end_user: EndUser, complaint_id: str) -> Complaint:
    complaint = _own(db, end_user).filter(Complaint.generated_id == complaint_id).first()
    if complaint is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Complaint not found")
    return complaint


@router.get("/complaints")
def my_complaints(end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    complaints = _own(db, end_user).order_by(Complaint.created_at.desc()).all()
    return serialize_complaints(db, complaints, for_citizen=True)


@router.get("/complaints/stats")
def my_complaint_stats(end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    own = _own(db, end_user)
    counts = group_counts(own)
    return {"total": own.count(), **counts}


@router.get("/complaints/{complaint_id}")
def my_complaint(complaint_id: str, end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    return citizen_detail(db, end_user, _get_own(db, end_user, complaint_id))


@router.post("/complaints", status_code=201)
def create_complaint(
    request: Request,
    department_id: int = Form(...),
    category_id: int | None = Form(None),
    priority: str = Form("Medium"),
    title: str = Form(...),
    description: str = Form(...),
    location_id: int | None = Form(None),
    additional_details: str | None = Form(None),
    files: list[UploadFile] = File(default=[]),
    end_user: EndUser = Depends(get_current_end_user),
    db: Session = Depends(get_db),
):
    title = title.strip()
    description = description.strip()
    if not title or len(title) > 200:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Title is required (max 200 characters)")
    if not description:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Description is required")
    location_id = location_id or end_user.location_id
    if location_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please choose the location of the issue")
    department, category, location = resolve_classification(db, department_id, category_id, location_id)

    complaint = register_complaint(
        db,
        department=department,
        category=category,
        location=location,
        priority=validate_priority(priority),
        title=title,
        description=description,
        additional_details=(additional_details or "").strip()[:500] or None,
        end_user=end_user,
    )
    saved = save_attachments(db, complaint, files, end_user)
    audit_service.record(
        db, actor=end_user, action="complaint.create", entity_type="complaint", entity_id=complaint.generated_id,
        summary=f"Citizen {end_user.name} registered {complaint.generated_id} ({department.name}, {location.name})",
        request=request,
    )
    db.commit()
    return {
        "success": True,
        "complaint_id": complaint.generated_id,
        "message": "Complaint registered successfully",
        "attachments": saved,
    }


@router.post("/complaints/{complaint_id}/comments", status_code=201)
def comment_on_complaint(
    complaint_id: str,
    body: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    end_user: EndUser = Depends(get_current_end_user),
    db: Session = Depends(get_db),
):
    complaint = _get_own(db, end_user, complaint_id)
    if "comment" not in workflow_service.citizen_actions_for(complaint):
        raise HTTPException(status.HTTP_409_CONFLICT, "This complaint is closed. Reopen it to add a comment.")
    comment = workflow_service.add_comment(db, complaint, end_user, body)
    save_attachments(db, complaint, files, end_user, comment=comment)
    db.commit()
    return citizen_detail(db, end_user, complaint)


@router.post("/complaints/{complaint_id}/confirm")
def confirm_resolution(
    complaint_id: str, payload: ConfirmRequest, request: Request,
    end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db),
):
    complaint = _get_own(db, end_user, complaint_id)
    workflow_service.citizen_confirm(db, end_user, complaint, payload.rating, payload.comment)
    audit_service.record(
        db, actor=end_user, action="complaint.confirm", entity_type="complaint", entity_id=complaint.generated_id,
        summary=f"Citizen {end_user.name} confirmed the resolution of {complaint.generated_id}", request=request,
    )
    db.commit()
    return citizen_detail(db, end_user, complaint)


@router.post("/complaints/{complaint_id}/reopen")
def reopen_complaint(
    complaint_id: str, payload: ReopenRequest, request: Request,
    end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db),
):
    complaint = _get_own(db, end_user, complaint_id)
    workflow_service.citizen_reopen(db, end_user, complaint, payload.reason)
    audit_service.record(
        db, actor=end_user, action="complaint.reopen", entity_type="complaint", entity_id=complaint.generated_id,
        summary=f"Citizen {end_user.name} reopened {complaint.generated_id}", request=request,
    )
    # The original officer keeps it, unless they have since left or gone unavailable.
    handler = complaint.assigned_to
    if handler is None or not handler.is_active or not handler.is_available:
        routing_service.auto_route(db, complaint)
    db.commit()
    return citizen_detail(db, end_user, complaint)


@router.post("/complaints/{complaint_id}/feedback")
def give_feedback(
    complaint_id: str, payload: FeedbackRequest, request: Request,
    end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db),
):
    complaint = _get_own(db, end_user, complaint_id)
    workflow_service.citizen_feedback(db, end_user, complaint, payload.rating, payload.comment)
    audit_service.record(
        db, actor=end_user, action="complaint.feedback", entity_type="complaint", entity_id=complaint.generated_id,
        summary=f"Citizen {end_user.name} rated {complaint.generated_id}", request=request,
    )
    db.commit()
    return citizen_detail(db, end_user, complaint)


@router.get("/notifications")
def my_notifications(
    unread_only: bool = False, limit: int = 30,
    end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db),
):
    return notification_service.list_for(db, "end_user", end_user.id, unread_only, limit)


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int, end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db),
):
    notification_service.mark_read(db, "end_user", end_user.id, notification_id)
    return {"success": True}


@router.delete("/notifications")
def clear_notifications(end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(
        Notification.recipient_type == "end_user", Notification.recipient_id == end_user.id,
    ).delete(synchronize_session=False)
    db.commit()
    return {"success": True}


@router.post("/notifications/read-all")
def mark_all_notifications_read(end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    notification_service.mark_read(db, "end_user", end_user.id)
    return {"success": True}
