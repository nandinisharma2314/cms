import os
import sys
import tempfile

import pytest

# Point the app at a throwaway SQLite file before anything imports `database`.
_db_dir = tempfile.mkdtemp(prefix="cms-test-")
os.environ["DATABASE_URI"] = f"sqlite:///{os.path.join(_db_dir, 'test.db')}"
os.environ["APP_ENV"] = "development"
os.environ["SLA_CHECK_INTERVAL_SECONDS"] = "0"  # tests drive the SLA check explicitly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

import seed  # noqa: E402
from app import app  # noqa: E402

PASSWORD = seed.DEMO_PASSWORD
SUPER_ADMIN = "rahul.sharma@example.com"
ADMIN = "admin@civiccare.gov.in"
ELEC_MANAGER = "manager@civiccare.gov.in"          # Electricity @ Jaipur district
ELEC_SUPERVISOR = "supervisor@civiccare.gov.in"    # Electricity @ Jaipur city
ELEC_AGENT = "agent@civiccare.gov.in"              # Electricity @ Mansarovar
WATER_AGENT = "water.agent@civiccare.gov.in"       # Water @ Mansarovar
DELHI_AGENT = "delhi.agent@civiccare.gov.in"       # Electricity @ New Delhi


@pytest.fixture(scope="session")
def client():
    seed.seed_database()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def login(client):
    tokens: dict[str, dict] = {}

    def _login(email: str) -> dict:
        if email not in tokens:
            response = client.post("/auth/login", json={"email": email, "password": PASSWORD})
            assert response.status_code == 200, response.text
            tokens[email] = {"Authorization": f"Bearer {response.json()['access_token']}"}
        return tokens[email]

    return _login


@pytest.fixture(scope="session")
def citizen_login(client):
    """Citizen tokens, cached: requesting a second OTP within 30 s is throttled."""
    tokens: dict[tuple[str, str], dict] = {}

    def _login(mobile: str = "9876543210", email: str = "rahul@example.com") -> dict:
        if (mobile, email) not in tokens:
            otp = client.post("/portal/auth/request-otp", json={"mobile": mobile, "email": email, "channel": "sms"})
            assert otp.status_code == 200, otp.text
            body = otp.json()
            verified = client.post(
                "/portal/auth/verify-otp", json={"challenge_id": body["challenge_id"], "otp": body["dev_otp"]},
            )
            assert verified.status_code == 200, verified.text
            tokens[(mobile, email)] = {"Authorization": f"Bearer {verified.json()['access_token']}"}
        return tokens[(mobile, email)]

    return _login
