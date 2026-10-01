from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from config import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from models import Department, Location, Permission, Role, User, UserPermission, max_length
from services import audit_service, routing_service, token_service
from services.access_service import AccessContext
from services.location_service import require_usable
from services.phone_service import phone_format
from services.user_service import build_scopes, scope_snapshot, serialize_role, serialize_users, validate_reports_to
from utils.auth_middleware import get_access_context, require_permission
from utils.security import hash_password, normalize_email, utcnow, validate_password_strength
from utils.search import text_match
from utils.text import single_line

router = APIRouter()


class ScopeInput(BaseModel):
    department_id: int | None
    location_id: int | None


class CustomPermissionInput(BaseModel):
    permission_id: int | None = None
    permission_key: str | None = None
    is_granted: bool = True


class CreateUserRequest(BaseModel):
    name: str
    email: str
    mobile: str | None = None
    role_id: int
    password: str
    reports_to_id: int | None = None
    primary_department_id: int | None = None
    primary_location_id: int | None = None
    scopes: list[ScopeInput] = []
    custom_permissions: list[CustomPermissionInput] = []


class UpdateUserRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    mobile: str | None = None
    clear_mobile: bool = False
    role_id: int | None = None
    reports_to_id: int | None = None
    clear_reports_to: bool = False
    primary_department_id: int | None = None
    clear_primary_department: bool = False
    primary_location_id: int | None = None
    clear_primary_location: bool = False
    scopes: list[ScopeInput] | None = None
    custom_permissions: list[CustomPermissionInput] | None = None
    is_available: bool | None = None


def _assignable_role(ctx: AccessContext, role_id: int) -> Role:
    role = ctx.db.get(Role, role_id)
    if role is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Role not found")
    if not ctx.is_role_below(role):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"You cannot assign the {role.name} role")
    return role


def _clean_name(name: str) -> str:
    return single_line(name, "Name", max_length(User.name))


def _clean_email(db: Session, email: str, exclude_id: int | None = None) -> str:
    clean = normalize_email(email)
    if clean is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A valid email is required")
    duplicate = db.query(User).filter(User.email == clean)
    if exclude_id is not None:
        duplicate = duplicate.filter(User.id != exclude_id)
    if duplicate.first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"An account with email {clean} already exists")
    return clean


def _clean_mobile(db: Session, mobile: str, exclude_id: int | None = None) -> str:
    fmt = phone_format(db)
    clean = fmt.normalize(mobile)
    if clean is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Mobile must be {fmt.describe()}")
    duplicate = db.query(User).filter(User.mobile == clean)
    if exclude_id is not None:
        duplicate = duplicate.filter(User.id != exclude_id)
    if duplicate.first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Another staff account already uses this mobile number")
    return clean


def _get_manageable(ctx: AccessContext, user_id: int) -> User:
    user = ctx.db.get(User, user_id)
    if user is None or not ctx.can_manage_user(user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


def _validate_primary_workplace(db: Session, ctx: AccessContext, department_id: int | None, location_id: int | None) -> tuple[Department | None, Location | None]:
    dept = None
    if department_id is not None:
        dept = db.get(Department, department_id)
        if dept is None or not dept.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Primary department not found or inactive")
    loc = None
    if location_id is not None:
        loc = require_usable(db, db.get(Location, location_id))
    if department_id is not None or location_id is not None:
        if not ctx.covers(department_id, loc.path if loc else None):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Primary workplace is outside your scope")
    return dept, loc


def _build_custom_permissions(db: Session, ctx: AccessContext, user: User, requested: list[CustomPermissionInput]) -> list[UserPermission]:
    result = []
    seen = set()
    for item in requested:
        perm = None
        if item.permission_id is not None:
            perm = db.get(Permission, item.permission_id)
        elif item.permission_key:
            perm = db.query(Permission).filter(Permission.key == item.permission_key).first()
        if perm is None:
            continue
        if perm.id in seen:
            continue
        seen.add(perm.id)
        if not ctx.is_super_admin and not ctx.has(perm.key):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"You cannot grant permission '{perm.key}' which you do not hold")
        result.append(UserPermission(user=user, permission=perm, is_granted=item.is_granted))
    return result


