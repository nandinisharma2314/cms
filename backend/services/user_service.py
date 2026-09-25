from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models import Department, Location, PasswordResetTicket, Role, User, UserScope
from services.access_service import AccessContext
from services.location_service import path_names, serialize_location
from services.permission_catalog import SUPER_ADMIN_ROLE_KEY
from utils.security import normalize_email, normalize_mobile


def serialize_role(role: Role) -> dict:
    return {"id": role.id, "key": role.key, "name": role.name}


def serialize_users(db: Session, users: list[User], ctx: AccessContext | None = None) -> list[dict]:
    names = path_names(db, [s.location for u in users for s in u.scopes])
    result = []
    for u in users:
        item = {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "mobile": u.mobile,
            "role": serialize_role(u.role),
            "reports_to": {"id": u.reports_to.id, "name": u.reports_to.name} if u.reports_to else None,
            "scopes": [
                {
                    "department": {"id": s.department.id, "name": s.department.name} if s.department else None,
                    "location": serialize_location(s.location, names),
                }
                for s in u.scopes
            ],
            "is_active": u.is_active,
            "is_available": u.is_available,
            "created_at": u.created_at.isoformat(),
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
        }
        if ctx is not None:
            item["can_manage"] = ctx.can_manage_user(u)
        result.append(item)
    return result


def build_scopes(db: Session, ctx: AccessContext, role: Role, requested: list[dict]) -> list[UserScope]:
    """Validates requested {department_id, location_id} pairs against the actor's
    own scopes and returns unsaved UserScope rows."""
    if role.key == SUPER_ADMIN_ROLE_KEY:
        return []
    if not requested:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "At least one department/location scope is required")

    scopes: list[UserScope] = []
    seen: set[tuple[int | None, int | None]] = set()
    for item in requested:
        department_id = item.get("department_id")
        location_id = item.get("location_id")
        if (department_id, location_id) in seen:
            continue
        seen.add((department_id, location_id))

        department = None
        if department_id is not None:
            department = db.get(Department, department_id)
            if department is None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Department {department_id} not found")
        location = None
        if location_id is not None:
            location = db.get(Location, location_id)
            if location is None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Location {location_id} not found")

        if not ctx.covers(department_id, location.path if location else None):
            label = f"{department.name if department else 'All departments'} / {location.name if location else 'All locations'}"
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Scope '{label}' is outside your own scope")
        scopes.append(UserScope(department_id=department_id, location_id=location_id))
    return scopes


def validate_reports_to(db: Session, ctx: AccessContext, role: Role, reports_to_id: int | None) -> User | None:
    if reports_to_id is None:
        return None
    manager = db.get(User, reports_to_id)
    if manager is None or not manager.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reporting manager not found")
    if not ctx.is_role_below(role, above=manager.role):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{manager.name}'s role is not above {role.name}")
    if manager.id != ctx.user.id and not ctx.can_manage_user(manager):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Reporting manager is outside your scope")
    return manager


def scope_snapshot(scopes: list[UserScope]) -> list[str]:
    """Stable text form of scopes for audit diffs: "<department_id>@<location_id>", * = all."""
    return sorted(f"{s.department_id or '*'}@{s.location_id or '*'}" for s in scopes)


def find_staff_by_identifier(db: Session, email_or_mobile: str) -> User | None:
    email = normalize_email(email_or_mobile)
    user = db.query(User).filter(User.email == email).first() if email else None
    if user is None:
        mobile = normalize_mobile(email_or_mobile)
        if mobile:
            user = db.query(User).filter(User.mobile == mobile).first()
    return user


def visible_reset_tickets(ctx: AccessContext) -> list[tuple[PasswordResetTicket, User | None]]:
    """Reset tickets the actor may act on: tickets for users they manage (the
    Super Admin also sees tickets that match no account)."""
    tickets = ctx.db.query(PasswordResetTicket).order_by(PasswordResetTicket.created_at.desc()).all()
    visible = []
    for ticket in tickets:
        user = find_staff_by_identifier(ctx.db, ticket.email_or_id)
        if ctx.is_super_admin or (user is not None and ctx.can_manage_user(user)):
            visible.append((ticket, user))
    return visible
