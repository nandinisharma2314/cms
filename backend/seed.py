"""Resets the database and fills it with demo data.

    python seed.py

WARNING: drops every table in DATABASE_URI first. For a fresh production
database use seed_super_admin.py instead.
"""
import random
from datetime import timedelta

from sqlalchemy import MetaData

from database import SessionLocal, engine, Base
from models import (
    Complaint, ComplaintCategory, Department, EndUser, Notification, PasswordResetTicket, Role, User, UserScope,
)
from services import rejection_service, routing_service, sla_service, workflow_service
from services.access_service import AccessContext
from services.bootstrap_service import ensure_system_data
from services.complaint_service import register_complaint
from services.location_service import create_location, find_child
from utils.security import hash_password, utcnow

DEMO_PASSWORD = "Admin@123"

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

DEPARTMENTS = {
    ("Electricity", "ELEC"): ["Street Light", "Power Cut", "Fallen Pole", "Other"],
    ("Water", "WATER"): ["No Water", "Leakage", "Contaminated Water", "Other"],
    ("Roads", "ROADS"): ["Potholes", "Road Damage", "Footpath Issue", "Other"],
    ("Sanitation", "SANI"): ["Garbage Collection", "Drainage Issue", "Dead Animal", "Other"],
    ("Healthcare", "HEALTH"): ["Hospital Services", "Clinic Hygiene", "Other"],
    ("Education", "EDU"): ["School Infrastructure", "Staff Conduct", "Other"],
    ("Transport", "TRANS"): ["Bus Service", "Traffic Signal", "Other"],
    ("General", "GEN"): ["Other"],
}

TITLES = {
    "Electricity": ["Street light not working", "Transformer tripping", "Loose overhead cable", "Frequent power cuts"],
    "Water": ["No water supply since morning", "Main pipe burst", "Contaminated water supply", "Valve leaking"],
    "Roads": ["Deep pothole near flyover", "Footpath broken", "Manhole cover missing", "Road resurfacing needed"],
    "Sanitation": ["Garbage not collected", "Drain clogging", "Dead animal removal", "Open dumping site"],
    "Healthcare": ["Clinic closed during hours", "Unhygienic dispensary"],
    "Education": ["School roof leaking", "Broken classroom furniture"],
    "Transport": ["Bus stop shelter damaged", "Traffic signal not working"],
    "General": ["Stray cattle on road", "Noise complaint"],
}


def reset_database() -> None:
    # Reflect first so tables from older schemas are dropped too.
    existing = MetaData()
    existing.reflect(bind=engine)
    existing.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def location_by_path(db, *names):
    node = None
    for name in names:
        node = find_child(db, node, name)
    return node


ACK_NOTES = [None, "Thank you, we have noted the issue.", "A field team has been informed."]
RESOLUTIONS = [
    "Repaired by the field team and verified on site.",
    "Issue fixed; the area has been inspected.",
    "Work completed as per the complaint.",
]
DEPARTMENT_WEIGHTS = {"Electricity": 30, "Water": 20, "Roads": 12, "Sanitation": 12,
                      "Healthcare": 7, "Education": 6, "Transport": 7, "General": 6}
# how far along each seeded complaint gets, by age: recent ones are still
# being worked on, older ones are mostly finished (leaving a small backlog)
STAGE_WEIGHTS = {"ASSIGNED": 12, "ACKNOWLEDGED": 10, "IN_PROGRESS": 18, "WAITING": 6,
                 "RESOLVED": 18, "CLOSED": 30, "REJECTED": 6, "REJECTION_PENDING": 5}
OLD_STAGE_WEIGHTS = {"IN_PROGRESS": 4, "WAITING": 2, "RESOLVED": 10, "CLOSED": 78, "REJECTED": 6}


