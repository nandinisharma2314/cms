import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from config import JWT_SECRET_KEY, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRES_MINUTES

PRINCIPAL_STAFF = "staff"
PRINCIPAL_END_USER = "end_user"


def utcnow() -> datetime:
    """Naive UTC timestamp, matching how DateTime columns are stored."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    if not hashed_password:
        return False
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        return False


def validate_password_strength(password: str) -> str | None:
    """Returns an error message, or None when the password is acceptable."""
    if len(password) < 8:
        return "Password must be at least 8 characters."
    # bcrypt only looks at the first 72 bytes and bcrypt>=5 rejects longer input.
    if len(password.encode("utf-8")) > 72:
        return "Password must be at most 72 bytes."
    return None


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def create_access_token(principal_type: str, principal_id: int) -> str:
    expire = utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRES_MINUTES)
    payload = {"sub": str(principal_id), "typ": principal_type, "exp": expire}
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> tuple[str, int]:
    """Returns (principal_type, principal_id). Raises jwt.InvalidTokenError."""
    payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    principal_type = payload.get("typ")
    subject = payload.get("sub")
    if principal_type not in (PRINCIPAL_STAFF, PRINCIPAL_END_USER) or not subject:
        raise jwt.InvalidTokenError("Malformed token")
    return principal_type, int(subject)


def normalize_mobile(raw: str | None) -> str | None:
    """Digits only; numbers longer than 10 digits keep the last 10 (Indian
    numbers entered with a +91 / 0 prefix)."""
    if not raw:
        return None
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) > 10:
        digits = digits[-10:]
    return digits or None


def normalize_email(raw: str | None) -> str | None:
    if not raw:
        return None
    email = raw.strip().lower()
    return email or None


def looks_like_email(value: str) -> bool:
    local, _, domain = value.partition("@")
    return bool(local) and "." in domain and not domain.startswith(".") and " " not in value
