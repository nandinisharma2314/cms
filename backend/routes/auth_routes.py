import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import config
from database import get_db
from models import RESET_APPROVED, RESET_PENDING, RESET_REJECTED, PasswordResetTicket, User, max_length
from services import audit_service, rate_limit_service, token_service
from services.access_service import AccessContext
from services.user_service import can_handle_reset_ticket, find_staff_by_identifier, login_identifier_key, \
    serialize_users, visible_reset_tickets
from utils.auth_middleware import (
    client_ip, get_access_context, get_access_context_allowing_password_change, require_client_header,
    require_permission,
)
from utils.cookies import clear_refresh_cookie, read_refresh_cookie, set_refresh_cookie
from utils.security import (
    PRINCIPALS, PRINCIPAL_STAFF, generate_password, hash_password, utcnow, validate_password_strength, verify_password,
)
from utils.text import multi_line

router = APIRouter()
HOUR = timedelta(hours=1)


class LoginRequest(BaseModel):
    identifier: str  # email or mobile number
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AvailabilityRequest(BaseModel):
    is_available: bool


class ResetQueryRequest(BaseModel):
    identifier: str
    reason: str


class RejectResetRequest(BaseModel):
    note: str


def staff_profile(db: Session, ctx: AccessContext) -> dict:
    profile = serialize_users(db, [ctx.user])[0]
    profile["permissions"] = sorted(ctx.permissions)
    profile["is_super_admin"] = ctx.is_super_admin
    return profile


def _session_response(response: Response, db: Session, user: User) -> dict:
    access, refresh = token_service.issue(db, user)
    set_refresh_cookie(response, PRINCIPAL_STAFF, refresh)
    return {"access_token": access, "token_type": "bearer", "user": staff_profile(db, AccessContext(db, user))}


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """Email or mobile + password, for staff (Super Admin down to Agent)."""
    ip = client_ip(request)
    identifier = (payload.identifier or "").strip()
    if not identifier:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email or phone number is required")
    if not payload.password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password is required")
    rate_limit_service.enforce(db, "login_ip", ip, config.LOGIN_ATTEMPTS_PER_IP_PER_HOUR, HOUR,
                               "Too many sign-in attempts from this network. Please try again later.")
    user = find_staff_by_identifier(db, identifier)
    # Failures count per account, however the email/mobile was typed (unknown identifiers per normalized value).
    failure_key = f"user:{user.id}" if user else login_identifier_key(db, identifier)
    lockout = timedelta(minutes=config.LOGIN_LOCKOUT_MINUTES)
    if rate_limit_service.count(db, "login_failures", failure_key, lockout) >= config.LOGIN_MAX_FAILURES:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"Too many failed attempts. Try again in {config.LOGIN_LOCKOUT_MINUTES} minutes "
                            "or ask for a password reset.")
    if not verify_password(payload.password, user.password_hash if user else None):
        rate_limit_service.hit(db, "login_failures", failure_key, lockout)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated")

    rate_limit_service.reset(db, "login_failures", failure_key)
    user.last_login_at = utcnow()
    audit_service.record(
        db, actor=user, action="auth.login", entity_type="user", entity_id=user.id,
        summary=f"{user.name} signed in", request=request,
    )
    return _session_response(response, db, user)


@router.post("/refresh", dependencies=[Depends(require_client_header)])
def refresh(principal: str, request: Request, response: Response, db: Session = Depends(get_db)):
    """Exchanges the refresh cookie (staff or end user) for a new access token; rotates the cookie."""
    if principal not in PRINCIPALS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown principal")
    try:
        _, access, raw = token_service.rotate(db, read_refresh_cookie(request, principal), principal)
    except HTTPException as exc:
        # Returned rather than raised: a raised error gets a fresh response, which would drop the cookie removal.
        failed = JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
        clear_refresh_cookie(failed, principal)
        return failed
    set_refresh_cookie(response, principal, raw)
    return {"access_token": access, "token_type": "bearer"}