def seed_complaints(db, rng, departments, end_users, count=240) -> None:
    """Creates complaints through the real workflow (routing, actions, comments)
    with back-dated timestamps, so timelines look like real usage."""
    now = utcnow()
    admin_ctx = AccessContext(db, db.query(User).filter(User.email == "admin@civiccare.gov.in").one())
    contexts: dict[int, AccessContext] = {}
    created_times = sorted(now - timedelta(days=rng.randint(0, 45), hours=rng.randint(0, 23)) for _ in range(count))

    for created_at in created_times:
        end_user = rng.choice(end_users)
        department = departments[rng.choices(list(DEPARTMENT_WEIGHTS), weights=list(DEPARTMENT_WEIGHTS.values()))[0]]
        # most complaints are about the end user's own area
        location = end_user.location if rng.random() < 0.7 else location_by_path(db, *rng.choice(LOCATIONS))
        complaint = register_complaint(
            db,
            department=department,
            category=rng.choice(department.categories),
            location=location,
            priority=rng.choices(["Low", "Medium", "High", "Critical"], weights=[30, 45, 20, 5])[0],
            title=rng.choice(TITLES[department.name]),
            description=f"Reported by {end_user.name}: {department.name.lower()} issue in {location.name}.",
            end_user=end_user,
            at=created_at,
        )
        db.flush()
        age = now - created_at
        ts = created_at
        if complaint.assigned_to is None:
            if age < timedelta(days=3):
                continue  # still waiting in the department queue
            # nobody below the admin covers it: the admin picks it up herself
            ts = min(ts + timedelta(hours=rng.uniform(4, 30)), now)
            routing_service.assign(db, complaint, admin_ctx.user, actor=admin_ctx.user, method="manual",
                                   reason="No officer covers this department here", at=ts)

        def later(low: float, high: float):
            nonlocal ts
            ts = min(ts + timedelta(hours=rng.uniform(low, high)), now)
            return ts

        weights = OLD_STAGE_WEIGHTS if age > timedelta(days=5) else STAGE_WEIGHTS
        stage = rng.choices(list(weights), weights=list(weights.values()))[0]
        if age < timedelta(days=1):
            stage = rng.choice(["ASSIGNED", "ACKNOWLEDGED"])
        handler = contexts.setdefault(complaint.assigned_to.id, AccessContext(db, complaint.assigned_to))

        def act(ctx, key, note, low, high):
            workflow_service.apply_staff_action(ctx, complaint, key, note, at=later(low, high))

        if stage == "REJECTED" and rng.random() < 0.5:
            act(admin_ctx, "reject", "Duplicate of an earlier complaint for the same spot.", 2, 30)
        elif stage in ("REJECTED", "REJECTION_PENDING") and handler.has("complaint.reject.request") \
                and not handler.has("complaint.reject.approve"):
            request = rejection_service.request_rejection(
                handler, complaint, rng.choice(rejection_service.REASON_CATEGORIES[:3]),
                "The site is outside the area this department maintains.", at=later(2, 20),
            )
            db.flush()
            if stage == "REJECTED" and request.approver is not None:
                approver = contexts.setdefault(request.approver.id, AccessContext(db, request.approver))
                if rng.random() < 0.7:
                    rejection_service.approve(approver, request, None, at=later(1, 12))
                else:
                    rejection_service.deny(approver, request, "Checked the map: it is ours. Please attend.",
                                           at=later(1, 12))
        elif stage in ("REJECTED", "REJECTION_PENDING"):
            act(admin_ctx, "reject", "Duplicate of an earlier complaint for the same spot.", 2, 30)
        elif stage != "ASSIGNED":
            act(handler, "acknowledge", rng.choice(ACK_NOTES), 1, 20)
            if stage != "ACKNOWLEDGED":
                act(handler, "start", None, 1, 24)
                if stage == "WAITING" or (stage in ("RESOLVED", "CLOSED") and rng.random() < 0.2):
                    act(handler, "request_info", "Could you share the exact landmark or a photo?", 1, 12)
                    if stage != "WAITING":
                        workflow_service.add_comment(db, complaint, end_user, "It is next to the community park gate.",
                                                     at=later(1, 24))
                if stage in ("RESOLVED", "CLOSED"):
                    act(handler, "resolve", rng.choice(RESOLUTIONS), 4, 72)
                if stage == "CLOSED" and rng.random() < 0.06:
                    # not actually fixed: the end user reopens it and it gets resolved again
                    workflow_service.end_user_reopen(db, end_user, complaint, "Still not working.", at=later(2, 48))
                    act(handler, "start", None, 1, 12)
                    act(handler, "resolve", "Replaced the faulty part this time.", 4, 48)
                if stage == "CLOSED":
                    workflow_service.end_user_confirm(
                        db, end_user, complaint, rng.choice([3, 4, 4, 5, 5]), None, at=later(1, 48),
                    )
        db.flush()

    # A few rejection requests on work in progress: one already denied, two awaiting a decision.
    open_work = [
        c for c in db.query(Complaint).filter(Complaint.status.in_(["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS"])).all()
        if c.assigned_to is not None
    ]
    requesters = [(c, contexts.setdefault(c.assigned_to.id, AccessContext(db, c.assigned_to))) for c in open_work]
    requesters = [(c, ctx) for c, ctx in requesters if rejection_service.can_request(ctx, c)]
    for index, (complaint, ctx) in enumerate(requesters[:3]):
        at = now - timedelta(hours=rng.uniform(2, 10))
        request = rejection_service.request_rejection(
            ctx, complaint, rejection_service.REASON_CATEGORIES[index % 3],
            "This location is maintained by the state highways authority, not us.", at=at,
        )
        db.flush()
        if index == 0 and request.approver is not None:
            rejection_service.deny(AccessContext(db, request.approver), request,
                                   "It is inside the municipal limit. Please attend.", at=at + timedelta(hours=1))
    db.flush()


