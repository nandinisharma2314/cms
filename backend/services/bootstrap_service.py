"""System data that the code depends on, synced by `python manage.py migrate`.

Idempotently synchronizes:
1. Permission catalog and system roles (with default grants).
2. SystemSettings row and complete business defaults.
3. Default location hierarchy levels (Country -> State -> District -> City -> Area).
4. Default priorities (Critical, High, Medium, Low) with matching SLA targets.
5. Default escalation rules for response and resolution breaches.
6. Default rejection reason categories.
7. Default gamification rewards settings, badges, and perks catalog.
8. Initial Super Admin user (configured via environment variables or defaults).
"""
import os
from sqlalchemy.orm import Session

from models import (
    EscalationRule, LocationType, Permission, Priority, RejectionReason, Role,
    SlaRule, SystemSettings, User,
)
from services.permission_catalog import PERMISSIONS, SUPER_ADMIN_ROLE_KEY, SYSTEM_ROLES
from services.reward_service import get_reward_settings, list_perks
from services.settings_service import SETTINGS_ID
from utils.security import hash_password


DEFAULT_SYSTEM_SETTINGS = {
    "organisation_name": "Complaint Management",
    "product_name": "Grievance Redressal Portal",
    "timezone": "Asia/Kolkata",
    "complaint_id_prefix": "CMP",
    "complaint_next_number": 1001,
    "reopen_window_days": 7,
    "max_reopens": 2,
    "max_attachments_per_complaint": 5,
    "max_attachment_mb": 10,
    "allowed_attachment_types": "jpg,jpeg,png,webp,pdf,csv,doc,docx",
    "phone_country_code": "+91",
    "phone_number_length": 10,
    "phone_expected_prefixes": "",
    "support_email": "support@example.com",
    "support_phone": "+919876543210",
    "support_hours": "9:00 AM - 6:00 PM IST",
    "sms_notifications_enabled": False,
    "email_notifications_enabled": False,
}

DEFAULT_LOCATION_LEVELS = [
    ("country", "Country", 0),
    ("state", "State", 1),
    ("district", "District", 2),
    ("city", "City", 3),
    ("area", "Area / Zone", 4),
]

DEFAULT_PRIORITIES = [
    ("critical", "Critical", "critical", 1, 2, 12, 30),
    ("high", "High", "danger", 2, 4, 24, 60),
    ("medium", "Medium", "warning", 3, 12, 48, 120),
    ("low", "Low", "info", 4, 24, 72, 240),
]

DEFAULT_REJECTION_REASONS = [
    ("Incomplete or inaccurate information", 1),
    ("Duplicate complaint", 2),
    ("Outside organisation jurisdiction", 3),
    ("Invalid or non-actionable grievance", 4),
]


def sync_system_data(db: Session) -> list[str]:
    """Idempotently creates or updates permissions, system roles, settings,
    hierarchies, SLA targets, and the initial Super Admin account. Commits."""
    changes: list[str] = []

    # 1. Permissions
    permissions = {p.key: p for p in db.query(Permission).all()}
    for key in sorted(set(permissions) - set(PERMISSIONS)):
        db.delete(permissions.pop(key))
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

    # 2. System roles
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
    db.flush()

    # 3. SystemSettings row and defaults
    settings = db.get(SystemSettings, SETTINGS_ID)
    if settings is None:
        settings = SystemSettings(id=SETTINGS_ID)
        db.add(settings)
        changes.append("created the settings row")

    for field, val in DEFAULT_SYSTEM_SETTINGS.items():
        cur_val = getattr(settings, field, None)
        if cur_val is None or cur_val == "":
            setattr(settings, field, val)
            changes.append(f"configured default {field}")
    db.flush()

    # 4. Location hierarchy levels
    if db.query(LocationType).count() == 0:
        for key, name, depth in DEFAULT_LOCATION_LEVELS:
            db.add(LocationType(key=key, name=name, depth=depth))
        changes.append("created default location levels (Country, State, District, City, Area / Zone)")
        db.flush()

    # 5. Priorities and SLA targets
    if db.query(Priority).count() == 0:
        for key, name, tone, rank, resp, reso, warn in DEFAULT_PRIORITIES:
            p = Priority(key=key, name=name, tone=tone, rank=rank, is_active=True)
            db.add(p)
            db.flush()
            db.add(SlaRule(priority=p, department_id=None, response_hours=resp, resolution_hours=reso, warning_minutes=warn))
        changes.append("created default priorities with SLA targets")
        db.flush()
    else:
        for p in db.query(Priority).filter(Priority.is_active.is_(True)).all():
            has_sla = db.query(SlaRule).filter(SlaRule.priority_id == p.id, SlaRule.department_id.is_(None)).first()
            if not has_sla:
                db.add(SlaRule(priority=p, department_id=None, response_hours=12, resolution_hours=48, warning_minutes=120))
                changes.append(f"created default SLA rule for priority {p.name}")
        db.flush()

    # 6. Default Escalation Rules
    for breach_type, level_hours in (("response", 4), ("resolution", 8)):
        rule = db.query(EscalationRule).filter(
            EscalationRule.breach_type == breach_type, EscalationRule.department_id.is_(None),
        ).first()
        if rule is None:
            db.add(EscalationRule(breach_type=breach_type, department_id=None, level_hours=level_hours, max_level=3, is_active=True))
            changes.append(f"created default escalation rule for {breach_type}")
    db.flush()

    # 7. Default Rejection Reasons
    if db.query(RejectionReason).count() == 0:
        for name, pos in DEFAULT_REJECTION_REASONS:
            db.add(RejectionReason(name=name, sort_order=pos, is_active=True))
        changes.append("created default rejection reasons")
        db.flush()

    # 8. Gamification rewards settings and default perks
    try:
        get_reward_settings(db)
        list_perks(db)
    except Exception:
        pass
    db.flush()

    # 9. Super Admin initial account
    super_admin_role = roles.get(SUPER_ADMIN_ROLE_KEY) or db.query(Role).filter(Role.key == SUPER_ADMIN_ROLE_KEY).first()
    if super_admin_role:
        has_superadmin = db.query(User).filter(User.role_id == super_admin_role.id).first()
        if not has_superadmin:
            admin_email = os.getenv("SUPERADMIN_EMAIL", "admin@kvontech.com").strip().lower()
            admin_password = os.getenv("SUPERADMIN_PASSWORD", "Admin@12345").strip()
            admin_name = os.getenv("SUPERADMIN_NAME", "Super Admin").strip()
            admin_mobile = os.getenv("SUPERADMIN_MOBILE", None)
            if admin_mobile:
                admin_mobile = admin_mobile.strip()

            existing_user = db.query(User).filter(User.email == admin_email).first()
            if existing_user:
                existing_user.role = super_admin_role
                changes.append(f"assigned Super Admin role to existing account ({admin_email})")
            else:
                db.add(User(
                    name=admin_name,
                    email=admin_email,
                    mobile=admin_mobile,
                    role=super_admin_role,
                    password_hash=hash_password(admin_password),
                    must_change_password=False,
                    is_active=True,
                    scopes=[],
                ))
                changes.append(f"created initial Super Admin account ({admin_email})")

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
