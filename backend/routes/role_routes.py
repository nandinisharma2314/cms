import re

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func

from models import Permission, Role, User
from services import audit_service
from services.access_service import AccessContext
from services.permission_catalog import PERMISSIONS, SUPER_ADMIN_ROLE_KEY
from utils.auth_middleware import require_permission

router = APIRouter()

ROLE_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,49}$")


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
    depth, current, seen = 0, role, set()
    while current.parent_id and current.parent_id not in seen:
        seen.add(current.id)
        current = roles_by_id[current.parent_id]
        depth += 1
    return depth


def _serialize(ctx: AccessContext, roles: list[Role]) -> list[dict]:
    counts = dict(ctx.db.query(User.role_id, func.count(User.id)).group_by(User.role_id).all())
    roles_by_id = ctx.roles_by_id
    ordered = sorted(roles, key=lambda r: (_depth(r, roles_by_id), r.name))
    return [
        {
            "id": r.id,
            "key": r.key,
            "name": r.name,
            "description": r.description,
            "parent_id": r.parent_id,
            "depth": _depth(r, roles_by_id),
            "is_system": r.is_system,
            "is_root": r.key == SUPER_ADMIN_ROLE_KEY,
            # the Super Admin implicitly holds every permission
            "permissions": sorted(PERMISSIONS) if r.key == SUPER_ADMIN_ROLE_KEY
            else sorted(p.key for p in r.permissions),
            "user_count": counts.get(r.id, 0),
            "assignable": ctx.is_role_below(r),
            "editable": ctx.has("role.manage") and ctx.is_role_below(r),
        }
        for r in ordered
    ]


def _resolve_permissions(ctx: AccessContext, keys: list[str]) -> list[Permission]:
    unknown_or_ungrantable = [k for k in keys if not ctx.has(k)]
    if unknown_or_ungrantable:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"You cannot grant: {', '.join(sorted(unknown_or_ungrantable))}",
        )
    return ctx.db.query(Permission).filter(Permission.key.in_(keys)).all() if keys else []


def _parent_for(ctx: AccessContext, parent_id: int, role: Role | None = None) -> Role:
    parent = ctx.db.get(Role, parent_id)
    if parent is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Parent role not found")
    if parent.id != ctx.role.id and not ctx.is_role_below(parent):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Parent role must be your own role or below it")
    if role is not None and (parent.id == role.id or ctx.is_role_below(parent, above=role)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A role cannot be placed under itself or its own descendants")
    return parent


@router.get("/permissions")
def list_permissions(ctx: AccessContext = Depends(require_permission("role.view"))):
    return [
        {"key": p.key, "group": p.group, "description": p.description}
        for p in ctx.db.query(Permission).order_by(Permission.id).all()
    ]


@router.get("/")
def list_roles(ctx: AccessContext = Depends(require_permission("role.view"))):
    return _serialize(ctx, list(ctx.roles_by_id.values()))


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_role(payload: CreateRoleRequest, request: Request, ctx: AccessContext = Depends(require_permission("role.manage"))):
    db = ctx.db
    key = payload.key.strip().lower()
    if not ROLE_KEY_PATTERN.match(key):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Key must be 2-50 lowercase letters, digits or underscores, starting with a letter")
    if db.query(Role).filter(Role.key == key).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Role key '{key}' already exists")
    name = payload.name.strip()
    if not name or len(name) > 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name is required (max 100 characters)")

    role = Role(
        key=key, name=name, description=(payload.description or "").strip()[:255] or None,
        parent=_parent_for(ctx, payload.parent_id),
        permissions=_resolve_permissions(ctx, payload.permissions),
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
def update_role(role_id: int, payload: UpdateRoleRequest, request: Request, ctx: AccessContext = Depends(require_permission("role.manage"))):
    db = ctx.db
    role = db.get(Role, role_id)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    if not ctx.is_role_below(role):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit roles below your own")

    before = {
        "name": role.name, "description": role.description, "parent_id": role.parent_id,
        "permissions": sorted(p.key for p in role.permissions),
    }
    if payload.name is not None:
        name = payload.name.strip()
        if not name or len(name) > 100:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name is required (max 100 characters)")
        role.name = name
    if payload.description is not None:
        role.description = payload.description.strip()[:255] or None
    if payload.parent_id is not None and payload.parent_id != role.parent_id:
        role.parent = _parent_for(ctx, payload.parent_id, role)
    if payload.permissions is not None:
        # Keep grants the actor cannot see/grant; only toggle the ones they hold.
        kept = [p for p in role.permissions if not ctx.has(p.key)]
        role.permissions = kept + _resolve_permissions(ctx, payload.permissions)
    db.flush()

    after = {
        "name": role.name, "description": role.description, "parent_id": role.parent_id,
        "permissions": sorted(p.key for p in role.permissions),
    }
    changes = audit_service.diff(before, after)
    if changes:
        audit_service.record(
            db, actor=ctx.user, action="role.update", entity_type="role", entity_id=role.id,
            summary=f"Updated role {role.name}: {', '.join(changes)}", changes=changes, request=request,
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
