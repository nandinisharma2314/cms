
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func

from models import EndUser, Permission, Role, User, max_length
from services import audit_service, routing_service
from services.access_service import AccessContext
from services.permission_catalog import (
    END_USER_ROLE_KEY, STAFF_PERMISSIONS, SUPER_ADMIN_ROLE_KEY, is_portal_permission,
)
from utils.auth_middleware import require_permission
from utils.security import utcnow
from utils.text import machine_key, multi_line, single_line

router = APIRouter()



class CreateRoleRequest(BaseModel):
    key: str
    name: str
    description: str | None = None
    parent_id: int
    permissions: list[str] = []


class UpdateRoleRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    parent_id: int | None = None
    permissions: list[str] | None = None


def _depth(role: Role, roles_by_id: dict[int, Role]) -> int:
    depth, current, seen = 0, role, {role.id}
    while current.parent_id is not None and current.parent_id not in seen:
        current = roles_by_id[current.parent_id]
        seen.add(current.id)
        depth += 1
    return depth


def _is_end_user_role(role: Role) -> bool:
    return role.key == END_USER_ROLE_KEY


def _serialize(ctx: AccessContext, roles: list[Role]) -> list[dict]:
    counts = dict(ctx.db.query(User.role_id, func.count(User.id)).filter(User.is_active.is_(True))
                  .group_by(User.role_id).all())
    end_user_count = ctx.db.query(func.count(EndUser.id)).filter(EndUser.is_active.is_(True)).scalar()
    roles_by_id = ctx.roles_by_id
    ordered = sorted(roles, key=lambda r: (_depth(r, roles_by_id), r.name))
    return [
        {
            "id": r.id,
            "key": r.key,
            "name": r.name,
            "description": r.description,
            "audience": "end_user" if _is_end_user_role(r) else "staff",
            "parent_id": r.parent_id,
            "depth": _depth(r, roles_by_id),
            "is_system": r.is_system,
            "is_root": r.key == SUPER_ADMIN_ROLE_KEY,
            # the Super Admin implicitly holds every staff permission
            "permissions": sorted(STAFF_PERMISSIONS) if r.key == SUPER_ADMIN_ROLE_KEY
            else sorted(p.key for p in r.permissions),
            "user_count": end_user_count if _is_end_user_role(r) else counts.get(r.id, 0),
            "assignable": ctx.is_role_below(r),
            # the End User role sits outside the staff hierarchy; role managers edit it
            "editable": ctx.has("role.manage") and (_is_end_user_role(r) or ctx.is_role_below(r)),
        }
        for r in ordered
    ]


def _resolve_end_user_permissions(ctx: AccessContext, keys: list[str]) -> list[Permission]:
    """Staff never hold portal permissions, so anyone managing roles may grant them."""
    staff_keys = [k for k in keys if not is_portal_permission(k)]
    if staff_keys:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"The End User role only takes portal permissions, not: {', '.join(sorted(staff_keys))}",
        )
    found = ctx.db.query(Permission).filter(Permission.key.in_(keys)).all() if keys else []
    unknown = sorted(set(keys) - {p.key for p in found})
    if unknown:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown permissions: {', '.join(unknown)}")
    return found


def _staff_permissions(ctx: AccessContext, keys: list[str]) -> list[Permission]:
    portal_keys = [k for k in keys if is_portal_permission(k)]
    if portal_keys:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Portal permissions only apply to the End User role: {', '.join(sorted(portal_keys))}",
        )
    found = ctx.db.query(Permission).filter(Permission.key.in_(keys)).all() if keys else []
    unknown = sorted(set(keys) - {p.key for p in found})
    if unknown:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown permissions: {', '.join(unknown)}")
    return found


def _check_changes_allowed(ctx: AccessContext, current: set[str], requested: set[str]) -> None:
    """Only permissions the actor holds can be granted or taken away; grants the
    actor lacks may stay on the role untouched."""
    changed = (requested - current) | (current - requested)
    not_theirs = sorted(k for k in changed if not ctx.has(k))
    if not_theirs:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"You cannot grant or remove: {', '.join(not_theirs)}")


def _new_role_permissions(ctx: AccessContext, keys: list[str]) -> list[Permission]:
    permissions = _staff_permissions(ctx, sorted(set(keys)))
    _check_changes_allowed(ctx, set(), set(keys))
    return permissions