@router.get("")
def list_users(
    search: str | None = None,
    role_id: int | None = None,
    include_inactive: bool = True,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    ctx: AccessContext = Depends(require_permission("user.view")),
):
    """Staff users below the caller in the role hierarchy and inside their scope."""
    page, page_size = max(page, 1), min(max(page_size, 1), MAX_PAGE_SIZE)
    below_ids = [r.id for r in ctx.assignable_roles()]
    if not below_ids:
        return {"items": [], "total": 0, "page": page, "page_size": page_size}
    query = (
        ctx.db.query(User)
        .options(selectinload(User.scopes), selectinload(User.custom_permissions))
        .filter(User.role_id.in_(below_ids))
    )
    if role_id is not None:
        query = query.filter(User.role_id == role_id)
    if not include_inactive:
        query = query.filter(User.is_active.is_(True))
    if search and search.strip():
        term = search.strip()
        query = query.filter(text_match(term, User.name, User.email, User.mobile))
    # Scope containment is checked per user (it compares scope trees), then paged.
    users = [u for u in query.order_by(User.name, User.id).all() if ctx.can_manage_user(u)]
    items = users[(page - 1) * page_size: page * page_size]
    return {"items": serialize_users(ctx.db, items, ctx), "total": len(users), "page": page, "page_size": page_size}


