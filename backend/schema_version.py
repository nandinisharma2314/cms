"""The database schema revision this code expects (the Alembic head).
A test in tests/test_platform.py checks it matches migrations/versions."""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

EXPECTED_REVISION = "0003"


def schema_problem(engine: Engine) -> str | None:
    with engine.connect() as connection:
        if "alembic_version" not in inspect(connection).get_table_names():
            return "the database has no migration history; run `python manage.py migrate`"
        current = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
    if current != EXPECTED_REVISION:
        return f"the database schema is at revision {current}, expected {EXPECTED_REVISION}; run `python manage.py migrate`"
    return None
