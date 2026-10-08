"""End-user portal. End users are imported by CSV or added by staff; they sign
in with their mobile number or email + a one-time code and only ever see their
own complaints."""
import sys
from datetime import date, datetime

import jwt
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from config import (
    ACCOUNT_SELECTION_MINUTES, DEFAULT_PAGE_SIZE, EXPOSE_DEV_OTP, MAX_PAGE_SIZE, OTP_RESEND_COOLDOWN_SECONDS,
    OTP_TTL_MINUTES,
)
from database import get_db
from models import GENDERS, Complaint, ComplaintEvent, Department, EndUser, Notification, max_length
from services import (
    attachment_service, audit_service, messaging, notification_service, otp_service, routing_service, settings_service,
    token_service, workflow_service,
)
from services.complaint_service import (
    DETAIL_OPTIONS, LIST_OPTIONS, clean_complaint_text, end_user_detail, group_counts, register_complaint,
    resolve_classification, serialize_complaints,
)
from services.location_service import get_nodes, get_path, path_names, serialize_location
from services.statuses import CLOSED, RESOLVED, STATUS_GROUPS
from utils.auth_middleware import (
    client_ip, end_user_permissions, end_user_role, get_current_end_user, require_portal_permission,
)
from utils.cookies import set_refresh_cookie
from utils.search import text_match
from utils.security import (
    PRINCIPAL_END_USER, TOKEN_ACCOUNT_SELECTION, create_purpose_token, decode_purpose_token, utcnow,
)
from utils.text import multi_line, single_line

router = APIRouter()



class RequestOtp(BaseModel):
    channel: str  # "sms" | "email"
    identifier: str


class VerifyOtp(BaseModel):
    challenge_id: str
    otp: str


class SelectAccount(BaseModel):
    selection_token: str
    end_user_id: int


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    dob: date | None = None
    clear_dob: bool = False
    gender: str | None = None
    clear_gender: bool = False
    address: str | None = None
    notify_sms: bool | None = None
    notify_email: bool | None = None


class ContactChangeRequest(BaseModel):
    channel: str
    value: str


class ConfirmRequest(BaseModel):
    rating: int | None = None
    comment: str | None = None


class ReopenRequest(BaseModel):
    reason: str


class FeedbackRequest(BaseModel):
    rating: int
    comment: str | None = None


def _profile(db: Session, end_user: EndUser) -> dict:
    from models import Role, User, UserScope
    role = end_user_role(db)
    names = path_names(db, [end_user.location])

    agent_name = None
    if end_user.location_id:
        agent = (
            db.query(User)
            .join(Role, User.role_id == Role.id)
            .outerjoin(UserScope, User.id == UserScope.user_id)
            .filter(
                User.is_active == True,
                Role.key.in_(["agent", "supervisor", "manager"]),
                (User.primary_location_id == end_user.location_id) | (UserScope.location_id == end_user.location_id)
            )
            .first()
        )
        if agent:
            agent_name = f"{agent.name} ({agent.role.name})"

    return {
        "id": end_user.id,
        "external_id": end_user.external_id,
        "name": end_user.name,
        "avatar_url": end_user.avatar_url,
        "agent_name": agent_name,
        "mobile": end_user.mobile,
        "email": end_user.email,
        "location": serialize_location(end_user.location, names),
        "dob": end_user.dob.isoformat() if end_user.dob else None,
        "gender": end_user.gender,
        "address": end_user.address,
        "notify_sms": end_user.notify_sms,
        "notify_email": end_user.notify_email,
        "role": {"key": role.key, "name": role.name},
        "permissions": sorted(p.key for p in role.permissions),
    }


def _session(response: Response, db: Session, end_user: EndUser, request: Request) -> dict:
    end_user.last_login_at = utcnow()
    audit_service.record(
        db, actor=end_user, action="auth.login", entity_type="end_user", entity_id=end_user.id,
        summary=f"End user {end_user.name} signed in", request=request,
    )
    access, refresh = token_service.issue(db, end_user)
    set_refresh_cookie(response, PRINCIPAL_END_USER, refresh)
    return {"access_token": access, "token_type": "bearer", "user": _profile(db, end_user)}


