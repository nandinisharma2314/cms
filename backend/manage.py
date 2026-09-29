"""Administrative commands.

    python manage.py migrate              # create/upgrade the schema and sync system data
    python manage.py create-super-admin   # create the first Super Admin (prompts for details)
    python manage.py check                # report configuration problems

`migrate` also upgrades databases created by older versions of the app (which
built tables directly without migration history): it recognises the original
schema, records it as the baseline revision and upgrades from there.
"""
import argparse
import getpass
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect

from config import BASE_DIR

BASELINE_REVISION = "0001"


def _alembic_config() -> Config:
    return Config(str(Path(BASE_DIR) / "alembic.ini"))


def migrate() -> None:
    from database import SessionLocal, engine
    from services.bootstrap_service import sync_system_data

    cfg = _alembic_config()
    tables = set(inspect(engine).get_table_names())
    if "alembic_version" not in tables and "complaints" in tables:
        print(f"Existing database without migration history: marking it as revision {BASELINE_REVISION}")
        command.stamp(cfg, BASELINE_REVISION)
    command.upgrade(cfg, "head")
    with SessionLocal() as db:
        for change in sync_system_data(db):
            print(f"  {change}")
    print("Database is up to date.")


def create_super_admin(name: str, email: str, mobile: str | None) -> None:
    from fastapi import HTTPException

    from database import SessionLocal
    from models import Role, User, max_length
    from services.permission_catalog import SUPER_ADMIN_ROLE_KEY
    from services.phone_service import phone_format
    from utils.security import hash_password, normalize_email, validate_password_strength
    from utils.text import single_line

    try:
        name = single_line(name, "Name", max_length(User.name))
    except HTTPException as exc:
        sys.exit(f"{exc.detail}.")
    clean_email = normalize_email(email)
    if clean_email is None:
        sys.exit("A valid email address is required.")
    password = getpass.getpass("Password for the Super Admin: ")
    if getpass.getpass("Repeat the password: ") != password:
        sys.exit("The passwords do not match.")
    error = validate_password_strength(password)
    if error:
        sys.exit(error)

    with SessionLocal() as db:
        role = db.query(Role).filter(Role.key == SUPER_ADMIN_ROLE_KEY).first()
        if role is None:
            sys.exit("System roles are missing; run `python manage.py migrate` first.")
        if db.query(User).filter(User.email == clean_email).first() is not None:
            sys.exit(f"An account with email {clean_email} already exists.")
        clean_mobile = None
        if mobile:
            try:
                fmt = phone_format(db)
            except HTTPException as exc:  # the phone settings are not configured yet
                sys.exit(f"{exc.detail} Leave out --mobile and add it later in the admin panel.")
            clean_mobile = fmt.normalize(mobile)
            if clean_mobile is None:
                sys.exit(f"The mobile number must be {fmt.describe()}.")
        db.add(User(name=name, email=clean_email, mobile=clean_mobile, role=role,
                    password_hash=hash_password(password), scopes=[]))
        db.commit()
    print(f"Created Super Admin {name} <{clean_email}>. Sign in to the admin panel to finish setup.")


def check() -> int:
    from database import SessionLocal, engine
    from services.bootstrap_service import system_data_problems
    from services.settings_service import configuration_problems

    script = ScriptDirectory.from_config(_alembic_config())
    head = script.get_current_head()
    with engine.connect() as connection:
        tables = set(inspect(connection).get_table_names())
        current = None
        if "alembic_version" in tables:
            current = connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar()
    if current != head:
        print(f"Database schema is at {current or 'no revision'}, expected {head}: run `python manage.py migrate`.")
        return 1
    with SessionLocal() as db:
        problems = system_data_problems(db) + [p["message"] for p in configuration_problems(db)]
    for problem in problems:
        print(f"- {problem}")
    print("No configuration problems." if not problems else f"{len(problems)} problem(s) to fix.")
    return 1 if problems else 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("migrate", help="create or upgrade the database schema and sync system data")
    admin = sub.add_parser("create-super-admin", help="create a Super Admin account")
    admin.add_argument("--name", required=True)
    admin.add_argument("--email", required=True)
    admin.add_argument("--mobile", help="optional; needs the phone settings to be configured")
    sub.add_parser("check", help="report schema and configuration problems")
    args = parser.parse_args()

    if args.command == "migrate":
        migrate()
    elif args.command == "create-super-admin":
        create_super_admin(args.name, args.email, args.mobile)
    else:
        sys.exit(check())


if __name__ == "__main__":
    main()
