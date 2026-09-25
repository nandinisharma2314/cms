from sqlalchemy.orm import Session

from models import EscalationRule, LocationType, Permission, Role, SlaRule
from services.permission_catalog import DEFAULT_LOCATION_TYPES, PERMISSIONS, SYSTEM_ROLES
from services.sla_service import DEFAULT_ESCALATION_RULES, DEFAULT_SLA_RULES


def ensure_system_data(db: Session) -> None:
    """Idempotently creates the permission catalog, the system roles and the
    default location levels. Existing role grants are left alone so changes
    made by the Super Admin survive restarts; only a permission that is new to
    the catalog is granted to the system roles whose defaults include it. Commits."""
    permissions = {p.key: p for p in db.query(Permission).all()}
    new_keys: set[str] = set()
    for key, (group, description) in PERMISSIONS.items():
        permission = permissions.get(key)
        if permission is None:
            permission = Permission(key=key, group=group, description=description)
            db.add(permission)
            permissions[key] = permission
            new_keys.add(key)
        else:
            permission.group = group
            permission.description = description
    db.flush()

    roles = {r.key: r for r in db.query(Role).all()}
    for key, (name, description, parent_key, default_permissions) in SYSTEM_ROLES.items():
        if key in roles:
            existing = roles[key]
            for permission_key in new_keys & set(default_permissions):
                existing.permissions.append(permissions[permission_key])
            continue
        role = Role(
            key=key,
            name=name,
            description=description,
            parent=roles.get(parent_key) if parent_key else None,
            is_system=True,
            permissions=[permissions[p] for p in default_permissions],
        )
        db.add(role)
        roles[key] = role

    if db.query(LocationType).count() == 0:
        for depth, (key, name) in enumerate(DEFAULT_LOCATION_TYPES):
            db.add(LocationType(key=key, name=name, depth=depth))

    if db.query(SlaRule).count() == 0:
        for priority, (response, resolution, warning) in DEFAULT_SLA_RULES.items():
            db.add(SlaRule(priority=priority, response_hours=response, resolution_hours=resolution,
                           warning_minutes=warning))
    if db.query(EscalationRule).count() == 0:
        for breach_type, (level_hours, max_level) in DEFAULT_ESCALATION_RULES.items():
            db.add(EscalationRule(breach_type=breach_type, level_hours=level_hours, max_level=max_level))

    db.commit()
