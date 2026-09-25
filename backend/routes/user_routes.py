from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import Role, User
from services import audit_service
from services.access_service import AccessContext
from services.token_service import revoke_all_for
from services.user_service import build_scopes, scope_snapshot, serialize_users, validate_reports_to
from utils.auth_middleware import require_permission
from utils.security import (
    PRINCIPAL_STAFF, hash_password, looks_like_email, normalize_email, normalize_mobile,
    validate_password_strength,
)

router = APIRouter()


class ScopeInput(BaseModel):
    department_id: int | None = None
    location_id: int | None = None


class CreateUserRequest(BaseModel):
    name: str
    email: str
    mobile: str | None = None
    role_id: int
    password: str
    reports_to_id: int | None = None
    scopes: list[ScopeInput] = []


class UpdateUserRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    mobile: str | None = None
    role_id: int | None = None
    reports_to_id: int | None = None
    clear_reports_to: bool = False
    scopes: list[ScopeInput] | None = None
    is_available: bool | None = None


def _assignable_role(ctx: AccessContext, role_id: int) -> Role:
    role = ctx.db.get(Role, role_id)
    if role is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Role not found")
    if not ctx.is_role_below(role):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"You cannot assign the {role.name} role")
    return role


def _clean_identity(db: Session, name: str, email: str, mobile: str | None, exclude_id: int | None = None):
    name = name.strip()
    if not name or len(name) > 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name is required (max 100 characters)")
    clean_email = normalize_email(email)
    if not clean_email or not looks_like_email(clean_email):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A valid email is required")
    duplicate = db.query(User).filter(User.email == clean_email)
    if exclude_id is not None:
        duplicate = duplicate.filter(User.id != exclude_id)
    if duplicate.first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"An account with email {clean_email} already exists")
    clean_mobile = normalize_mobile(mobile)
    if mobile and (not clean_mobile or len(clean_mobile) != 10):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mobile must be a 10-digit number")
    return name, clean_email, clean_mobile


def _get_manageable(ctx: AccessContext, user_id: int) -> User:
    user = ctx.db.get(User, user_id)
    if user is None or not (ctx.can_manage_user(user)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.get("/")
def list_users(
    search: str | None = None,
    role_id: int | None = None,
    include_inactive: bool = True,
    ctx: AccessContext = Depends(require_permission("user.view")),
):
    """Staff users below the caller in the role hierarchy and inside their scope."""
    below_ids = [r.id for r in ctx.assignable_roles()]
    if not below_ids:
        return []
    query = ctx.db.query(User).filter(User.role_id.in_(below_ids))
    if role_id is not None:
        query = query.filter(User.role_id == role_id)
    if not include_inactive:
        query = query.filter(User.is_active.is_(True))
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(User.name.ilike(like) | User.email.ilike(like) | User.mobile.ilike(like))
    users = [u for u in query.order_by(User.name).all() if ctx.can_manage_user(u)]
    return serialize_users(ctx.db, users, ctx)


@router.get("/reports-to-options")
def reports_to_options(role_id: int, ctx: AccessContext = Depends(require_permission("user.view"))):
    """Active users who could be the reporting manager of someone with `role_id`."""
    role = _assignable_role(ctx, role_id)
    candidates = [ctx.user] + [
        u for u in ctx.db.query(User).filter(User.is_active.is_(True)).all() if ctx.can_manage_user(u)
    ]
    return [
        {"id": u.id, "name": u.name, "role": u.role.name}
        for u in candidates
        if ctx.is_role_below(role, above=u.role)
    ]


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_user(payload: CreateUserRequest, request: Request, ctx: AccessContext = Depends(require_permission("user.create"))):
    db = ctx.db
    role = _assignable_role(ctx, payload.role_id)
    name, email, mobile = _clean_identity(db, payload.name, payload.email, payload.mobile)
    error = validate_password_strength(payload.password)
    if error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, error)
    scopes = build_scopes(db, ctx, role, [s.model_dump() for s in payload.scopes])

    reports_to_id = payload.reports_to_id
    if reports_to_id is None and role.parent_id == ctx.role.id:
        reports_to_id = ctx.user.id  # default: the creator, when they are directly above
    reports_to = validate_reports_to(db, ctx, role, reports_to_id)

    user = User(
        name=name, email=email, mobile=mobile, role=role,
        password_hash=hash_password(payload.password),
        reports_to=reports_to, created_by_id=ctx.user.id, scopes=scopes,
    )
    db.add(user)
    db.flush()
    audit_service.record(
        db, actor=ctx.user, action="user.create", entity_type="user", entity_id=user.id,
        summary=f"Created {role.name} {name} <{email}>",
        changes={"role": [None, role.key], "scopes": [None, scope_snapshot(scopes)]},
        request=request,
    )
    db.commit()
    return serialize_users(db, [user], ctx)[0]