def _parent_for(ctx: AccessContext, parent_id: int, role: Role | None = None) -> Role:
    parent = ctx.db.get(Role, parent_id)
    if parent is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Parent role not found")
    if _is_end_user_role(parent):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Staff roles cannot sit under the End User role")
    if parent.id != ctx.role.id and not ctx.is_role_below(parent):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Parent role must be your own role or below it")
    if role is not None and (parent.id == role.id or ctx.is_role_below(parent, above=role)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A role cannot be placed under itself or its own descendants")
    return parent


@router.get("/permissions")
def list_permissions(ctx: AccessContext = Depends(require_permission("role.view"))):
    return [
        {
            "key": p.key, "group": p.group, "description": p.description,
            "audience": "end_user" if is_portal_permission(p.key) else "staff",
        }
        for p in ctx.db.query(Permission).order_by(Permission.id).all()
    ]


@router.get("/")
def list_roles(ctx: AccessContext = Depends(require_permission("role.view"))):
    return _serialize(ctx, list(ctx.roles_by_id.values()))


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_role(payload: CreateRoleRequest, request: Request,
                ctx: AccessContext = Depends(require_permission("role.manage"))):
    db = ctx.db
    key = machine_key(payload.key, max_length(Role.key))
    if db.query(Role).filter(Role.key == key).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Role key '{key}' already exists")
    name = single_line(payload.name, "Name", max_length(Role.name))

    role = Role(
        key=key, name=name,
        description=multi_line(payload.description, "Description", max_length(Role.description), required=False),
        parent=_parent_for(ctx, payload.parent_id),
        permissions=_new_role_permissions(ctx, payload.permissions),
    )
    db.add(role)
    db.flush()
    audit_service.record(
        db, actor=ctx.user, action="role.create", entity_type="role", entity_id=role.id,
        summary=f"Created role {name} under {role.parent.name}",
        changes={"permissions": [None, sorted(payload.permissions)]}, request=request,
    )
    db.commit()
    ctx.invalidate_roles()
    return next(r for r in _serialize(ctx, list(ctx.roles_by_id.values())) if r["id"] == role.id)


@router.patch("/{role_id}")
def update_role(role_id: int, payload: UpdateRoleRequest, request: Request,
                ctx: AccessContext = Depends(require_permission("role.manage"))):
    db = ctx.db
    role = db.get(Role, role_id)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    end_user_role = _is_end_user_role(role)
    if not end_user_role and not ctx.is_role_below(role):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit roles below your own")
    if end_user_role and payload.parent_id is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The End User role sits outside the staff hierarchy")

    before = {
        "name": role.name, "description": role.description, "parent_id": role.parent_id,
        "permissions": sorted(p.key for p in role.permissions),
    }
    if payload.name is not None:
        role.name = single_line(payload.name, "Name", max_length(Role.name))
    if payload.description is not None:
        role.description = multi_line(payload.description, "Description", max_length(Role.description),
                                      required=False)
    if payload.parent_id is not None and payload.parent_id != role.parent_id:
        role.parent = _parent_for(ctx, payload.parent_id, role)
    if payload.permissions is not None and end_user_role:
        role.permissions = _resolve_end_user_permissions(ctx, payload.permissions)
    elif payload.permissions is not None:
        requested = set(payload.permissions)
        permissions = _staff_permissions(ctx, sorted(requested))
        _check_changes_allowed(ctx, {p.key for p in role.permissions}, requested)
        role.permissions = permissions
    db.flush()

    after = {
        "name": role.name, "description": role.description, "parent_id": role.parent_id,
        "permissions": sorted(p.key for p in role.permissions),
    }
    changes = audit_service.diff(before, after)
    moved = 0
    respond = routing_service.RESPOND_PERMISSION
    if respond in before["permissions"] and respond not in after["permissions"]:
        # Its holders can no longer work on complaints: hand theirs to someone who can.
        for user in db.query(User).filter(User.role_id == role.id, User.is_active.is_(True)).all():
            moved += routing_service.reroute_complaints_of(db, user, ctx.user, f"the {role.name} role can no longer "
                                                           "respond to complaints", utcnow(), only_uncovered=True)
    if changes:
        audit_service.record(
            db, actor=ctx.user, action="role.update", entity_type="role", entity_id=role.id,
            summary=f"Updated role {role.name}: {', '.join(changes)}"
                    + (f"; {moved} complaint(s) re-routed" if moved else ""),
            changes=changes, request=request,
        )
    db.commit()
    ctx.invalidate_roles()
    return next(r for r in _serialize(ctx, list(ctx.roles_by_id.values())) if r["id"] == role.id)


@router.delete("/{role_id}")
def delete_role(role_id: int, request: Request, ctx: AccessContext = Depends(require_permission("role.manage"))):
    db = ctx.db
    role = db.get(Role, role_id)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    if role.is_system:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "System roles cannot be deleted")
    if not ctx.is_role_below(role):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete roles below your own")
    if db.query(User).filter(User.role_id == role.id).count():
        raise HTTPException(status.HTTP_409_CONFLICT, "Role still has users; move them to another role first")
    if db.query(Role).filter(Role.parent_id == role.id).count():
        raise HTTPException(status.HTTP_409_CONFLICT, "Other roles sit under this role; re-parent them first")
    audit_service.record(
        db, actor=ctx.user, action="role.delete", entity_type="role", entity_id=role.id,
        summary=f"Deleted role {role.name}", request=request,
    )
    db.delete(role)
    db.commit()
    return {"success": True}
