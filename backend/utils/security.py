import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import bcrypt
import jwt

from config import (
    ACCESS_TOKEN_EXPIRES_MINUTES, JWT_ALGORITHM, JWT_SECRET_KEY, PASSWORD_CHARACTER_CLASSES, PASSWORD_MIN_LENGTH,
)

PRINCIPAL_STAFF = "staff"
PRINCIPAL_END_USER = "end_user"
PRINCIPALS = (PRINCIPAL_STAFF, PRINCIPAL_END_USER)

# Purpose-specific token types, so a token minted for one purpose is never accepted for another.
TOKEN_ACCESS = "access"
TOKEN_ACCOUNT_SELECTION = "account_selection"


def utcnow() -> datetime:
    """Naive UTC timestamp in whole seconds, exactly as DateTime columns store it
    (MySQL rounds fractional seconds, MariaDB truncates them; neither keeps them)."""
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def unix_now() -> int:
    return int(datetime.now(timezone.utc).timestamp())


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------

PASSWORD_MAX_BYTES = 72  # bcrypt only looks at the first 72 bytes; bcrypt>=5 rejects longer input


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


@lru_cache(maxsize=1)
def _timing_hash() -> bytes:
    """A hash of a random secret, checked when no account matches so that a
    failed login takes as long whether or not the account exists."""
    return bcrypt.hashpw(secrets.token_bytes(16), bcrypt.gensalt())


def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    candidate = plain_password.encode("utf-8")[:PASSWORD_MAX_BYTES]
    if not hashed_password:
        bcrypt.checkpw(candidate, _timing_hash())
        return False
    try:
        return bcrypt.checkpw(candidate, hashed_password.encode("utf-8"))
    except ValueError:
        return False


def validate_password_strength(password: str) -> str | None:
    """Returns an error message, or None when the password is acceptable."""
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"Password must be at least {PASSWORD_MIN_LENGTH} characters."
    if len(password.encode("utf-8")) > PASSWORD_MAX_BYTES:
        return f"Password must be at most {PASSWORD_MAX_BYTES} bytes."
    classes = sum(bool(re.search(p, password)) for p in (r"[a-z]", r"[A-Z]", r"\d", r"[^A-Za-z0-9]"))
    if classes < PASSWORD_CHARACTER_CLASSES:
        return (f"Password must mix at least {PASSWORD_CHARACTER_CLASSES} of: lowercase letters, uppercase letters, "
                "digits, symbols.")
    return None


def generate_password() -> str:
    """A random password that satisfies validate_password_strength."""
    while True:
        candidate = secrets.token_urlsafe(12)
        if validate_password_strength(candidate) is None:
            return candidate


# ---------------------------------------------------------------------------
# Hashing and opaque tokens
# ---------------------------------------------------------------------------

def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def _hmac(message: str) -> str:
    return hmac.new(JWT_SECRET_KEY.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def sign_value(value: str, expires_at: int) -> str:
    """Signature for a value that is valid until `expires_at` (unix seconds)."""
    return _hmac(f"{value}:{expires_at}")


def signature_valid(value: str, expires_at: int, signature: str) -> bool:
    if expires_at < unix_now():
        return False
    return hmac.compare_digest(sign_value(value, expires_at), signature)


# ---------------------------------------------------------------------------
# JWTs
# ---------------------------------------------------------------------------

def create_access_token(principal_type: str, principal_id: int, token_version: int) -> str:
    expire = utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRES_MINUTES)
    payload = {"sub": str(principal_id), "typ": principal_type, "ver": token_version, "use": TOKEN_ACCESS, "exp": expire}
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> tuple[str, int, int]:
    """Returns (principal_type, principal_id, token_version). Raises jwt.InvalidTokenError."""
    payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM], options={"require": ["exp", "sub"]})
    principal_type = payload.get("typ")
    version = payload.get("ver")
    if payload.get("use") != TOKEN_ACCESS or principal_type not in PRINCIPALS or not isinstance(version, int):
        raise jwt.InvalidTokenError("Malformed token")
    return principal_type, int(payload["sub"]), version


def create_purpose_token(purpose: str, claims: dict, minutes: int) -> str:
    payload = {**claims, "use": purpose, "exp": utcnow() + timedelta(minutes=minutes)}
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_purpose_token(token: str, purpose: str) -> dict:
    payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM], options={"require": ["exp"]})
    if payload.get("use") != purpose:
        raise jwt.InvalidTokenError("Wrong token type")
    return payload


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

EMAIL_MAX_LENGTH = 120  # the size of the email columns (a test keeps them equal)
_EMAIL_LOCAL = re.compile(r"^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$")
_EMAIL_LABEL = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$")


def normalize_email(raw: str | None) -> str | None:
    """Trimmed, lowercased address, or None when it is not a valid email."""
    if raw is None:
        return None
    email = raw.strip().lower()
    if not email or len(email) > EMAIL_MAX_LENGTH or email.count("@") != 1:
        return None
    local, domain = email.split("@")
    if not local or len(local) > 64 or not _EMAIL_LOCAL.match(local):
        return None
    labels = domain.split(".")
    if len(labels) < 2 or not all(_EMAIL_LABEL.match(label) for label in labels):
        return None
    if not re.fullmatch(r"[a-z]{2,63}", labels[-1]):
        return None
    return email