def _challenge_response(db: Session, challenge, code: str | None) -> dict:
    response = {
        "challenge_id": challenge.challenge_id,
        "channel": challenge.channel,
        "sent_to": otp_service.mask_target(db, challenge.channel, challenge.target),
        "expires_in_seconds": OTP_TTL_MINUTES * 60,
        "resend_after_seconds": OTP_RESEND_COOLDOWN_SECONDS,
    }
    if EXPOSE_DEV_OTP and code is not None:
        response["dev_otp"] = code
    return response


# ---------------------------------------------------------------------------
# Sign-in
# ---------------------------------------------------------------------------

@router.post("/auth/request-otp")
def request_otp(payload: RequestOtp, request: Request, db: Session = Depends(get_db)):
    """Creates a sign-in challenge and sends the code. Unregistered users are directed to contact support."""
    try:
        challenge, code = otp_service.request_login_code(db, payload.channel, payload.identifier, client_ip(request))
        otp_service.send_login_code(db, challenge, code)
        return _challenge_response(db, challenge, code)
    except settings_service.SettingNotConfigured as exc:
        field_name = getattr(exc, "field", "unknown")
        label = getattr(exc, "label", field_name)
        print(
            f"\n{'='*25} [SYSTEM CONFIGURATION ERROR] {'='*25}\n"
            f"Missing required setting: '{field_name}' ({label})\n"
            f"Path: POST /portal/auth/request-otp\n"
            f"Detail: {exc.detail}\n"
            f"Action required: Configure this setting in System Settings or run `python manage.py check`.\n"
            f"{'='*78}\n",
            file=sys.stderr,
            flush=True,
        )
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The service is temporarily unavailable due to a configuration issue. Please contact support or try again later.",
        ) from exc
    except messaging.MessageError as exc:
        print(
            f"\n{'='*25} [MESSAGE DELIVERY ERROR] {'='*25}\n"
            f"Path: POST /portal/auth/request-otp\n"
            f"Detail: {exc}\n"
            f"Action required: Check SMS/Email provider configuration in backend/.env.\n"
            f"{'='*74}\n",
            file=sys.stderr,
            flush=True,
        )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Could not send the verification code right now. Please try again in a few minutes or contact support.",
        ) from exc


@router.post("/auth/verify-otp")
def verify_otp(payload: VerifyOtp, request: Request, response: Response, db: Session = Depends(get_db)):
    channel, target, end_users = otp_service.verify_login_code(db, payload.challenge_id, payload.otp,
                                                               client_ip(request))
    if len(end_users) == 1:
        return _session(response, db, end_users[0], request)
    # Several people share this phone/email: they choose who is signing in.
    names = path_names(db, [e.location for e in end_users])
    token = create_purpose_token(TOKEN_ACCOUNT_SELECTION, {"ids": [e.id for e in end_users]}, ACCOUNT_SELECTION_MINUTES)
    return {
        "selection_token": token,
        "accounts": [{"id": e.id, "name": e.name, "location": names[e.location_id][-1] if e.location_id else None}
                     for e in end_users],
    }


@router.post("/auth/select-account")
def select_account(payload: SelectAccount, request: Request, response: Response, db: Session = Depends(get_db)):
    try:
        claims = decode_purpose_token(payload.selection_token, TOKEN_ACCOUNT_SELECTION)
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The sign-in has expired; request a new code") from None
    if payload.end_user_id not in claims.get("ids", []):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose one of the listed accounts")
    end_user = db.get(EndUser, payload.end_user_id)
    if end_user is None or not end_user.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This account is no longer active")
    return _session(response, db, end_user, request)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

