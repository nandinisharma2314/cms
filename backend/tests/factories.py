"""Test data, built through the real services (routing, workflow, SLA) so
timelines look like real usage. Used only by the test suite; the application
itself ships without any sample data."""
import random
from datetime import timedelta

from models import (
    ComplaintCategory, Department, EndUser, EscalationRule, LocationType, RejectionReason, Role, SystemSettings, User,
    UserScope,
)
from services import priority_service, rejection_service, routing_service, workflow_service
from services.access_service import AccessContext
from services.complaint_service import register_complaint
from services.location_service import create_location, find_child
from utils.security import hash_password, utcnow

PASSWORD = "Test-Password-1"
EMAIL_DOMAIN = "example.test"

SETTINGS = {
    "organisation_name": "Test Organisation",
    "product_name": "Test Complaints",
    "support_email": f"support@{EMAIL_DOMAIN}",
    "support_phone": "+91 11 2345 6789",
    "support_hours": "Mon-Fri 9:00-17:00",
    "timezone": "Asia/Kolkata",
    "complaint_id_prefix": "CMP",
    "complaint_next_number": 10001,
    "reopen_window_days": 7,
    "max_reopens": 3,
    "max_attachments_per_complaint": 5,
    "max_attachment_mb": 10,
    "allowed_attachment_types": "jpg,jpeg,png,webp,gif,pdf,mp4,mov,csv,doc,docx",
    "phone_country_code": "+91",
    "phone_number_length": 10,
    "phone_expected_prefixes": "6789",
}

LEVELS = [("country", "Country"), ("state", "State"), ("district", "District"), ("city", "City"), ("area", "Area")]

LOCATIONS = [
    ("India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar"),
    ("India", "Rajasthan", "Jaipur", "Jaipur", "Vaishali Nagar"),
    ("India", "Rajasthan", "Jaipur", "Jaipur", "Malviya Nagar"),
    ("India", "Rajasthan", "Jaipur", "Jaipur", "C-Scheme"),
    ("India", "Rajasthan", "Jodhpur", "Jodhpur", "Sardarpura"),
    ("India", "Rajasthan", "Jodhpur", "Jodhpur", "Ratanada"),
    ("India", "Delhi", "New Delhi", "New Delhi", "Connaught Place"),
    ("India", "Delhi", "New Delhi", "New Delhi", "Karol Bagh"),
]

# key, name, tone, response hours, resolution hours, warning minutes
PRIORITIES = [
    ("critical", "Critical", "critical", 24, 24, 60),
    ("high", "High", "danger", 24, 72, 120),
    ("medium", "Medium", "warning", 24, 120, 180),
    ("low", "Low", "success", 24, 168, 180),
]

# (name, code) -> [(category, default priority key)]
DEPARTMENTS = {
    ("Electricity", "ELEC"): [("Street Light", "high"), ("Power Cut", "high"), ("Fallen Pole", "critical"),
                              ("Other", "medium")],
    ("Water", "WATER"): [("No Water", "high"), ("Leakage", "medium"), ("Contaminated Water", "critical"),
                         ("Other", "medium")],
    ("Roads", "ROADS"): [("Potholes", "medium"), ("Road Damage", "medium"), ("Footpath Issue", "low"),
                         ("Other", "low")],
    ("Sanitation", "SANI"): [("Garbage Collection", "medium"), ("Drainage Issue", "high"), ("Other", "low")],
    ("Healthcare", "HEALTH"): [("Clinic Services", "high"), ("Other", "medium")],
    ("Education", "EDU"): [("School Infrastructure", "medium"), ("Other", "low")],
    ("General", "GEN"): [("Other", "low")],
}

REJECTION_REASONS = ["Outside department responsibility", "Duplicate complaint",
                     "Insufficient or false information", "Other"]

