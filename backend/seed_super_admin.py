"""Bootstraps a fresh database: creates the tables, the permission catalog,
the system roles and the root Super Admin account. Safe to re-run; it only
creates or updates the Super Admin and never touches other users.

    python seed_super_admin.py [email] [password] [name] [mobile]

Every other account (Admins, Managers, Supervisors, Agents) is created from the
admin panel under Users.
"""
import sys

from database import SessionLocal, engine, Base
from models import Role, User
from services.bootstrap_service import ensure_system_data
from services.permission_catalog import SUPER_ADMIN_ROLE_KEY
from utils.security import hash_password, normalize_email, normalize_mobile, validate_password_strength


def seed_super_admin(
    name: str = "Rahul Sharma",
    email: str = "rahul.sharma@example.com",
    password: str = "Admin@123",
    mobile: str = "+91 9876543210",
):
    error = validate_password_strength(password)
    if error:
        sys.exit(error)

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    ensure_system_data(db)
    role = db.query(Role).filter(Role.key == SUPER_ADMIN_ROLE_KEY).one()
    clean_email = normalize_email(email)

    super_admin = db.query(User).filter(User.email == clean_email).first()
    if super_admin is None:
        super_admin = User(email=clean_email)
        db.add(super_admin)
        print(f"Created Super Admin: {name} <{clean_email}>")
    else:
        print(f"Updated existing account {clean_email} to Super Admin")
    super_admin.name = name
    super_admin.mobile = normalize_mobile(mobile)
    super_admin.password_hash = hash_password(password)
    super_admin.role = role
    super_admin.is_active = True
    super_admin.scopes = []

    db.commit()
    db.close()
    print(f" Email:    {clean_email}")
    print(f" Password: {password}")
    print("Create other staff accounts from the admin panel (Users).")


if __name__ == "__main__":
    email_arg = sys.argv[1] if len(sys.argv) > 1 else "rahul.sharma@example.com"
    pwd_arg = sys.argv[2] if len(sys.argv) > 2 else "Admin@123"
    name_arg = sys.argv[3] if len(sys.argv) > 3 else "Rahul Sharma"
    mobile_arg = sys.argv[4] if len(sys.argv) > 4 else "+91 9876543210"

    seed_super_admin(name=name_arg, email=email_arg, password=pwd_arg, mobile=mobile_arg)
