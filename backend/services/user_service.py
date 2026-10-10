from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from models import RESET_PENDING, Department, Location, PasswordResetTicket, Role, User, UserScope
from services.access_service import AccessContext
from services.location_service import path_names, require_usable, serialize_location
from services.permission_catalog import SUPER_ADMIN_ROLE_KEY
from services.phone_service import phone_format
from utils.security import normalize_email


def serialize_role(role: Role) -> dict:
    return {"id": role.id, "key": role.key, "name": role.name}


def serialize_users(db: Session, users: list[User], ctx: AccessContext | None = None) -> list[dict]:
    all_locations = [s.location for u in users for s in u.scopes if s.location] + [
        u.primary_location for u in users if u.primary_location
    ]
    names = path_names(db, all_locations)
    result = []
    for u in users:
        item = {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "mobile": u.mobile,
            "aadhar": u.aadhar,
            "pan_card": u.pan_card,
            "avatar_url": u.avatar_url,
            "reward_points_balance": getattr(u, "reward_points_balance", 0) or 0,
            "lifetime_reward_points": getattr(u, "lifetime_reward_points", 0) or 0,
            "role": serialize_role(u.role),
            "reports_to": (
                {"id": u.reports_to.id, "name": u.reports_to.name, "designation": u.reports_to.role.name}
                if u.reports_to
                else None
            ),
            "primary_department": (
                {"id": u.primary_department.id, "name": u.primary_department.name}
                if u.primary_department
                else None
            ),
            "primary_location": serialize_location(u.primary_location, names) if u.primary_location else None,
            "custom_permissions": [
                {
                    "id": up.permission.id,
                    "key": up.permission.key,
                    "group": up.permission.group,
                    "description": up.permission.description,
                    "is_granted": up.is_granted,
                }
                for up in getattr(u, "custom_permissions", [])
                if up.permission
            ],
            "scopes": [
                {
                    "department": {"id": s.department.id, "name": s.department.name} if s.department else None,
                    "location": serialize_location(s.location, names),
                }
                for s in u.scopes
            ],
            "is_active": u.is_active,
            "is_available": u.is_available,
            "must_change_password": u.must_change_password,
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
        department_id = item["department_id"]
        location_id = item["location_id"]
        if (department_id, location_id) in seen:
            continue
        seen.add((department_id, location_id))

        department = None
        if department_id is not None:
            department = db.get(Department, department_id)
            if department is None or not department.is_active:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Department {department_id} not found or inactive")
        location = None
        if location_id is not None:
            location = require_usable(db, db.get(Location, location_id))

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


def login_identifier_key(db: Session, identifier: str) -> str:
    """The identifier in one canonical form (normalized email or national mobile number)."""
    email = normalize_email(identifier)
    if email is not None:
        return f"email:{email}"
    mobile = phone_format(db).normalize(identifier)
    return f"mobile:{mobile}" if mobile is not None else f"raw:{identifier.strip().lower()[:100]}"


def find_staff_by_identifier(db: Session, identifier: str) -> User | None:
    """The staff account whose email or mobile matches (both are unique)."""
    email = normalize_email(identifier)
    if email is not None:
        return db.query(User).filter(User.email == email).first()
    mobile = phone_format(db).normalize(identifier)
    if mobile is None:
        return None
    return db.query(User).filter(User.mobile == mobile).first()


def can_handle_reset_ticket(ctx: AccessContext, ticket: PasswordResetTicket) -> bool:
    """Tickets for users the actor manages; the Super Admin also handles tickets that matched no account."""
    if ticket.user is None:
        return ctx.is_super_admin
    return ctx.can_manage_user(ticket.user)


def visible_reset_tickets(ctx: AccessContext, pending_only: bool) -> list[PasswordResetTicket]:
    """Reset tickets the actor may act on, newest first. Who may handle a ticket
    depends on the hierarchy, so this is filtered in Python."""
    query = ctx.db.query(PasswordResetTicket).options(joinedload(PasswordResetTicket.user))
    if pending_only:
        query = query.filter(PasswordResetTicket.status == RESET_PENDING)
    tickets = query.order_by(PasswordResetTicket.created_at.desc(), PasswordResetTicket.id.desc()).all()
    return [t for t in tickets if can_handle_reset_ticket(ctx, t)]