TITLES = {
    "Electricity": ["Street light not working", "Transformer tripping", "Loose overhead cable"],
    "Water": ["No water supply since morning", "Main pipe burst", "Valve leaking"],
    "Roads": ["Deep pothole near flyover", "Footpath broken", "Manhole cover missing"],
    "Sanitation": ["Garbage not collected", "Drain clogging", "Open dumping site"],
    "Healthcare": ["Clinic closed during hours"],
    "Education": ["School roof leaking"],
    "General": ["Stray cattle on road"],
}


def email(local: str) -> str:
    return f"{local}@{EMAIL_DOMAIN}"


def location_by_path(db, *names):
    node = None
    for name in names:
        node = find_child(db, node, name)
    return node


def configure(db) -> dict:
    """Settings, levels, priorities (with SLA targets), escalation, reasons."""
    settings = db.get(SystemSettings, 1)
    for key, value in SETTINGS.items():
        setattr(settings, key, value)
    for depth, (key, name) in enumerate(LEVELS):
        db.add(LocationType(key=key, name=name, depth=depth))
    priorities = {}
    for key, name, tone, response, resolution, warning in PRIORITIES:
        priorities[key] = priority_service.create(db, key, name, tone, response, resolution, warning)
    for breach_type in ("response", "resolution"):
        db.add(EscalationRule(breach_type=breach_type, department_id=None, level_hours=24, max_level=4, is_active=True))
    for position, name in enumerate(REJECTION_REASONS, start=1):
        db.add(RejectionReason(name=name, sort_order=position, is_active=True))
    db.flush()
    return priorities


def build(db, rng: random.Random, complaint_count: int) -> None:
    priorities = configure(db)
    roles = {r.key: r for r in db.query(Role).all()}

    for row in LOCATIONS:
        parent = None
        for name in row:
            parent = find_child(db, parent, name) or create_location(db, name, parent)
    db.flush()

    departments = {}
    for (name, code), categories in DEPARTMENTS.items():
        department = Department(name=name, code=code, categories=[
            ComplaintCategory(name=c, default_priority=priorities[p]) for c, p in categories
        ])
        db.add(department)
        departments[name] = department
    db.flush()

    jaipur = location_by_path(db, "India", "Rajasthan", "Jaipur")
    jaipur_city = location_by_path(db, "India", "Rajasthan", "Jaipur", "Jaipur")
    mansarovar = location_by_path(db, "India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar")
    new_delhi = location_by_path(db, "India", "Delhi", "New Delhi")
    rajasthan = location_by_path(db, "India", "Rajasthan")
    delhi = location_by_path(db, "India", "Delhi")

    def staff(name, local, mobile, role_key, reports_to=None, scopes=()):
        user = User(
            name=name, email=email(local), mobile=mobile, role=roles[role_key], reports_to=reports_to,
            password_hash=hash_password(PASSWORD), must_change_password=False,
            scopes=[UserScope(department=d, location=loc) for d, loc in scopes],
        )
        db.add(user)
        return user

    root = staff("Rahul Sharma", "root", "9876500000", "super_admin")
    admin = staff("Ananya Verma", "admin", "9876500001", "admin", root, [(None, None)])
    elec_manager = staff("Vikram Rathore", "manager", "9876500002", "manager", admin,
                         [(departments["Electricity"], jaipur)])
    elec_supervisor = staff("Priya Patel", "supervisor", "9876500003", "supervisor", elec_manager,
                            [(departments["Electricity"], jaipur_city)])
    staff("Amit Kumar", "agent", "9876500004", "agent", elec_supervisor, [(departments["Electricity"], mansarovar)])
    staff("Rohit Jain", "city.agent", "9876500005", "agent", elec_supervisor,
          [(departments["Electricity"], jaipur_city)])
    water_manager = staff("Suresh Meena", "water.manager", "9876500006", "manager", admin,
                          [(departments["Water"], jaipur)])
    staff("Neha Singh", "water.agent", "9876500007", "agent", water_manager, [(departments["Water"], mansarovar)])
    staff("Farhan Ali", "water.district", "9876500008", "agent", water_manager, [(departments["Water"], jaipur)])
    staff("Karan Mehta", "delhi.agent", "9876500009", "agent", admin, [(departments["Electricity"], new_delhi)])
    staff("Sunil Verma", "roads.agent", "9876500010", "agent", admin, [(departments["Roads"], rajasthan)])
    staff("Pooja Sharma", "sanitation.agent", "9876500011", "agent", admin, [(departments["Sanitation"], jaipur)])
    staff("Imran Khan", "delhi.general", "9876500012", "agent", admin, [(None, delhi)])
    db.flush()

    end_users = [
        EndUser(external_id="USR001", name="Rahul Sharma", mobile="9876543210", email="rahul@example.test",
                location=mansarovar),
        EndUser(external_id="USR002", name="Amit Kumar", mobile="9876543211", email="amit@example.test",
                location=location_by_path(db, "India", "Rajasthan", "Jaipur", "Jaipur", "Malviya Nagar")),
        EndUser(external_id="USR003", name="Sunita Devi", mobile="9876543212", email="sunita@example.test",
                location=location_by_path(db, "India", "Delhi", "New Delhi", "New Delhi", "Connaught Place")),
        EndUser(external_id="USR004", name="Mohan Lal", mobile="9876543213", email="mohan@example.test",
                location=location_by_path(db, "India", "Rajasthan", "Jodhpur", "Jodhpur", "Sardarpura")),
    ]
    db.add_all(end_users)
    db.flush()

    _complaints(db, rng, departments, end_users, admin, complaint_count)
    db.commit()


