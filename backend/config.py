"""Deployment configuration, read from the environment (and backend/.env).

Every deployment value is required: a missing or invalid variable stops the
app at startup with a message naming it, instead of silently using a default.
Business rules (branding, phone format, attachment limits, reopen rules, ...)
are not here; the Super Admin manages them in the admin panel (see
services/settings_service.py).

The only built-in values are the UX defaults at the bottom of this file.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


class ConfigError(RuntimeError):
    pass


def _raw(name: str) -> str:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        raise ConfigError(f"Environment variable {name} is required (see backend/.env.example)")
    return value.strip()


def _str(name: str) -> str:
    return _raw(name)


def _optional_str(name: str) -> str | None:
    """For values whose absence is meaningful (e.g. a cookie domain). The
    variable must still be present in the environment, possibly empty."""
    if name not in os.environ:
        raise ConfigError(f"Environment variable {name} must be set (it may be empty; see backend/.env.example)")
    value = os.environ[name].strip()
    return value or None


def _int(name: str, minimum: int | None = None, maximum: int | None = None) -> int:
    raw = _raw(name)
    try:
        value = int(raw)
    except ValueError:
        raise ConfigError(f"{name} must be a whole number, got {raw!r}") from None
    if minimum is not None and value < minimum:
        raise ConfigError(f"{name} must be at least {minimum}, got {value}")
    if maximum is not None and value > maximum:
        raise ConfigError(f"{name} must be at most {maximum}, got {value}")
    return value


def _float(name: str, minimum: float, maximum: float) -> float:
    raw = _raw(name)
    try:
        value = float(raw)
    except ValueError:
        raise ConfigError(f"{name} must be a number, got {raw!r}") from None
    if not minimum <= value <= maximum:
        raise ConfigError(f"{name} must be between {minimum} and {maximum}, got {value}")
    return value


def _bool(name: str) -> bool:
    raw = _raw(name).lower()
    if raw not in ("true", "false"):
        raise ConfigError(f"{name} must be 'true' or 'false', got {raw!r}")
    return raw == "true"


def _choice(name: str, choices: tuple[str, ...]) -> str:
    value = _raw(name).lower()
    if value not in choices:
        raise ConfigError(f"{name} must be one of {', '.join(choices)}, got {value!r}")
    return value


# ---------------------------------------------------------------------------
# Environment and database
# ---------------------------------------------------------------------------

APP_ENV = _choice("APP_ENV", ("development", "test", "production"))
IS_PRODUCTION = APP_ENV == "production"

DATABASE_URI = _str("DATABASE_URI")

# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

CORS_ORIGINS = [o.strip().rstrip("/") for o in _str("CORS_ORIGINS").split(",") if o.strip()]
if not CORS_ORIGINS or "*" in CORS_ORIGINS:
    raise ConfigError("CORS_ORIGINS must list the exact frontend origins, comma separated (no '*')")

# Refresh tokens live in an httpOnly cookie.
COOKIE_SECURE = _bool("COOKIE_SECURE")
COOKIE_SAMESITE = _choice("COOKIE_SAMESITE", ("lax", "strict", "none"))
COOKIE_DOMAIN = _optional_str("COOKIE_DOMAIN")
if COOKIE_SAMESITE == "none" and not COOKIE_SECURE:
    raise ConfigError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true")
if IS_PRODUCTION and not COOKIE_SECURE:
    raise ConfigError("COOKIE_SECURE must be true in production")

# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------

JWT_SECRET_KEY = _str("JWT_SECRET_KEY")
if len(JWT_SECRET_KEY) < 32:
    raise ConfigError("JWT_SECRET_KEY must be at least 32 characters long")
JWT_ALGORITHM = "HS256"  # the only algorithm the code signs and accepts
ACCESS_TOKEN_EXPIRES_MINUTES = _int("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", 1, 24 * 60)
REFRESH_TOKEN_EXPIRES_DAYS = _int("JWT_REFRESH_TOKEN_EXPIRES_DAYS", 1, 365)
# Two tabs may refresh with the same token at the same moment; within this
# window the second request gets a fresh token instead of being treated as theft.
REFRESH_TOKEN_REUSE_GRACE_SECONDS = _int("REFRESH_TOKEN_REUSE_GRACE_SECONDS", 0, 300)
# Lifetime of the signed links used to download attachments.
ATTACHMENT_URL_TTL_SECONDS = _int("ATTACHMENT_URL_TTL_SECONDS", 30, 24 * 3600)

# ---------------------------------------------------------------------------
# One-time passwords and outgoing messages
# ---------------------------------------------------------------------------

OTP_LENGTH = _int("OTP_LENGTH", 4, 10)
OTP_TTL_MINUTES = _int("OTP_TTL_MINUTES", 1, 60)
OTP_MAX_ATTEMPTS = _int("OTP_MAX_ATTEMPTS", 1, 20)
OTP_RESEND_COOLDOWN_SECONDS = _int("OTP_RESEND_COOLDOWN_SECONDS", 0, 3600)
# Development aid: return the OTP in the API response. Refused in production.
EXPOSE_DEV_OTP = _bool("EXPOSE_DEV_OTP")
if EXPOSE_DEV_OTP and IS_PRODUCTION:
    raise ConfigError("EXPOSE_DEV_OTP must be false in production")

# How sign-in codes and notifications go out, per channel:
#   console        written to the log (development and tests; refused in production)
#   twilio / smtp  sent through the provider configured below
#   off            the channel is not used: nobody signs in with it and nothing is sent on it
SMS_DELIVERY = _choice("SMS_DELIVERY", ("console", "twilio", "off"))
EMAIL_DELIVERY = _choice("EMAIL_DELIVERY", ("console", "smtp", "off"))
if SMS_DELIVERY == "off" and EMAIL_DELIVERY == "off":
    raise ConfigError("SMS_DELIVERY and EMAIL_DELIVERY can't both be off: end users sign in with a code sent by one of them")
if IS_PRODUCTION and "console" in (SMS_DELIVERY, EMAIL_DELIVERY):
    raise ConfigError("SMS_DELIVERY and EMAIL_DELIVERY can't be 'console' in production")
MESSAGE_MAX_ATTEMPTS = _int("MESSAGE_MAX_ATTEMPTS", 1, 20)
MESSAGE_TIMEOUT_SECONDS = (_int("MESSAGE_TIMEOUT_SECONDS", 1, 120)
                           if SMS_DELIVERY == "twilio" or EMAIL_DELIVERY == "smtp" else None)

if SMS_DELIVERY == "twilio":
    TWILIO_ACCOUNT_SID = _str("TWILIO_ACCOUNT_SID")
    TWILIO_AUTH_TOKEN = _str("TWILIO_AUTH_TOKEN")
    TWILIO_FROM_NUMBER = _str("TWILIO_FROM_NUMBER")
else:
    TWILIO_ACCOUNT_SID = TWILIO_AUTH_TOKEN = TWILIO_FROM_NUMBER = None

if EMAIL_DELIVERY == "smtp":
    SMTP_HOST = _str("SMTP_HOST")
    SMTP_PORT = _int("SMTP_PORT", 1, 65535)
    SMTP_SECURITY = _choice("SMTP_SECURITY", ("starttls", "ssl", "none"))
    SMTP_USERNAME = _optional_str("SMTP_USERNAME")
    SMTP_PASSWORD = _optional_str("SMTP_PASSWORD")
    SMTP_FROM = _str("SMTP_FROM")
    if bool(SMTP_USERNAME) != bool(SMTP_PASSWORD):
        raise ConfigError("SMTP_USERNAME and SMTP_PASSWORD must be set together (or both left empty)")
else:
    SMTP_HOST = SMTP_PORT = SMTP_SECURITY = SMTP_USERNAME = SMTP_PASSWORD = SMTP_FROM = None

# ---------------------------------------------------------------------------
# Abuse protection (fixed windows, shared by all API workers through the DB)
# ---------------------------------------------------------------------------

LOGIN_MAX_FAILURES = _int("LOGIN_MAX_FAILURES", 1, 100)
LOGIN_LOCKOUT_MINUTES = _int("LOGIN_LOCKOUT_MINUTES", 1, 24 * 60)
LOGIN_ATTEMPTS_PER_IP_PER_HOUR = _int("LOGIN_ATTEMPTS_PER_IP_PER_HOUR", 1, 100000)
OTP_REQUESTS_PER_TARGET_PER_HOUR = _int("OTP_REQUESTS_PER_TARGET_PER_HOUR", 1, 1000)
OTP_REQUESTS_PER_IP_PER_HOUR = _int("OTP_REQUESTS_PER_IP_PER_HOUR", 1, 100000)
OTP_VERIFICATIONS_PER_IP_PER_HOUR = _int("OTP_VERIFICATIONS_PER_IP_PER_HOUR", 1, 100000)
RESET_REQUESTS_PER_IP_PER_HOUR = _int("RESET_REQUESTS_PER_IP_PER_HOUR", 1, 10000)

# ---------------------------------------------------------------------------
# Files, imports, exports
# ---------------------------------------------------------------------------

_upload_dir = Path(_str("UPLOAD_DIR"))
UPLOAD_DIR = _upload_dir if _upload_dir.is_absolute() else (BASE_DIR / _upload_dir)
MAX_CSV_UPLOAD_BYTES = _int("MAX_CSV_UPLOAD_BYTES", 1024, 500 * 1024 * 1024)
MAX_IMPORT_ROWS = _int("MAX_IMPORT_ROWS", 1, 1_000_000)
# How alike (0-1) a new location name must be to an existing sibling to be flagged as a likely typo.
IMPORT_SIMILAR_NAME_RATIO = _float("IMPORT_SIMILAR_NAME_RATIO", 0.5, 1.0)
AUDIT_EXPORT_MAX_ROWS = _int("AUDIT_EXPORT_MAX_ROWS", 1, 5_000_000)

# ---------------------------------------------------------------------------
# Background work (SLA checks, message delivery, routing retries, cleanup)
# ---------------------------------------------------------------------------

# 0 = the API does not run background work; run `python worker.py` instead.
WORKER_INTERVAL_SECONDS = _int("WORKER_INTERVAL_SECONDS", 0, 3600)
# Import issue rows keep a copy of the uploaded row (personal data); cleared after this many days.
IMPORT_ISSUE_RETENTION_DAYS = _int("IMPORT_ISSUE_RETENTION_DAYS", 1, 3650)
# Audit entries older than this are deleted; 0 keeps them forever.
AUDIT_RETENTION_DAYS = _int("AUDIT_RETENTION_DAYS", 0, 36500)

# ---------------------------------------------------------------------------
# UX defaults (the only built-in values; the frontends read them from
# GET /public/config so both apps use the same numbers). Limits on short text
# come from the column sizes instead (models.max_length).
# ---------------------------------------------------------------------------

DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100
REPORT_DEFAULT_DAYS = 30
# Quick ranges offered next to the report date pickers.
REPORT_PRESET_DAYS = (7, 30, 90)
# Items shown in dashboard "recent" lists and in the notification menus (the full lists are paged).
DASHBOARD_RECENT_ITEMS = 5
NOTIFICATION_MENU_ITEMS = 10
# Search boxes wait this long after the last keystroke; people lookups need this many characters
# and show this many matches.
SEARCH_DEBOUNCE_MS = 300
LOOKUP_MIN_CHARS = 2
LOOKUP_RESULTS = 6
# Confirmation messages disappear after this many seconds; CSV attachments preview this many rows.
TOAST_SECONDS = 5
CSV_PREVIEW_ROWS = 25
DASHBOARD_TREND_DAYS = 7
# Dashboard cards compare the last N days with the N days before.
DASHBOARD_COMPARISON_DAYS = 30
# How many per-row import problems are returned inline; the full list is in import history.
IMPORT_RESULT_ISSUE_LIMIT = 500
DESCRIPTION_MAX_LENGTH = 5000
COMMENT_MAX_LENGTH = 5000
NOTE_MAX_LENGTH = 2000
# A rejection request must explain itself in at least this many characters.
REJECTION_REASON_MIN_LENGTH = 10
NOTIFICATION_POLL_SECONDS = 60
COMPLAINT_REFRESH_SECONDS = 30
# Report tables mark SLA compliance at or above these percentages as good / worth watching (below: poor).
SLA_GOOD_PCT = 90
SLA_WATCH_PCT = 75
# Reports cover at most this many days; periods longer than REPORT_WEEKLY_AFTER_DAYS are charted per week.
REPORT_MAX_DAYS = 5 * 366
REPORT_WEEKLY_AFTER_DAYS = 62
# Longest SLA target or escalation step accepted, and the deepest escalation (guards against typos).
SLA_MAX_HOURS = 24 * 365
MAX_ESCALATION_LEVEL = 20
# Department codes are at least this long (the column size is the upper limit).
DEPARTMENT_CODE_MIN_LENGTH = 2
# Staff passwords: at least this long, mixing this many of lowercase / uppercase / digit / symbol.
PASSWORD_MIN_LENGTH = 8
PASSWORD_CHARACTER_CLASSES = 3
# How long someone whose phone or email is shared has to pick their account after a correct code.
ACCOUNT_SELECTION_MINUTES = 5
