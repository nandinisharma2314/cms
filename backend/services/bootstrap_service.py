"""System data that the code itself depends on, synced by `python manage.py migrate`.

This is structure, not business data: the permission catalog, the system roles
(with their default grants on first creation) and the empty settings row. It
never creates departments, locations, priorities, SLA targets or accounts;
administrators configure those.
"""
from sqlalchemy.orm import Session

from models import Permission, Role, SystemSettings
from services.permission_catalog import PERMISSIONS, SYSTEM_ROLES
from services.settings_service import SETTINGS_ID


def sync_system_data(db: Session) -> list[str]:
    """Idempotently creates missing permissions, system roles and the settings
    row, and removes permissions the code no longer knows (with their grants).
    Existing role grants are left alone so the Super Admin's changes survive;
    a permission that is new to the catalog is granted to the system roles
    whose defaults include it. Returns what changed. Commits."""
    changes: list[str] = []
    permissions = {p.key: p for p in db.query(Permission).all()}
    for key in sorted(set(permissions) - set(PERMISSIONS)):
        db.delete(permissions.pop(key))  # role_permissions rows go with it (ON DELETE CASCADE)
        changes.append(f"removed permission {key}")
    db.flush()
    new_keys: set[str] = set()
    for key, (group, description) in PERMISSIONS.items():
        permission = permissions.get(key)
        if permission is None:
            permission = Permission(key=key, group=group, description=description)
            db.add(permission)
            permissions[key] = permission
            new_keys.add(key)
            changes.append(f"added permission {key}")
        elif (permission.group, permission.description) != (group, description):
            permission.group, permission.description = group, description
            changes.append(f"updated permission {key}")
    db.flush()

    roles = {r.key: r for r in db.query(Role).all()}
    for key, (name, description, parent_key, default_permissions) in SYSTEM_ROLES.items():
        if key in roles:
            existing = roles[key]
            for permission_key in sorted(new_keys & set(default_permissions)):
                existing.permissions.append(permissions[permission_key])
                changes.append(f"granted {permission_key} to {key}")
            continue
        role = Role(
            key=key,
            name=name,
            description=description,
            parent=roles[parent_key] if parent_key else None,
            is_system=True,
            permissions=[permissions[p] for p in default_permissions],
        )
        db.add(role)
        roles[key] = role
        changes.append(f"created role {key}")

    if db.get(SystemSettings, SETTINGS_ID) is None:
        db.add(SystemSettings(id=SETTINGS_ID, sms_notifications_enabled=False, email_notifications_enabled=False))
        changes.append("created the settings row")

    db.commit()
    return changes


def system_data_problems(db: Session) -> list[str]:
    """What `sync_system_data` would still have to do; empty when in sync."""
    problems = []
    known = {key for (key,) in db.query(Permission.key).all()}
    missing = sorted(set(PERMISSIONS) - known)
    if missing:
        problems.append(f"permissions missing from the database: {', '.join(missing)}")
    stale = sorted(known - set(PERMISSIONS))
    if stale:
        problems.append(f"permissions no longer in the code: {', '.join(stale)}")
    roles = {key for (key,) in db.query(Role.key).all()}
    missing_roles = sorted(set(SYSTEM_ROLES) - roles)
    if missing_roles:
        problems.append(f"system roles missing: {', '.join(missing_roles)}")
    if db.get(SystemSettings, SETTINGS_ID) is None:
        problems.append("the settings row is missing")
    return problems
