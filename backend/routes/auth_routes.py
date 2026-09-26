import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import EndUser, PasswordResetTicket, RefreshToken, User
from services import audit_service
from services.access_service import AccessContext
from services.token_service import consume_refresh_token, issue_token_pair, revoke_all_for
from services.user_service import find_staff_by_identifier, serialize_users, visible_reset_tickets
from utils.auth_middleware import get_access_context, require_permission
from utils.security import (
    PRINCIPAL_STAFF, hash_password, sha256_hex, utcnow, validate_password_strength, verify_password,
)

router = APIRouter()


class LoginRequest(BaseModel):
    email: str | None = None
    mobile: str | None = None
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AvailabilityRequest(BaseModel):
    is_available: bool


class ResetQueryRequest(BaseModel):
    email_or_id: str
    department: str
    reason: str


class ApproveResetRequest(BaseModel):
    temporary_key: str | None = None


def staff_profile(db: Session, ctx: AccessContext) -> dict:
    profile = serialize_users(db, [ctx.user])[0]
    profile["permissions"] = sorted(ctx.permissions)
    profile["is_super_admin"] = ctx.is_super_admin
    return profile


# Email / mobile + password login for staff (Super Admin down to Agent)
@router.post("/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    identifier = payload.email or payload.mobile
    user = find_staff_by_identifier(db, identifier) if identifier else None
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated")

    user.last_login_at = utcnow()
    audit_service.record(
        db, actor=user, action="auth.login", entity_type="user", entity_id=user.id,
        summary=f"{user.name} signed in", request=request,
    )
    tokens = issue_token_pair(db, PRINCIPAL_STAFF, user.id)
    ctx = AccessContext(db, user)
    return {"success": True, **tokens, "user": staff_profile(db, ctx)}


# Works for both staff and end user refresh tokens; the old token is revoked (rotation)
@router.post("/refresh")
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    token = consume_refresh_token(db, payload.refresh_token)
    model = User if token.principal_type == PRINCIPAL_STAFF else EndUser
    principal = db.get(model, token.principal_id)
    if principal is None or not principal.is_active:
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found or deactivated")
    return {"success": True, **issue_token_pair(db, token.principal_type, principal.id)}


@router.post("/logout")
def logout(payload: RefreshRequest, db: Session = Depends(get_db)):
    token = db.query(RefreshToken).filter(RefreshToken.token_hash == sha256_hex(payload.refresh_token)).first()
    if token is not None and token.revoked_at is None:
        token.revoked_at = utcnow()
        db.commit()
    return {"success": True}


@router.get("/me")
def me(ctx: AccessContext = Depends(get_access_context)):
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


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    ctx: AccessContext = Depends(get_access_context),
):
    db = ctx.db
    if not verify_password(payload.current_password, ctx.user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    error = validate_password_strength(payload.new_password)
    if error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, error)
    ctx.user.password_hash = hash_password(payload.new_password)
    revoke_all_for(db, PRINCIPAL_STAFF, ctx.user.id)
    audit_service.record(
        db, actor=ctx.user, action="user.password_change", entity_type="user", entity_id=ctx.user.id,
        summary=f"{ctx.user.name} changed their password", request=request,
    )
    db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Password reset queries: a locked-out officer raises a ticket, someone above
# them approves it and hands over a temporary password.
# ---------------------------------------------------------------------------

@router.post("/reset-query")
def raise_reset_query(payload: ResetQueryRequest, db: Session = Depends(get_db)):
    ticket = PasswordResetTicket(
        ticket_id=f"RST-{secrets.token_hex(3).upper()}",
        email_or_id=payload.email_or_id.strip()[:120],
        department=payload.department.strip()[:100],
        reason=payload.reason.strip()[:500],
        status="Pending Approval",
    )
    db.add(ticket)
    db.commit()
    return {
        "success": True,
        "ticket_id": ticket.ticket_id,
        "message": "Reset query submitted for review",
        "status": ticket.status,
    }


@router.get("/reset-queries")
def list_reset_queries(ctx: AccessContext = Depends(require_permission("user.reset_password"))):
    return [
        {
            "ticket_id": t.ticket_id,
            "email_or_id": t.email_or_id,
            "department": t.department,
            "reason": t.reason,
            "status": t.status,
            "created_at": t.created_at.isoformat(),
            "matched_user": {"id": u.id, "name": u.name, "role": u.role.name} if u else None,
        }
        for t, u in visible_reset_tickets(ctx)
    ]


@router.post("/reset-queries/{ticket_id}/approve")
def approve_reset_query(
    ticket_id: str,
    request: Request,
    payload: ApproveResetRequest | None = None,
    ctx: AccessContext = Depends(require_permission("user.reset_password")),
):
    db = ctx.db
    ticket = db.query(PasswordResetTicket).filter(PasswordResetTicket.ticket_id == ticket_id).first()
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reset ticket not found")
    if ticket.status != "Pending Approval":
        raise HTTPException(status.HTTP_409_CONFLICT, "Ticket has already been processed")
    user = find_staff_by_identifier(db, ticket.email_or_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No staff account matches this ticket")
    if not ctx.can_manage_user(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot reset this user's password")

    temp_key = (payload.temporary_key if payload and payload.temporary_key else secrets.token_urlsafe(9))
    error = validate_password_strength(temp_key)
    if error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, error)

    user.password_hash = hash_password(temp_key)
    revoke_all_for(db, PRINCIPAL_STAFF, user.id)
    ticket.status = "Approved"
    ticket.approved_by_id = ctx.user.id
    audit_service.record(
        db, actor=ctx.user, action="user.password_reset", entity_type="user", entity_id=user.id,
        summary=f"Approved password reset {ticket.ticket_id} for {user.name}", request=request,
    )
    db.commit()
    # The key is returned once so the approver can pass it on; it is not stored in plain text.
    return {
        "success": True,
        "ticket_id": ticket_id,
        "status": "Approved",
        "temporary_key": temp_key,
        "message": f"Reset approved for {user.name}. Share the temporary password securely.",
    }