def _complaints(db, rng, departments, end_users, admin, count) -> None:
    now = utcnow()
    admin_ctx = AccessContext(db, admin)
    contexts: dict[int, AccessContext] = {}
    reasons = rejection_service.list_reasons(db)
    created_times = sorted(now - timedelta(days=rng.randint(0, 45), hours=rng.randint(0, 23)) for _ in range(count))

    for created_at in created_times:
        end_user = rng.choice(end_users)
        department = departments[rng.choice(list(TITLES))]
        location = end_user.location if rng.random() < 0.7 else location_by_path(db, *rng.choice(LOCATIONS))
        category = rng.choice(department.categories)
        complaint = register_complaint(
            db, department=department, category=category, location=location, priority=category.default_priority,
            title=rng.choice(TITLES[department.name]),
            description=f"{department.name} issue in {location.name}.", end_user=end_user, at=created_at,
        )
        db.flush()
        age = now - created_at
        ts = created_at
        if complaint.assigned_to is None:
            if age < timedelta(days=3):
                continue  # still waiting in the department queue
            ts = min(ts + timedelta(hours=rng.uniform(4, 30)), now)
            routing_service.assign(db, complaint, admin, actor=admin, method="manual",
                                   reason="Nobody below covers this department here", at=ts)

        def later(low: float, high: float):
            nonlocal ts
            ts = min(ts + timedelta(hours=rng.uniform(low, high)), now)
            return ts

        stage = rng.choices(["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REJECTED"],
                            weights=[10, 10, 15, 15, 40, 10])[0]
        if age < timedelta(days=1):
            stage = rng.choice(["ASSIGNED", "ACKNOWLEDGED"])
        handler = contexts.setdefault(complaint.assigned_to.id, AccessContext(db, complaint.assigned_to))

        def act(ctx, key, note, low, high, reason_id=None, complaint=complaint):
            workflow_service.apply_staff_action(ctx, complaint, key, note, reason_id, at=later(low, high))

        if stage == "REJECTED":
            act(admin_ctx, "reject", "Duplicate of an earlier complaint for the same spot.", 2, 30,
                reason_id=reasons[1].id)
        elif stage != "ASSIGNED":
            act(handler, "acknowledge", None, 1, 20)
            if stage != "ACKNOWLEDGED":
                act(handler, "start", None, 1, 24)
                if stage in ("RESOLVED", "CLOSED"):
                    act(handler, "resolve", "Fixed and checked on site.", 4, 72)
                if stage == "CLOSED":
                    workflow_service.end_user_confirm(db, end_user, complaint, rng.choice([3, 4, 5]), None,
                                                      at=later(1, 48))
        db.flush()
