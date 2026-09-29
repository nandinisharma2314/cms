"""Test setup.

The suite needs a MySQL/MariaDB database it may wipe: set TEST_DATABASE_URI
(in the environment or in backend/.env.test). Its name must end in "_test".
The schema is built with the real migrations, then filled by tests/factories.py.
"""
import os
import random
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import pytest
from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
load_dotenv(BACKEND / ".env.test")

TEST_DATABASE_URI = os.environ.get("TEST_DATABASE_URI")
if not TEST_DATABASE_URI:
    raise RuntimeError("Set TEST_DATABASE_URI (environment or backend/.env.test) to a database the tests may wipe")
if not urlparse(TEST_DATABASE_URI).path.rstrip("/").endswith("_test"):
    raise RuntimeError("TEST_DATABASE_URI must point at a database whose name ends in '_test'")

TEST_UPLOADS = tempfile.mkdtemp(prefix="cms-test-uploads-")
os.environ.update({
    "APP_ENV": "test",
    "DATABASE_URI": TEST_DATABASE_URI,
    "CORS_ORIGINS": "http://admin.test,http://portal.test",
    "COOKIE_SECURE": "false",
    "COOKIE_SAMESITE": "lax",
    "COOKIE_DOMAIN": "",
    "JWT_SECRET_KEY": "test-only-secret-key-that-is-long-enough-for-hs256",
    "JWT_ACCESS_TOKEN_EXPIRES_MINUTES": "15",
    "JWT_REFRESH_TOKEN_EXPIRES_DAYS": "7",
    "REFRESH_TOKEN_REUSE_GRACE_SECONDS": "30",
    "ATTACHMENT_URL_TTL_SECONDS": "900",
    "OTP_LENGTH": "6",
    "OTP_TTL_MINUTES": "10",
    "OTP_MAX_ATTEMPTS": "5",
    "OTP_RESEND_COOLDOWN_SECONDS": "0",  # the throttling test raises it for itself
    "EXPOSE_DEV_OTP": "true",
    "SMS_DELIVERY": "console",
    "EMAIL_DELIVERY": "console",
    "MESSAGE_MAX_ATTEMPTS": "3",
    "LOGIN_MAX_FAILURES": "5",
    "LOGIN_LOCKOUT_MINUTES": "15",
    "LOGIN_ATTEMPTS_PER_IP_PER_HOUR": "100000",
    "OTP_REQUESTS_PER_TARGET_PER_HOUR": "1000",
    "OTP_REQUESTS_PER_IP_PER_HOUR": "100000",
    "OTP_VERIFICATIONS_PER_IP_PER_HOUR": "100000",
    "RESET_REQUESTS_PER_IP_PER_HOUR": "10000",
    "UPLOAD_DIR": TEST_UPLOADS,
    "MAX_CSV_UPLOAD_BYTES": "1048576",
    "MAX_IMPORT_ROWS": "50000",
    "IMPORT_SIMILAR_NAME_RATIO": "0.85",
    "AUDIT_EXPORT_MAX_ROWS": "50000",
    "WORKER_INTERVAL_SECONDS": "0",  # tests drive the background jobs explicitly
    "IMPORT_ISSUE_RETENTION_DAYS": "30",
    "AUDIT_RETENTION_DAYS": "0",
})

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import MetaData  # noqa: E402

import factories  # noqa: E402
from factories import PASSWORD, email  # noqa: E402

SUPER_ADMIN = email("root")
ADMIN = email("admin")
ELEC_MANAGER = email("manager")          # Electricity @ Jaipur district
ELEC_SUPERVISOR = email("supervisor")    # Electricity @ Jaipur city
ELEC_AGENT = email("agent")              # Electricity @ Mansarovar
CITY_AGENT = email("city.agent")         # Electricity @ Jaipur city
WATER_AGENT = email("water.agent")       # Water @ Mansarovar
WATER_MANAGER = email("water.manager")   # Water @ Jaipur district
DELHI_AGENT = email("delhi.agent")       # Electricity @ New Delhi
CLIENT_HEADERS = {"X-Requested-With": "cms"}


def _reset_database() -> None:
    from database import SessionLocal, engine
    from manage import migrate

    existing = MetaData()
    existing.reflect(bind=engine)
    existing.drop_all(bind=engine)
    migrate()
    with SessionLocal() as db:
        factories.build(db, random.Random(42), complaint_count=120)


@pytest.fixture(scope="session")
def client():
    _reset_database()
    from app import app

    with TestClient(app) as test_client:
        yield test_client


def new_client() -> TestClient:
    """A separate client with its own cookie jar (e.g. for session tests)."""
    from app import app

    return TestClient(app)


def staff_login(client: TestClient, identifier: str, password: str = PASSWORD) -> dict:
    response = client.post("/auth/login", json={"identifier": identifier, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def first_login(client: TestClient, identifier: str, initial_password: str, new_password: str) -> dict:
    """Signs in with a password someone else set and replaces it, as the app requires."""
    headers = staff_login(client, identifier, initial_password)
    changed = client.post("/auth/change-password", headers=headers,
                          json={"current_password": initial_password, "new_password": new_password})
    assert changed.status_code == 200, changed.text
    return {"Authorization": f"Bearer {changed.json()['access_token']}"}


def portal_login(client: TestClient, identifier: str, channel: str = "sms") -> dict:
    otp = client.post("/portal/auth/request-otp", json={"channel": channel, "identifier": identifier})
    assert otp.status_code == 200, otp.text
    body = otp.json()
    verified = client.post("/portal/auth/verify-otp", json={"challenge_id": body["challenge_id"], "otp": body["dev_otp"]})
    assert verified.status_code == 200, verified.text
    data = verified.json()
    if "selection_token" in data:
        # Some tests register a second person on a fixture user's mobile; the fixture user is the oldest.
        first = min(account["id"] for account in data["accounts"])
        chosen = client.post("/portal/auth/select-account",
                             json={"selection_token": data["selection_token"], "end_user_id": first})
        assert chosen.status_code == 200, chosen.text
        data = chosen.json()
    return {"Authorization": f"Bearer {data['access_token']}"}


@pytest.fixture(scope="session")
def login(client):
    tokens: dict[str, dict] = {}

    def _login(identifier: str) -> dict:
        if identifier not in tokens:
            tokens[identifier] = staff_login(client, identifier)
        return tokens[identifier]

    return _login


@pytest.fixture(scope="session")
def end_user_login(client):
    """End user tokens, cached per mobile for the whole session."""
    tokens: dict[str, dict] = {}

    def _login(mobile: str = "9876543210") -> dict:
        if mobile not in tokens:
            tokens[mobile] = portal_login(client, mobile)
        return tokens[mobile]

    return _login