def seed_database() -> None:
    reset_database()
    db = SessionLocal()
    ensure_system_data(db)
    rng = random.Random(42)
    roles = {r.key: r for r in db.query(Role).all()}

    print("--- Locations ---")
    for row in LOCATIONS:
        parent = None
        for name in row:
            parent = find_child(db, parent, name) or create_location(db, name, parent)
    db.flush()

    print("--- Departments ---")
    departments = {}
    for (name, code), categories in DEPARTMENTS.items():
        department = Department(name=name, code=code, categories=[ComplaintCategory(name=c) for c in categories])
        db.add(department)
        departments[name] = department
    db.flush()

    jaipur = location_by_path(db, "India", "Rajasthan", "Jaipur")
    jaipur_city = location_by_path(db, "India", "Rajasthan", "Jaipur", "Jaipur")
    mansarovar = location_by_path(db, "India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar")
    new_delhi = location_by_path(db, "India", "Delhi", "New Delhi")

    print("--- Staff ---")

    def staff(name, email, mobile, role_key, reports_to=None, scopes=()):
        user = User(
            name=name, email=email, mobile=mobile, role=roles[role_key], reports_to=reports_to,
            password_hash=hash_password(DEMO_PASSWORD),
            scopes=[UserScope(department=d, location=l) for d, l in scopes],
        )
        db.add(user)
        return user

    super_admin = staff("Rahul Sharma", "rahul.sharma@example.com", "9876543210", "super_admin")
    admin = staff("Ananya Verma", "admin@civiccare.gov.in", "9876543211", "admin", super_admin, [(None, None)])
    elec_manager = staff("Vikram Rathore", "manager@civiccare.gov.in", "9876543212", "manager", admin,
                         [(departments["Electricity"], jaipur)])
    elec_supervisor = staff("Priya Patel", "supervisor@civiccare.gov.in", "9876543213", "supervisor", elec_manager,
                            [(departments["Electricity"], jaipur_city)])
    staff("Amit Kumar", "agent@civiccare.gov.in", "9876543214", "agent", elec_supervisor,
          [(departments["Electricity"], mansarovar)])
    # city-wide agent: gets Jaipur electricity complaints outside Mansarovar
    staff("Rohit Jain", "rohit.jain@civiccare.gov.in", "9876543218", "agent", elec_supervisor,
          [(departments["Electricity"], jaipur_city)])
    water_manager = staff("Suresh Meena", "water.manager@civiccare.gov.in", "9876543215", "manager", admin,
                          [(departments["Water"], jaipur)])
    staff("Neha Singh", "water.agent@civiccare.gov.in", "9876543216", "agent", water_manager,
          [(departments["Water"], mansarovar)])
    staff("Farhan Ali", "farhan.ali@civiccare.gov.in", "9876543219", "agent", water_manager,
          [(departments["Water"], jaipur)])
    staff("Karan Mehta", "delhi.agent@civiccare.gov.in", "9876543217", "agent", admin,
          [(departments["Electricity"], new_delhi)])
    rajasthan = location_by_path(db, "India", "Rajasthan")
    delhi = location_by_path(db, "India", "Delhi")
    staff("Sunil Verma", "roads.agent@civiccare.gov.in", "9876543220", "agent", admin,
          [(departments["Roads"], rajasthan)])
    staff("Pooja Sharma", "sanitation.agent@civiccare.gov.in", "9876543221", "agent", admin,
          [(departments["Sanitation"], jaipur)])
    # all departments in Delhi: picked only when no department-specific agent matches
    staff("Imran Khan", "delhi.general@civiccare.gov.in", "9876543222", "agent", admin,
          [(None, delhi)])

    print("--- End users ---")
    end_users = [
        EndUser(external_id="USR001", name="Rahul Sharma", mobile="9876543210", email="rahul@example.com",
                location=mansarovar),
        EndUser(external_id="USR002", name="Amit Kumar", mobile="9876543211", email="amit@example.com",
                location=location_by_path(db, "India", "Rajasthan", "Jaipur", "Jaipur", "Malviya Nagar")),
        EndUser(external_id="USR003", name="Sunita Devi", mobile="9876543212", email="sunita@example.com",
                location=location_by_path(db, "India", "Delhi", "New Delhi", "New Delhi", "Connaught Place")),
        EndUser(external_id="USR004", name="Mohan Lal", mobile="9876543213", email="mohan@example.com",
                location=location_by_path(db, "India", "Rajasthan", "Jodhpur", "Jodhpur", "Sardarpura")),
    ]
    db.add_all(end_users)
    db.flush()

    print("--- Complaints ---")
    seed_complaints(db, rng, departments, end_users)

    db.add(PasswordResetTicket(
        ticket_id="RST-4821",
        email_or_id="agent@civiccare.gov.in",
        department="Electricity",
        reason="Device replacement; locked out of officer app.",
        status="Pending Approval",
        created_at=utcnow() - timedelta(hours=3),
    ))

    db.commit()

    print("--- SLA check ---")
    print(sla_service.run_check(db))
    # Old history shouldn't flood the demo inboxes.
    cutoff = utcnow() - timedelta(days=2)
    db.query(Notification).filter(Notification.created_at < cutoff).update(
        {Notification.read_at: Notification.created_at}, synchronize_session=False,
    )
    db.commit()
    db.close()
    print("Database seeding completed successfully.")
    print(f"All staff accounts use the password {DEMO_PASSWORD!r}.")


if __name__ == "__main__":
    seed_database()
