"""Deployment configuration, read from the environment (.env and backend/.env).

Sensible, production-ready defaults are provided for standard parameters so that
a deployment only needs essential connection variables (database, ports, URLs).
Business rules (branding, phone format, attachment limits, reopen rules, ...)
are managed by the Super Admin in the admin panel (see services/settings_service.py).
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

# Check root .env first, then backend/.env
if (BASE_DIR.parent / ".env").exists():
    load_dotenv(BASE_DIR.parent / ".env")
if (BASE_DIR / ".env").exists():
    load_dotenv(BASE_DIR / ".env")


class ConfigError(RuntimeError):
    pass


def _raw(name: str, default: str | None = None) -> str:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        if default is not None:
            return default
        raise ConfigError(f"Environment variable {name} is required (see .env.example)")
    return value.strip()


def _str(name: str, default: str | None = None) -> str:
    return _raw(name, default=default)


def _optional_str(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None:
        return default
    value = value.strip()
    return value or default


def _int(name: str, minimum: int | None = None, maximum: int | None = None, default: int | None = None) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        if default is not None:
            return default
        raise ConfigError(f"Environment variable {name} is required (see .env.example)")
    raw = raw.strip()
    try:
        value = int(raw)
    except ValueError:
        raise ConfigError(f"{name} must be a whole number, got {raw!r}") from None
    if minimum is not None and value < minimum:
        raise ConfigError(f"{name} must be at least {minimum}, got {value}")
    if maximum is not None and value > maximum:
        raise ConfigError(f"{name} must be at most {maximum}, got {value}")
    return value


def _float(name: str, minimum: float, maximum: float, default: float | None = None) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        if default is not None:
            return default
        raise ConfigError(f"Environment variable {name} is required (see .env.example)")
    raw = raw.strip()
    try:
        value = float(raw)
    except ValueError:
        raise ConfigError(f"{name} must be a number, got {raw!r}") from None
    if not minimum <= value <= maximum:
        raise ConfigError(f"{name} must be between {minimum} and {maximum}, got {value}")
    return value


def _bool(name: str, default: bool | None = None) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        if default is not None:
            return default
        raise ConfigError(f"Environment variable {name} is required (see .env.example)")
    raw = raw.strip().lower()
    if raw not in ("true", "false"):
        raise ConfigError(f"{name} must be 'true' or 'false', got {raw!r}")
    return raw == "true"


def _choice(name: str, choices: tuple[str, ...], default: str | None = None) -> str:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        if default is not None:
            return default
        raise ConfigError(f"Environment variable {name} is required (see .env.example)")
    value = raw.strip().lower()
    if value not in choices:
        raise ConfigError(f"{name} must be one of {', '.join(choices)}, got {value!r}")
    return value


# ---------------------------------------------------------------------------
# Environment and database
# ---------------------------------------------------------------------------

APP_ENV = _choice("APP_ENV", ("development", "test", "production"), default="development")
IS_PRODUCTION = APP_ENV == "production"
IS_DEVELOPMENT = APP_ENV == "development"

DATABASE_URI = _str("DATABASE_URI")

# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

CORS_ORIGINS = [o.strip().rstrip("/") for o in _str("CORS_ORIGINS", default="http://localhost:3000,http://localhost:3001").split(",") if o.strip()]
if not CORS_ORIGINS or "*" in CORS_ORIGINS:
    raise ConfigError("CORS_ORIGINS must list the exact frontend origins, comma separated (no '*')")

COOKIE_SECURE = _bool("COOKIE_SECURE", default=False)
COOKIE_SAMESITE = _choice("COOKIE_SAMESITE", ("lax", "strict", "none"), default="lax")
COOKIE_DOMAIN = _optional_str("COOKIE_DOMAIN")
if COOKIE_SAMESITE == "none" and not COOKIE_SECURE:
    raise ConfigError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true")

# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------

JWT_SECRET_KEY = _str("JWT_SECRET_KEY", default="kvontech-complaint-management-system-super-secret-key-32chars-min")
if len(JWT_SECRET_KEY) < 32:
    raise ConfigError("JWT_SECRET_KEY must be at least 32 characters long")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRES_MINUTES = _int("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", 1, 24 * 60, default=15)
REFRESH_TOKEN_EXPIRES_DAYS = _int("JWT_REFRESH_TOKEN_EXPIRES_DAYS", 1, 365, default=7)
REFRESH_TOKEN_REUSE_GRACE_SECONDS = _int("REFRESH_TOKEN_REUSE_GRACE_SECONDS", 0, 300, default=30)
ATTACHMENT_URL_TTL_SECONDS = _int("ATTACHMENT_URL_TTL_SECONDS", 30, 24 * 3600, default=900)

# ---------------------------------------------------------------------------
# One-time passwords and outgoing messages
# ---------------------------------------------------------------------------

OTP_LENGTH = _int("OTP_LENGTH", 4, 10, default=6)
OTP_TTL_MINUTES = _int("OTP_TTL_MINUTES", 1, 60, default=10)
OTP_MAX_ATTEMPTS = _int("OTP_MAX_ATTEMPTS", 1, 20, default=5)
OTP_RESEND_COOLDOWN_SECONDS = _int("OTP_RESEND_COOLDOWN_SECONDS", 0, 3600, default=30)
EXPOSE_DEV_OTP = _bool("EXPOSE_DEV_OTP", default=False)
if EXPOSE_DEV_OTP and IS_PRODUCTION:
    raise ConfigError("EXPOSE_DEV_OTP must be false in production")

# How sign-in codes and notifications go out, per channel:
#   console        written to the log / stdout
#   twilio / smtp  sent through the provider configured below
#   off            the channel is not used: nobody signs in with it and nothing is sent on it
SMS_DELIVERY = _choice("SMS_DELIVERY", ("console", "twilio", "off"), default="console")
EMAIL_DELIVERY = _choice("EMAIL_DELIVERY", ("console", "smtp", "off"), default="console")
if SMS_DELIVERY == "off" and EMAIL_DELIVERY == "off":
    raise ConfigError("SMS_DELIVERY and EMAIL_DELIVERY can't both be off: end users sign in with a code sent by one of them")

MESSAGE_MAX_ATTEMPTS = _int("MESSAGE_MAX_ATTEMPTS", 1, 20, default=5)
MESSAGE_TIMEOUT_SECONDS = (_int("MESSAGE_TIMEOUT_SECONDS", 1, 120, default=15)
                           if SMS_DELIVERY == "twilio" or EMAIL_DELIVERY == "smtp" else None)

if SMS_DELIVERY == "twilio":
    TWILIO_ACCOUNT_SID = _str("TWILIO_ACCOUNT_SID")
    TWILIO_AUTH_TOKEN = _str("TWILIO_AUTH_TOKEN")
    TWILIO_FROM_NUMBER = _str("TWILIO_FROM_NUMBER")
else:
    TWILIO_ACCOUNT_SID = TWILIO_AUTH_TOKEN = TWILIO_FROM_NUMBER = None

if EMAIL_DELIVERY == "smtp":
    SMTP_HOST = _str("SMTP_HOST")
    SMTP_PORT = _int("SMTP_PORT", 1, 65535, default=587)
    SMTP_SECURITY = _choice("SMTP_SECURITY", ("starttls", "ssl", "none"), default="starttls")
    SMTP_USERNAME = _optional_str("SMTP_USERNAME")
    SMTP_PASSWORD = _optional_str("SMTP_PASSWORD")
    SMTP_FROM = _str("SMTP_FROM", default="noreply@example.com")
    if bool(SMTP_USERNAME) != bool(SMTP_PASSWORD):
        raise ConfigError("SMTP_USERNAME and SMTP_PASSWORD must be set together (or both left empty)")
else:
    SMTP_HOST = SMTP_PORT = SMTP_SECURITY = SMTP_USERNAME = SMTP_PASSWORD = SMTP_FROM = None

# ---------------------------------------------------------------------------
# Abuse protection (fixed windows, shared by all API workers through the DB)
# ---------------------------------------------------------------------------

LOGIN_MAX_FAILURES = _int("LOGIN_MAX_FAILURES", 1, 100, default=5)
LOGIN_LOCKOUT_MINUTES = _int("LOGIN_LOCKOUT_MINUTES", 1, 24 * 60, default=15)
LOGIN_ATTEMPTS_PER_IP_PER_HOUR = _int("LOGIN_ATTEMPTS_PER_IP_PER_HOUR", 1, 100000, default=100)
OTP_REQUESTS_PER_TARGET_PER_HOUR = _int("OTP_REQUESTS_PER_TARGET_PER_HOUR", 1, 1000, default=5)
OTP_REQUESTS_PER_IP_PER_HOUR = _int("OTP_REQUESTS_PER_IP_PER_HOUR", 1, 100000, default=30)
OTP_VERIFICATIONS_PER_IP_PER_HOUR = _int("OTP_VERIFICATIONS_PER_IP_PER_HOUR", 1, 100000, default=60)
RESET_REQUESTS_PER_IP_PER_HOUR = _int("RESET_REQUESTS_PER_IP_PER_HOUR", 1, 10000, default=5)

# ---------------------------------------------------------------------------
# Files, imports, exports
# ---------------------------------------------------------------------------

_upload_dir = Path(_str("UPLOAD_DIR", default="uploads"))
UPLOAD_DIR = _upload_dir if _upload_dir.is_absolute() else (BASE_DIR / _upload_dir)

# Cloudflare R2 / S3 Object Storage (optional; defaults to local disk)
STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local").strip().lower()
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "").strip() or None
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "").strip() or None
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "").strip() or None
R2_BUCKET = os.getenv("R2_BUCKET", "").strip() or None
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "").strip().rstrip("/") or None
R2_CUSTOM_ENDPOINT = os.getenv("R2_CUSTOM_ENDPOINT", "").strip() or None

MAX_CSV_UPLOAD_BYTES = _int("MAX_CSV_UPLOAD_BYTES", 1024, 500 * 1024 * 1024, default=5242880)
MAX_IMPORT_ROWS = _int("MAX_IMPORT_ROWS", 1, 1_000_000, default=50000)
# How alike (0-1) a new location name must be to an existing sibling to be flagged as a likely typo.
IMPORT_SIMILAR_NAME_RATIO = _float("IMPORT_SIMILAR_NAME_RATIO", 0.5, 1.0, default=0.85)
AUDIT_EXPORT_MAX_ROWS = _int("AUDIT_EXPORT_MAX_ROWS", 1, 5_000_000, default=50000)

# ---------------------------------------------------------------------------
# Background work (SLA checks, message delivery, routing retries, cleanup)
# ---------------------------------------------------------------------------

WORKER_INTERVAL_SECONDS = _int("WORKER_INTERVAL_SECONDS", 0, 3600, default=60)
IMPORT_ISSUE_RETENTION_DAYS = _int("IMPORT_ISSUE_RETENTION_DAYS", 1, 3650, default=30)
AUDIT_RETENTION_DAYS = _int("AUDIT_RETENTION_DAYS", 0, 36500, default=0)

# ---------------------------------------------------------------------------
# UX defaults (the only built-in values; the frontends read them from
# GET /public/config so both apps use the same numbers). Limits on short text
# come from the column sizes instead (models.max_length).
# ---------------------------------------------------------------------------

DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100
REPORT_DEFAULT_DAYS = 30
REPORT_PRESET_DAYS = (7, 30, 90)
DASHBOARD_RECENT_ITEMS = 5
NOTIFICATION_MENU_ITEMS = 10
SEARCH_DEBOUNCE_MS = 300
LOOKUP_MIN_CHARS = 2
LOOKUP_RESULTS = 6
TOAST_SECONDS = 5
CSV_PREVIEW_ROWS = 25
DASHBOARD_TREND_DAYS = 7
DASHBOARD_COMPARISON_DAYS = 30
IMPORT_RESULT_ISSUE_LIMIT = 500
DESCRIPTION_MAX_LENGTH = 5000
COMMENT_MAX_LENGTH = 5000
NOTE_MAX_LENGTH = 2000
REJECTION_REASON_MIN_LENGTH = 10
NOTIFICATION_POLL_SECONDS = 60
COMPLAINT_REFRESH_SECONDS = 30
SLA_GOOD_PCT = 90
SLA_WATCH_PCT = 75
REPORT_MAX_DAYS = 5 * 366
REPORT_WEEKLY_AFTER_DAYS = 62
SLA_MAX_HOURS = 24 * 365
MAX_ESCALATION_LEVEL = 20
DEPARTMENT_CODE_MIN_LENGTH = 2
PASSWORD_MIN_LENGTH = 8
PASSWORD_CHARACTER_CLASSES = 3
ACCOUNT_SELECTION_MINUTES = 5