@router.patch("/{user_id}")
def update_user(
    user_id: int, payload: UpdateUserRequest, request: Request,
    ctx: AccessContext = Depends(require_permission("user.update")),
):
    db = ctx.db
    user = _get_manageable(ctx, user_id)
    before = {
        "name": user.name, "email": user.email, "mobile": user.mobile, "role": user.role.key,
        "reports_to_id": user.reports_to_id, "scopes": scope_snapshot(user.scopes),
        "is_available": user.is_available,
    }

    role = _assignable_role(ctx, payload.role_id) if payload.role_id is not None else user.role
    name, email, mobile = _clean_identity(
        db,
        payload.name if payload.name is not None else user.name,
        payload.email if payload.email is not None else user.email,
        payload.mobile if payload.mobile is not None else user.mobile,
        exclude_id=user.id,
    )
    if payload.scopes is not None:
        scopes = build_scopes(db, ctx, role, [s.model_dump() for s in payload.scopes])
    else:
        scopes = None

    if payload.clear_reports_to:
        reports_to = None
    elif payload.reports_to_id is not None:
        reports_to = validate_reports_to(db, ctx, role, payload.reports_to_id)
    else:
        reports_to = user.reports_to
        if reports_to is not None and not ctx.is_role_below(role, above=reports_to.role):
            reports_to = None  # a role change moved them level with / above their old manager

    user.name, user.email, user.mobile, user.role, user.reports_to = name, email, mobile, role, reports_to
    if scopes is not None:
        user.scopes = scopes
    if payload.is_available is not None:
        user.is_available = payload.is_available
    db.flush()

    after = {
        "name": user.name, "email": user.email, "mobile": user.mobile, "role": role.key,
        "reports_to_id": user.reports_to_id, "scopes": scope_snapshot(user.scopes),
        "is_available": user.is_available,
    }
    changes = audit_service.diff(before, after)
    if changes:
        audit_service.record(
            db, actor=ctx.user, action="user.update", entity_type="user", entity_id=user.id,
            summary=f"Updated {user.name}: {', '.join(changes)}", changes=changes, request=request,
        )
    db.commit()
    return serialize_users(db, [user], ctx)[0]


def _set_active(ctx: AccessContext, user_id: int, active: bool, request: Request):
    db = ctx.db
    user = _get_manageable(ctx, user_id)
    if user.is_active != active:
        user.is_active = active
        if not active:
            revoke_all_for(db, PRINCIPAL_STAFF, user.id)
        audit_service.record(
            db, actor=ctx.user, action="user.activate" if active else "user.deactivate",
            entity_type="user", entity_id=user.id,
            summary=f"{'Reactivated' if active else 'Deactivated'} {user.name}", request=request,
        )
        db.commit()
    return serialize_users(db, [user], ctx)[0]


@router.post("/{user_id}/deactivate")
def deactivate_user(user_id: int, request: Request, ctx: AccessContext = Depends(require_permission("user.deactivate"))):
    return _set_active(ctx, user_id, False, request)


@router.post("/{user_id}/activate")
def activate_user(user_id: int, request: Request, ctx: AccessContext = Depends(require_permission("user.deactivate"))):
    return _set_active(ctx, user_id, True, request)