@router.post("/logout", dependencies=[Depends(require_client_header)])
def logout(principal: str, request: Request, response: Response, db: Session = Depends(get_db)):
    if principal not in PRINCIPALS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown principal")
    token_service.revoke(db, read_refresh_cookie(request, principal))
    clear_refresh_cookie(response, principal)
    return {"success": True}


@router.get("/me")
def me(ctx: AccessContext = Depends(get_access_context_allowing_password_change)):
    return staff_profile(ctx.db, ctx)


@router.post("/availability")
def set_my_availability(
    payload: AvailabilityRequest, request: Request, ctx: AccessContext = Depends(get_access_context),
):
    """Staff can mark themselves unavailable (e.g. on leave) so routing skips them."""
    if ctx.user.is_available != payload.is_available:
        ctx.user.is_available = payload.is_available
        audit_service.record(
            ctx.db, actor=ctx.user, action="user.availability", entity_type="user", entity_id=ctx.user.id,
            summary=f"{ctx.user.name} marked themselves {'available' if payload.is_available else 'unavailable'}",
            changes={"is_available": [not payload.is_available, payload.is_available]}, request=request,
        )
        ctx.db.commit()
    return staff_profile(ctx.db, ctx)


@router.post("/avatar")
def upload_staff_avatar(
    file: UploadFile = File(...),
    ctx: AccessContext = Depends(get_access_context),
):
    """Uploads a profile picture for the current staff member (jpg, png, webp up to 5 MB)."""
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

    ctx.user.avatar_url = url
    ctx.db.commit()
    ctx.db.refresh(ctx.user)
    return staff_profile(ctx.db, ctx)


@router.delete("/avatar")
def delete_staff_avatar(
    ctx: AccessContext = Depends(get_access_context),
):
    """Removes the staff member's profile photo."""
    ctx.user.avatar_url = None
    ctx.db.commit()
    ctx.db.refresh(ctx.user)
    return staff_profile(ctx.db, ctx)


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest, request: Request, response: Response,
    ctx: AccessContext = Depends(get_access_context_allowing_password_change),
):
    """Also required right after signing in with a password someone else set.
    Ends every other session and returns a fresh one for this browser."""
    db = ctx.db
    if not verify_password(payload.current_password, ctx.user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    if payload.new_password == payload.current_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose a password different from the current one")
    error = validate_password_strength(payload.new_password)
    if error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, error)
    ctx.user.password_hash = hash_password(payload.new_password)
    ctx.user.must_change_password = False
    token_service.end_all_sessions(db, ctx.user)
    audit_service.record(
        db, actor=ctx.user, action="user.password_change", entity_type="user", entity_id=ctx.user.id,
        summary=f"{ctx.user.name} changed their password", request=request,
    )
    db.commit()
    return _session_response(response, db, ctx.user)


# ---------------------------------------------------------------------------
# Password reset queries: a locked-out staff member raises a ticket, someone
# above them verifies who they are and approves it (or rejects it).
# ---------------------------------------------------------------------------

def _new_ticket_id() -> str:
    return f"RST-{secrets.token_hex(5).upper()}"