@router.get("/me")
def me(end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    return _profile(db, end_user)


@router.get("/hierarchy")
def get_hierarchy(end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    from models import Role, User, UserScope
    
    agent_id = None
    if end_user.location_id:
        agent = (
            db.query(User)
            .join(Role, User.role_id == Role.id)
            .outerjoin(UserScope, User.id == UserScope.user_id)
            .filter(
                User.is_active == True,
                Role.key.in_(["agent", "supervisor", "manager"]),
                (User.primary_location_id == end_user.location_id) | (UserScope.location_id == end_user.location_id)
            )
            .first()
        )
        if agent:
            agent_id = agent.id

    users = db.query(User).join(Role, User.role_id == Role.id).filter(User.is_active == True).all()
    
    all_nodes = {}
    for u in users:
        all_nodes[u.id] = {
            "id": str(u.id),
            "name": u.name,
            "role": u.role.name,
            "initials": "".join([n[0].upper() for n in u.name.split() if n])[:2] if u.name else "U",
            "avatar_url": u.avatar_url,
            "isMe": False,
            "children": [],
            "reports_to_id": u.reports_to_id
        }
        
    relevant_ids = set()
    curr_id = agent_id
    while curr_id and curr_id in all_nodes:
        relevant_ids.add(curr_id)
        curr_id = all_nodes[curr_id]["reports_to_id"]
        
    root_nodes = []
    for uid, node in all_nodes.items():
        if uid not in relevant_ids:
            continue
            
        parent_id = node["reports_to_id"]
        if parent_id in relevant_ids:
            all_nodes[parent_id]["children"].append(node)
        else:
            root_nodes.append(node)
            
    if agent_id and agent_id in all_nodes:
        all_nodes[agent_id]["children"].append({
            "id": f"end_user_{end_user.id}",
            "name": end_user.name,
            "role": "Me",
            "initials": "".join([n[0].upper() for n in end_user.name.split() if n])[:2] if end_user.name else "U",
            "avatar_url": end_user.avatar_url,
            "isMe": True,
            "children": []
        })
            
    for n in all_nodes.values():
        if "reports_to_id" in n:
            del n["reports_to_id"]
        
    return root_nodes[0] if root_nodes else {}


@router.put("/profile")
def update_profile(
    payload: UpdateProfileRequest, request: Request,
    end_user: EndUser = Depends(require_portal_permission("portal.profile.update")), db: Session = Depends(get_db),
):
    """Personal details and notification preferences. Mobile number and email
    are the sign-in identity; they change through /profile/contact (verified)."""
    before = _profile(db, end_user)
    if payload.name is not None:
        end_user.name = single_line(payload.name, "Name", max_length(EndUser.name))
    if payload.clear_dob:
        end_user.dob = None
    elif payload.dob is not None:
        if payload.dob > datetime.now(settings_service.timezone(db)).date():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Date of birth cannot be in the future")
        end_user.dob = payload.dob
    if payload.clear_gender:
        end_user.gender = None
    elif payload.gender is not None:
        if payload.gender not in GENDERS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Gender must be one of: {', '.join(GENDERS)}")
        end_user.gender = payload.gender
    if payload.address is not None:
        end_user.address = multi_line(payload.address, "Address", max_length(EndUser.address), required=False)
    if payload.notify_sms is not None:
        end_user.notify_sms = payload.notify_sms
    if payload.notify_email is not None:
        end_user.notify_email = payload.notify_email

    after = _profile(db, end_user)
    changes = audit_service.diff(before, after)
    if changes:
        audit_service.record(
            db, actor=end_user, action="end_user.profile_update", entity_type="end_user", entity_id=end_user.id,
            summary=f"End user {end_user.name} updated their profile: {', '.join(changes)}",
            changes=changes, request=request,
        )
    db.commit()
    return after


@router.post("/profile/contact/request")
def request_contact_change(
    payload: ContactChangeRequest, request: Request,
    end_user: EndUser = Depends(require_portal_permission("portal.profile.update")), db: Session = Depends(get_db),
):
    """Sends a code to the new mobile number / email; the change applies once it is confirmed."""
    challenge, code = otp_service.request_contact_change(db, end_user, payload.channel, payload.value,
                                                         client_ip(request))
    return _challenge_response(db, challenge, code)


@router.post("/profile/contact/verify")
def verify_contact_change(
    payload: VerifyOtp, request: Request, response: Response,
    end_user: EndUser = Depends(require_portal_permission("portal.profile.update")), db: Session = Depends(get_db),
):
    """Applies the verified contact and signs out every other session."""
    channel, old, new = otp_service.verify_contact_change(db, end_user, payload.challenge_id, payload.otp,
                                                          client_ip(request))
    label = "mobile" if channel == "sms" else "email"
    token_service.end_all_sessions(db, end_user)
    audit_service.record(
        db, actor=end_user, action="end_user.contact_change", entity_type="end_user", entity_id=end_user.id,
        summary=f"End user {end_user.name} changed their {label}", changes={label: [old, new]}, request=request,
    )
    db.commit()
    access, refresh = token_service.issue(db, end_user)
    set_refresh_cookie(response, PRINCIPAL_END_USER, refresh)
    return {"access_token": access, "token_type": "bearer", "user": _profile(db, end_user)}


# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

@router.get("/departments")
def departments(_: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    """Active departments that have at least one active category (complaints need one)."""
    result = []
    for d in db.query(Department).filter(Department.is_active.is_(True)).order_by(Department.name).all():
        categories = [{"id": c.id, "name": c.name, "priority": c.default_priority.name}
                      for c in d.categories if c.is_active and c.default_priority.is_active]
        if categories:
            result.append({"id": d.id, "name": d.name, "code": d.code, "categories": categories})
    return result


@router.get("/locations/nodes")
def locations_nodes(parent_id: int | None = None, _: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    return get_nodes(db, parent_id=parent_id)


@router.get("/locations/path/{location_id}")
def locations_path(location_id: int, _: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    return get_path(db, location_id=location_id)


# ---------------------------------------------------------------------------
# Complaints
# ---------------------------------------------------------------------------

def _own(db: Session, end_user: EndUser):
    return db.query(Complaint).filter(Complaint.end_user_id == end_user.id)


def _require_attach(db: Session, files: list[UploadFile]) -> None:
    if any(f.filename for f in files) and "portal.complaint.attach" not in end_user_permissions(db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing permission: portal.complaint.attach")


def _get_own(db: Session, end_user: EndUser, complaint_id: str) -> Complaint:
    complaint = (_own(db, end_user).filter(Complaint.generated_id == complaint_id)
                 .options(*DETAIL_OPTIONS).first())
    if complaint is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Complaint not found")
    return complaint


@router.get("/complaints")
def my_complaints(
    group: str | None = None, search: str | None = None, page: int = 1, page_size: int = DEFAULT_PAGE_SIZE,
    end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db),
):
    page, page_size = max(page, 1), min(max(page_size, 1), MAX_PAGE_SIZE)
    query = _own(db, end_user)
    if group:
        if group not in STATUS_GROUPS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"group must be one of: {', '.join(STATUS_GROUPS)}")
        query = query.filter(Complaint.status.in_(STATUS_GROUPS[group]))
    if search and search.strip():
        term = search.strip()
        query = query.filter(text_match(term, Complaint.title, Complaint.generated_id))
    total = query.count()
    complaints = (query.options(*LIST_OPTIONS).order_by(Complaint.created_at.desc(), Complaint.id.desc())
                  .offset((page - 1) * page_size).limit(page_size).all())
    return {"items": serialize_complaints(db, complaints, for_end_user=True), "total": total, "page": page,
            "page_size": page_size}


@router.get("/complaints/stats")
def my_complaint_stats(end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    counts = group_counts(_own(db, end_user))
    return {"total": sum(counts.values()), **counts}


@router.get("/complaints/{complaint_id}")
def my_complaint(complaint_id: str, end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    return end_user_detail(db, end_user, _get_own(db, end_user, complaint_id), end_user_permissions(db))


@router.post("/complaints", status_code=status.HTTP_201_CREATED)
def create_complaint(
    request: Request,
    department_id: int = Form(...),
    category_id: int = Form(...),
    location_id: int | None = Form(None),
    title: str = Form(...),
    description: str = Form(...),
    additional_details: str | None = Form(None),
    files: list[UploadFile] = File(default=[]),
    end_user: EndUser = Depends(require_portal_permission("portal.complaint.create")),
    db: Session = Depends(get_db),
):
    """The category decides the starting priority; staff may change it later."""
    _require_attach(db, files)
    title, description, additional_details = clean_complaint_text(title, description, additional_details)
    resolved_location_id = location_id if location_id is not None else end_user.location_id
    if resolved_location_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No location is assigned to your employee account. Please contact an administrator.",
        )
    department, category, location = resolve_classification(db, department_id, category_id, resolved_location_id)
    stored = attachment_service.StoredFiles()
    try:
        complaint = register_complaint(
            db, department=department, category=category, location=location, priority=category.default_priority,
            title=title, description=description, additional_details=additional_details, end_user=end_user,
        )
        attachment_service.save_attachments(db, complaint, files, end_user, stored)
        audit_service.record(
            db, actor=end_user, action="complaint.create", entity_type="complaint", entity_id=complaint.generated_id,
            summary=f"End user {end_user.name} registered {complaint.generated_id} ({department.name}, {location.name})",
            request=request,
        )
        db.commit()
    except BaseException:
        db.rollback()
        stored.discard()
        raise
    return end_user_detail(db, end_user, _get_own(db, end_user, complaint.generated_id), end_user_permissions(db))


@router.post("/complaints/{complaint_id}/comments", status_code=status.HTTP_201_CREATED)
def comment_on_complaint(
    complaint_id: str,
    body: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    end_user: EndUser = Depends(require_portal_permission("portal.complaint.comment")),
    db: Session = Depends(get_db),
):
    complaint = _get_own(db, end_user, complaint_id)
    if "comment" not in workflow_service.end_user_actions_for(db, complaint):
        raise HTTPException(status.HTTP_409_CONFLICT, "This complaint is closed. Reopen it to add a comment.")
    _require_attach(db, files)
    stored = attachment_service.StoredFiles()
    try:
        comment = workflow_service.add_comment(db, complaint, end_user, body)
        attachment_service.save_attachments(db, complaint, files, end_user, stored, comment=comment)
        db.commit()
    except BaseException:
        db.rollback()
        stored.discard()
        raise
    return end_user_detail(db, end_user, _get_own(db, end_user, complaint_id), end_user_permissions(db))


@router.post("/complaints/{complaint_id}/confirm")
def confirm_resolution(
    complaint_id: str, payload: ConfirmRequest, request: Request,
    end_user: EndUser = Depends(require_portal_permission("portal.complaint.confirm")),
    db: Session = Depends(get_db),
):
    complaint = _get_own(db, end_user, complaint_id)
    if payload.rating is not None and "portal.complaint.feedback" not in end_user_permissions(db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing permission: portal.complaint.feedback")
    workflow_service.end_user_confirm(db, end_user, complaint, payload.rating, payload.comment)
    audit_service.record(
        db, actor=end_user, action="complaint.confirm", entity_type="complaint", entity_id=complaint.generated_id,
        summary=f"End user {end_user.name} confirmed the resolution of {complaint.generated_id}", request=request,
    )
    db.commit()
    return end_user_detail(db, end_user, complaint, end_user_permissions(db))


@router.post("/complaints/{complaint_id}/reopen")
def reopen_complaint(
    complaint_id: str, payload: ReopenRequest, request: Request,
    end_user: EndUser = Depends(require_portal_permission("portal.complaint.reopen")),
    db: Session = Depends(get_db),
):
    complaint = _get_own(db, end_user, complaint_id)
    workflow_service.end_user_reopen(db, end_user, complaint, payload.reason)
    audit_service.record(
        db, actor=end_user, action="complaint.reopen", entity_type="complaint", entity_id=complaint.generated_id,
        summary=f"End user {end_user.name} reopened {complaint.generated_id}", request=request,
    )
    # The same handler keeps it if they still can; otherwise it goes to someone else or the queue.
    handler = complaint.assigned_to
    now = utcnow()
    if handler is not None and not (routing_service.still_handles(handler, complaint) and handler.is_available):
        routing_service.unassign(db, complaint, None, f"{handler.name} is no longer available", now)
        handler = None
    if handler is None:
        routing_service.auto_route(db, complaint, at=now)
    db.commit()
    return end_user_detail(db, end_user, complaint, end_user_permissions(db))


@router.post("/complaints/{complaint_id}/feedback")
def give_feedback(
    complaint_id: str, payload: FeedbackRequest, request: Request,
    end_user: EndUser = Depends(require_portal_permission("portal.complaint.feedback")),
    db: Session = Depends(get_db),
):
    complaint = _get_own(db, end_user, complaint_id)
    workflow_service.end_user_feedback(db, end_user, complaint, payload.rating, payload.comment)
    audit_service.record(
        db, actor=end_user, action="complaint.feedback", entity_type="complaint", entity_id=complaint.generated_id,
        summary=f"End user {end_user.name} rated {complaint.generated_id}", request=request,
    )
    db.commit()
    return end_user_detail(db, end_user, complaint, end_user_permissions(db))


# ---------------------------------------------------------------------------
# Activity and notifications
# ---------------------------------------------------------------------------

@router.get("/activities")
def my_activities(page: int = 1, page_size: int = DEFAULT_PAGE_SIZE,
                  end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    """Recent public updates across the end user's complaints."""
    page, page_size = max(page, 1), min(max(page_size, 1), MAX_PAGE_SIZE)
    query = (
        db.query(ComplaintEvent)
        .join(Complaint, ComplaintEvent.complaint_id == Complaint.id)
        .filter(Complaint.end_user_id == end_user.id, ComplaintEvent.public_message.isnot(None))
    )
    total = query.count()
    events = (
        query.options(selectinload(ComplaintEvent.complaint))
        .order_by(ComplaintEvent.created_at.desc(), ComplaintEvent.id.desc())
        .offset((page - 1) * page_size).limit(page_size).all()
    )
    items = []
    for event in events:
        if event.event_type == "status_changed" and event.to_status in (RESOLVED, CLOSED):
            kind = "resolved"
        else:
            kind = event.event_type
        items.append({
            "id": event.id,
            "kind": kind,
            "title": event.complaint.title,
            "message": event.public_message,
            "complaint_id": event.complaint.generated_id,
            "created_at": event.created_at.isoformat(),
        })
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/notifications")
def my_notifications(
    unread_only: bool = False, page: int = 1, page_size: int = DEFAULT_PAGE_SIZE,
    end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db),
):
    return notification_service.list_for(db, "end_user", end_user.id, unread_only, max(page, 1),
                                         min(max(page_size, 1), MAX_PAGE_SIZE))


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int, end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db),
):
    notification_service.mark_read(db, "end_user", end_user.id, notification_id)
    return {"success": True}


@router.post("/notifications/read-all")
def mark_all_notifications_read(end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    notification_service.mark_read(db, "end_user", end_user.id)
    return {"success": True}


@router.delete("/notifications")
def clear_notifications(end_user: EndUser = Depends(get_current_end_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(
        Notification.recipient_type == "end_user", Notification.recipient_id == end_user.id,
    ).delete(synchronize_session=False)
    db.commit()
    return {"success": True}


@router.post("/profile/avatar")
def upload_avatar(
    file: UploadFile = File(...),
    end_user: EndUser = Depends(require_portal_permission("portal.profile.update")),
    db: Session = Depends(get_db),
):
    """Uploads a profile picture for the current citizen (jpg, png, webp up to 5 MB)."""
    from services import attachment_service, storage_service

    if not file.filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is required")
    ext = attachment_service._extension(file.filename)
    if ext not in ("jpg", "jpeg", "png", "webp"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Photo must be a JPG, PNG, or WebP image")

    max_bytes = 5 * 1024 * 1024
    content = bytearray()
    head = b""
    while chunk := file.file.read(64 * 1024):
        if len(head) < 16:
            head += chunk[:16 - len(head)]
        content.extend(chunk)
        if len(content) > max_bytes:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Photo is larger than 5 MB")

    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty")
    if not attachment_service._matches_signature(ext, head):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"File does not match its .{ext} extension")

    content_type = attachment_service._CONTENT_TYPES.get(ext, "image/jpeg")
    _, url = storage_service.save_file(bytes(content), file.filename, content_type, folder="avatars", is_public=True)

    end_user.avatar_url = url
    db.commit()
    db.refresh(end_user)
    return _profile(db, end_user)


@router.delete("/profile/avatar")
def delete_avatar(
    end_user: EndUser = Depends(require_portal_permission("portal.profile.update")),
    db: Session = Depends(get_db),
):
    """Removes the citizen's profile photo."""
    end_user.avatar_url = None
    db.commit()
    db.refresh(end_user)
    return _profile(db, end_user)