@router.get("/assignable-roles")
def assignable_roles(ctx: AccessContext = Depends(get_access_context)):
    """Roles the caller may give to users they create or edit."""
    if not (ctx.has("user.create") or ctx.has("user.update")):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing permission: user.create")
    return [serialize_role(r) for r in sorted(ctx.assignable_roles(), key=lambda r: r.name)]


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
def create_user(payload: CreateUserRequest, request: Request,
                ctx: AccessContext = Depends(require_permission("user.create"))):
    db = ctx.db
    role = _assignable_role(ctx, payload.role_id)
    name = _clean_name(payload.name)
    email = _clean_email(db, payload.email)
    mobile = _clean_mobile(db, payload.mobile) if payload.mobile and payload.mobile.strip() else None
    error = validate_password_strength(payload.password)
    if error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, error)
    primary_dept, primary_loc = _validate_primary_workplace(db, ctx, payload.primary_department_id, payload.primary_location_id)
    scope_inputs = [s.model_dump() for s in payload.scopes]
    if not scope_inputs and (payload.primary_department_id is not None or payload.primary_location_id is not None):
        scope_inputs = [{"department_id": payload.primary_department_id, "location_id": payload.primary_location_id}]
    scopes = build_scopes(db, ctx, role, scope_inputs)
    reports_to = validate_reports_to(db, ctx, role, payload.reports_to_id)

    user = User(
        name=name, email=email, mobile=mobile, role=role,
        password_hash=hash_password(payload.password), must_change_password=True,
        reports_to=reports_to, primary_department=primary_dept, primary_location=primary_loc,
        created_by_id=ctx.user.id, scopes=scopes,
    )
    if payload.custom_permissions:
        user.custom_permissions = _build_custom_permissions(db, ctx, user, payload.custom_permissions)
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email or mobile already exists") from None
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
    """Changes only the fields that are sent."""
    db = ctx.db
    user = _get_manageable(ctx, user_id)
    before = {
        "name": user.name, "email": user.email, "mobile": user.mobile, "role": user.role.key,
        "reports_to_id": user.reports_to_id, "scopes": scope_snapshot(user.scopes),
        "is_available": user.is_available,
    }

    if payload.name is not None:
        user.name = _clean_name(payload.name)
    if payload.email is not None:
        user.email = _clean_email(db, payload.email, exclude_id=user.id)
    if payload.clear_mobile:
        user.mobile = None
    elif payload.mobile is not None:
        user.mobile = _clean_mobile(db, payload.mobile, exclude_id=user.id)
    role = _assignable_role(ctx, payload.role_id) if payload.role_id is not None else user.role
    if payload.scopes is not None:
        user.scopes = build_scopes(db, ctx, role, [s.model_dump() for s in payload.scopes])
    elif role.id != user.role_id:
        # the existing scopes must still be ones the actor could grant
        build_scopes(db, ctx, role, [{"department_id": s.department_id, "location_id": s.location_id}
                                     for s in user.scopes])
    user.role = role

    if payload.clear_primary_department:
        user.primary_department = None
        user.primary_department_id = None
    elif payload.primary_department_id is not None:
        dept, _ = _validate_primary_workplace(db, ctx, payload.primary_department_id, None)
        user.primary_department = dept
        user.primary_department_id = dept.id if dept else None

    if payload.clear_primary_location:
        user.primary_location = None
        user.primary_location_id = None
    elif payload.primary_location_id is not None:
        _, loc = _validate_primary_workplace(db, ctx, None, payload.primary_location_id)
        user.primary_location = loc
        user.primary_location_id = loc.id if loc else None

    if payload.custom_permissions is not None:
        user.custom_permissions.clear()
        db.flush()
        user.custom_permissions = _build_custom_permissions(db, ctx, user, payload.custom_permissions)

    if payload.clear_reports_to:
        user.reports_to = None
    elif payload.reports_to_id is not None:
        user.reports_to = validate_reports_to(db, ctx, role, payload.reports_to_id)
    elif user.reports_to is not None and not ctx.is_role_below(role, above=user.reports_to.role):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"{user.reports_to.name} is no longer above the new role; choose who {user.name} reports to")
    if payload.is_available is not None:
        user.is_available = payload.is_available
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Another account already uses this email or mobile") from None

    after = {
        "name": user.name, "email": user.email, "mobile": user.mobile, "role": role.key,
        "reports_to_id": user.reports_to_id, "scopes": scope_snapshot(user.scopes),
        "is_available": user.is_available,
    }
    changes = audit_service.diff(before, after)
    moved = 0
    if "scopes" in changes or "role" in changes:
        moved = routing_service.reroute_complaints_of(db, user, ctx.user, f"{user.name}'s role or scope changed",
                                                      utcnow(), only_uncovered=True)
    if changes:
        summary = f"Updated {user.name}: {', '.join(changes)}" + (f"; {moved} complaint(s) re-routed" if moved else "")
        audit_service.record(db, actor=ctx.user, action="user.update", entity_type="user", entity_id=user.id,
                             summary=summary, changes=changes, request=request)
    db.commit()
    return serialize_users(db, [user], ctx)[0]


def _set_active(ctx: AccessContext, user_id: int, active: bool, request: Request):
    db = ctx.db
    user = _get_manageable(ctx, user_id)
    if user.is_active != active:
        user.is_active = active
        moved = 0
        if not active:
            token_service.end_all_sessions(db, user)
            db.flush()
            moved = routing_service.reroute_complaints_of(db, user, ctx.user, f"{user.name} was deactivated",
                                                          utcnow(), only_uncovered=False)
        audit_service.record(
            db, actor=ctx.user, action="user.activate" if active else "user.deactivate",
            entity_type="user", entity_id=user.id,
            summary=f"{'Reactivated' if active else 'Deactivated'} {user.name}"
                    + (f"; {moved} open complaint(s) re-routed" if moved else ""),
            request=request,
        )
        db.commit()
    return serialize_users(db, [user], ctx)[0]


@router.post("/{user_id}/deactivate")
def deactivate_user(user_id: int, request: Request, ctx: AccessContext = Depends(require_permission("user.deactivate"))):
    return _set_active(ctx, user_id, False, request)


@router.post("/{user_id}/activate")
def activate_user(user_id: int, request: Request, ctx: AccessContext = Depends(require_permission("user.deactivate"))):
    return _set_active(ctx, user_id, True, request)
