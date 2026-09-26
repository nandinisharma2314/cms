"""The permissions the code knows about, and the system roles seeded on startup.

Permissions are checked by key in the routes. Roles and their grants live in the
database so the Super Admin can change them; the grants below are only the
defaults applied when a system role is first created.
"""

SUPER_ADMIN_ROLE_KEY = "super_admin"
# Every end user holds this role. It is a root of its own, outside the staff hierarchy.
END_USER_ROLE_KEY = "end_user"
PORTAL_PREFIX = "portal."

# key -> (group, description)
PERMISSIONS: dict[str, tuple[str, str]] = {
    "complaint.view": ("Complaints", "View complaints within scope"),
    "complaint.create": ("Complaints", "Register complaints on behalf of end users"),
    "complaint.respond": ("Complaints", "Acknowledge and update complaint progress"),
    "complaint.resolve": ("Complaints", "Mark complaints as resolved"),
    "complaint.close": ("Complaints", "Close resolved complaints and reopen closed ones"),
    "complaint.receive": ("Complaints", "Receive new complaints from automatic routing"),
    "complaint.assign": ("Complaints", "Assign complaints to staff"),
    "complaint.reassign": ("Complaints", "Reassign complaints between staff"),
    "complaint.reject.request": ("Complaints", "Request rejection of a complaint"),
    "complaint.reject.approve": ("Complaints", "Approve or deny rejection requests"),

    "user.view": ("Staff Users", "View staff users within scope"),
    "user.create": ("Staff Users", "Create staff users below own role"),
    "user.update": ("Staff Users", "Edit staff users below own role"),
    "user.deactivate": ("Staff Users", "Deactivate or reactivate staff users"),
    "user.reset_password": ("Staff Users", "Approve staff password reset requests"),

    "end_user.view": ("End Users", "View end users within location scope"),
    "end_user.update": ("End Users", "Edit or deactivate end users"),
    "end_user.import": ("End Users", "Import end users from CSV"),

    "department.view": ("Departments", "View departments and categories"),
    "department.create": ("Departments", "Create departments"),
    "department.update": ("Departments", "Edit departments and categories"),

    "location.view": ("Locations", "View the location hierarchy"),
    "location.create": ("Locations", "Create locations"),
    "location.update": ("Locations", "Rename or deactivate locations"),
    "location.import": ("Locations", "Import the location hierarchy from CSV"),

    "role.view": ("Roles", "View roles"),
    "role.manage": ("Roles", "Create roles and change role permissions"),

    "sla.manage": ("SLA", "Configure SLA targets and escalation rules"),

    "reports.view": ("Reports", "View dashboards and reports"),
    "audit.view": ("Audit", "View the audit log"),

    # What end users may do in the portal. Signing in and viewing their own
    # complaints and notifications are always allowed.
    "portal.complaint.create": ("End User Portal", "Register new complaints"),
    "portal.complaint.attach": ("End User Portal", "Attach files to complaints and replies"),
    "portal.complaint.comment": ("End User Portal", "Reply on their own open complaints"),
    "portal.complaint.confirm": ("End User Portal", "Confirm a resolution, closing the complaint"),
    "portal.complaint.reopen": ("End User Portal", "Reopen resolved or closed complaints"),
    "portal.complaint.feedback": ("End User Portal", "Rate resolved complaints"),
    "portal.profile.update": ("End User Portal", "Edit their own profile details"),
}


def is_portal_permission(key: str) -> bool:
    return key.startswith(PORTAL_PREFIX)


PORTAL_PERMISSIONS = [k for k in PERMISSIONS if is_portal_permission(k)]
STAFF_PERMISSIONS = [k for k in PERMISSIONS if not is_portal_permission(k)]

_COMPLAINT_HANDLING = [
    "complaint.view", "complaint.respond", "complaint.resolve",
]
_COMPLAINT_SUPERVISION = _COMPLAINT_HANDLING + [
    "complaint.assign", "complaint.reassign", "complaint.reject.approve", "complaint.close",
]
_REFERENCE_DATA = ["department.view", "location.view", "role.view"]

# Ordered top-down; each role's parent is the previous entry's key where given.
# key -> (name, description, parent_key, default permissions)
SYSTEM_ROLES: dict[str, tuple[str, str, str | None, list[str]]] = {
    SUPER_ADMIN_ROLE_KEY: (
        "Super Admin", "Complete system control. Holds every permission.", None, [],
    ),
    "admin": (
        "Admin", "Administrative management of users and complaints.", SUPER_ADMIN_ROLE_KEY,
        _COMPLAINT_SUPERVISION + _REFERENCE_DATA + [
            "complaint.create",
            "user.view", "user.create", "user.update", "user.deactivate", "user.reset_password",
            "end_user.view", "end_user.update",
            "reports.view", "audit.view",
        ],
    ),
    "manager": (
        "Manager", "Manages teams and complaints for a department and area.", "admin",
        _COMPLAINT_SUPERVISION + _REFERENCE_DATA + [
            "complaint.create",
            "user.view", "user.create", "user.update", "user.deactivate",
            "end_user.view",
            "reports.view",
        ],
    ),
    "supervisor": (
        "Supervisor / Team Lead", "Supervises agents and their complaints.", "manager",
        _COMPLAINT_SUPERVISION + ["user.view", "role.view", "reports.view"],
    ),
    "agent": (
        "Agent", "Handles assigned complaints.", "supervisor",
        _COMPLAINT_HANDLING + ["complaint.reject.request", "complaint.receive"],
    ),
    END_USER_ROLE_KEY: (
        "End User", "Everyone who signs in to the end-user portal.", None, PORTAL_PERMISSIONS,
    ),
}

# depth -> (key, name). The CSV importer expects one column per level, by key.
DEFAULT_LOCATION_TYPES: list[tuple[str, str]] = [
    ("country", "Country"),
    ("state", "State"),
    ("district", "District"),
    ("city", "City"),
    ("area", "Area"),
]
