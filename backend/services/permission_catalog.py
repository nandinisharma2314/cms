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
    "complaint.view": ("Complaints", "View complaints in assigned area"),
    "complaint.create": ("Complaints", "Register complaints for citizens"),
    "complaint.respond": ("Complaints", "Reply and update complaint progress"),
    "complaint.resolve": ("Complaints", "Mark complaints as solved"),
    "complaint.close": ("Complaints", "Close solved complaints or reopen them"),
    "complaint.receive": ("Complaints", "Auto-receive new complaints from system"),
    "complaint.assign": ("Complaints", "Assign complaints to staff"),
    "complaint.reassign": ("Complaints", "Move complaints to another staff member"),
    "complaint.reject.request": ("Complaints", "Ask to reject a complaint"),
    "complaint.reject.approve": ("Complaints", "Approve or deny rejection requests"),
    "complaint.reclassify": ("Complaints", "Change department, category, area, or priority"),

    "user.view": ("Staff Users", "View staff members in assigned area"),
    "user.create": ("Staff Users", "Add staff members under your role"),
    "user.update": ("Staff Users", "Edit staff details under your role"),
    "user.deactivate": ("Staff Users", "Turn staff accounts on or off"),
    "user.reset_password": ("Staff Users", "Approve password reset for staff"),

    "end_user.view": ("Citizens", "View citizen accounts in assigned area"),
    "end_user.create": ("Citizens", "Add citizen accounts"),
    "end_user.update": ("Citizens", "Edit citizen details or turn accounts on/off"),
    "end_user.import": ("Citizens", "Upload citizen list from CSV file"),

    "department.view": ("Departments", "View departments and problem types"),
    "department.create": ("Departments", "Create new departments"),
    "department.update": ("Departments", "Edit departments and problem types"),

    "location.view": ("Areas & Locations", "View cities and areas list"),
    "location.create": ("Areas & Locations", "Create new cities and areas"),
    "location.update": ("Areas & Locations", "Edit or turn off cities and areas"),
    "location.import": ("Areas & Locations", "Upload areas list from CSV file"),

    "role.view": ("User Roles", "View roles and access levels"),
    "role.manage": ("User Roles", "Create roles and set their access"),

    "sla.manage": ("Time Limits & Delays", "Set time limits, urgency levels, and delay rules"),
    "settings.manage": ("Settings", "Edit app settings and rejection reasons"),

    "reports.view": ("Reports", "View summary charts and reports"),
    "audit.view": ("Activity History", "View activity history and change log"),

    "grievance.file": ("Staff Complaints", "File a staff complaint against a coworker or boss"),
    "grievance.view_own": ("Staff Complaints", "Track status of your own filed complaints"),
    "grievance.manage": ("Staff Complaints", "Investigate and solve staff complaints"),
    "grievance.view_all": ("Staff Complaints", "View all staff complaints (cannot see complaints against yourself)"),

    "team.view": ("My Team", "View team members and their work results"),
    "team.manage": ("My Team", "Manage team working hours and shift complaints between staff"),

    "rewards.view": ("Rewards & Points", "View rewards leaderboard, point balance and history"),
    "rewards.manage": ("Rewards & Points", "Manage reward rules and give bonus points"),

    # What end users may do in the portal. Signing in and viewing their own
    # complaints and notifications are always allowed.
    "portal.complaint.create": ("Citizen Portal", "Register new complaints"),
    "portal.complaint.attach": ("Citizen Portal", "Attach files and photos to complaints"),
    "portal.complaint.comment": ("Citizen Portal", "Reply on own open complaints"),
    "portal.complaint.confirm": ("Citizen Portal", "Confirm complaint is solved and close it"),
    "portal.complaint.reopen": ("Citizen Portal", "Reopen solved complaints if problem continues"),
    "portal.complaint.feedback": ("Citizen Portal", "Give rating and review"),
    "portal.profile.update": ("Citizen Portal", "Edit own profile details"),
}


def is_portal_permission(key: str) -> bool:
    return key.startswith(PORTAL_PREFIX)


PORTAL_PERMISSIONS = [k for k in PERMISSIONS if is_portal_permission(k)]
STAFF_PERMISSIONS = [k for k in PERMISSIONS if not is_portal_permission(k)]

_COMPLAINT_HANDLING = [
    "complaint.view", "complaint.respond", "complaint.resolve",
]
_COMPLAINT_SUPERVISION = _COMPLAINT_HANDLING + [
    "complaint.assign", "complaint.reassign", "complaint.reject.approve", "complaint.close", "complaint.reclassify",
]
_REFERENCE_DATA = ["department.view", "location.view", "role.view"]
_STAFF_GRIEVANCE_BASIC = ["grievance.file", "grievance.view_own"]
_STAFF_GRIEVANCE_FULL = _STAFF_GRIEVANCE_BASIC + ["grievance.manage", "grievance.view_all"]
_TEAM_MANAGEMENT = ["team.view", "team.manage"]

# Ordered top-down; each role's parent is the previous entry's key where given.
# key -> (name, description, parent_key, default permissions)
SYSTEM_ROLES: dict[str, tuple[str, str, str | None, list[str]]] = {
    SUPER_ADMIN_ROLE_KEY: (
        "Super Admin", "Complete system control. Holds every permission.", None, [],
    ),
    "admin": (
        "Admin", "Administrative management of users and complaints.", SUPER_ADMIN_ROLE_KEY,
        _COMPLAINT_SUPERVISION + _REFERENCE_DATA + _STAFF_GRIEVANCE_FULL + _TEAM_MANAGEMENT + [
            "complaint.create",
            "user.view", "user.create", "user.update", "user.deactivate", "user.reset_password",
            "end_user.view", "end_user.create", "end_user.update",
            "reports.view", "audit.view",
            "rewards.manage", "rewards.view",
        ],
    ),
    "manager": (
        "Manager", "Manages teams and complaints for a department and area.", "admin",
        _COMPLAINT_SUPERVISION + _REFERENCE_DATA + _STAFF_GRIEVANCE_FULL + _TEAM_MANAGEMENT + [
            "complaint.create",
            "user.view", "user.create", "user.update", "user.deactivate",
            "end_user.view",
            "reports.view",
            "rewards.view",
        ],
    ),
    "supervisor": (
        "Supervisor / Team Lead", "Supervises agents and their complaints.", "manager",
        _COMPLAINT_SUPERVISION + _STAFF_GRIEVANCE_BASIC + _TEAM_MANAGEMENT + ["user.view", "role.view", "reports.view", "rewards.view"],
    ),
    "agent": (
        "Agent", "Handles assigned complaints.", "supervisor",
        _COMPLAINT_HANDLING + _STAFF_GRIEVANCE_BASIC + ["complaint.reject.request", "complaint.receive", "rewards.view"],
    ),
    END_USER_ROLE_KEY: (
        "End User", "Everyone who signs in to the end-user portal.", None, PORTAL_PERMISSIONS,
    ),
}