@router.post("/reset-query")
def raise_reset_query(payload: ResetQueryRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit_service.enforce(db, "reset_request_ip", client_ip(request), config.RESET_REQUESTS_PER_IP_PER_HOUR,
                               HOUR, "Too many reset requests from this network. Please try again later.")
    identifier = payload.identifier.strip()
    if not identifier or len(identifier) > max_length(PasswordResetTicket.identifier):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter the email address or mobile number of your account")
    reason = multi_line(payload.reason, "The reason for the reset", max_length(PasswordResetTicket.reason))
    user = find_staff_by_identifier(db, identifier)
    for _ in range(5):
        ticket = PasswordResetTicket(ticket_id=_new_ticket_id(), identifier=identifier, user=user, reason=reason,
                                     status=RESET_PENDING, created_at=utcnow())
        db.add(ticket)
        try:
            db.commit()
            break
        except IntegrityError:  # ticket id collision; try another
            db.rollback()
    else:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not create the request; please try again")
    # The same answer whether or not an account matched, so this cannot be used to probe accounts.
    return {"ticket_id": ticket.ticket_id, "status": ticket.status}


def _serialize_ticket(ticket: PasswordResetTicket) -> dict:
    return {
        "ticket_id": ticket.ticket_id,
        "identifier": ticket.identifier,
        "reason": ticket.reason,
        "status": ticket.status,
        "created_at": ticket.created_at.isoformat(),
        "matched_user": ({"id": ticket.user.id, "name": ticket.user.name, "role": ticket.user.role.name,
                          "email": ticket.user.email} if ticket.user else None),
        "decided_by": ticket.decided_by.name if ticket.decided_by else None,
        "decided_at": ticket.decided_at.isoformat() if ticket.decided_at else None,
        "decision_note": ticket.decision_note,
    }


@router.get("/reset-queries")
def list_reset_queries(pending_only: bool = False, page: int = 1, page_size: int = config.DEFAULT_PAGE_SIZE,
                       ctx: AccessContext = Depends(require_permission("user.reset_password"))):
    page, page_size = max(page, 1), min(max(page_size, 1), config.MAX_PAGE_SIZE)
    tickets = visible_reset_tickets(ctx, pending_only)
    return {"items": [_serialize_ticket(t) for t in tickets[(page - 1) * page_size: page * page_size]],
            "total": len(tickets), "page": page, "page_size": page_size}


def _pending_ticket(ctx: AccessContext, ticket_id: str) -> PasswordResetTicket:
    ticket = ctx.db.query(PasswordResetTicket).filter(PasswordResetTicket.ticket_id == ticket_id).with_for_update().first()
    if ticket is None or not can_handle_reset_ticket(ctx, ticket):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reset ticket not found")
    if ticket.status != RESET_PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ticket has already been processed")
    return ticket


@router.post("/reset-queries/{ticket_id}/approve")
def approve_reset_query(ticket_id: str, request: Request,
                        ctx: AccessContext = Depends(require_permission("user.reset_password"))):
    db = ctx.db
    ticket = _pending_ticket(ctx, ticket_id)
    user = ticket.user
    if user is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "No staff account matches this ticket; reject it instead")
    if not ctx.can_manage_user(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot reset this user's password")
    temporary = generate_password()
    user.password_hash = hash_password(temporary)
    user.must_change_password = True
    token_service.end_all_sessions(db, user)
    ticket.status, ticket.decided_by, ticket.decided_at = RESET_APPROVED, ctx.user, utcnow()
    audit_service.record(
        db, actor=ctx.user, action="user.password_reset", entity_type="user", entity_id=user.id,
        summary=f"Approved password reset {ticket.ticket_id} for {user.name}", request=request,
    )
    db.commit()
    # Shown once so the approver can pass it on; the user must replace it when they sign in.
    return {"ticket_id": ticket.ticket_id, "status": ticket.status, "temporary_password": temporary,
            "user": {"id": user.id, "name": user.name}}


@router.post("/reset-queries/{ticket_id}/reject")
def reject_reset_query(ticket_id: str, payload: RejectResetRequest, request: Request,
                       ctx: AccessContext = Depends(require_permission("user.reset_password"))):
    note = multi_line(payload.note, "The reason for rejecting it", max_length(PasswordResetTicket.decision_note))
    ticket = _pending_ticket(ctx, ticket_id)
    ticket.status, ticket.decided_by, ticket.decided_at, ticket.decision_note = RESET_REJECTED, ctx.user, utcnow(), note
    audit_service.record(
        ctx.db, actor=ctx.user, action="user.password_reset_reject", entity_type="user",
        entity_id=ticket.user_id, summary=f"Rejected password reset {ticket.ticket_id}: {note}", request=request,
    )
    ctx.db.commit()
    return _serialize_ticket(ticket)
