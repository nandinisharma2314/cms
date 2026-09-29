"""Business settings managed by the Super Admin (the system_settings row).

A setting that is still NULL is "not configured". Code that needs it calls
`require(...)`, which raises a 503 naming the setting, so a missing value is
reported instead of being replaced by a guess.
"""
from datetime import date, datetime, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

import config
from models import (
    Complaint, ComplaintAssignment, ComplaintCategory, Department, EndUser, EscalationRule, Location, LocationType,
    PasswordResetTicket, Priority, RejectionReason, Role, SlaRule, SystemSettings, User, max_length,
)
from services import messaging
from utils.security import PASSWORD_MAX_BYTES

SETTINGS_ID = 1

# Extensions the upload pipeline knows how to verify (see attachment_service).
SUPPORTED_ATTACHMENT_TYPES = ("jpg", "jpeg", "png", "webp", "gif", "pdf", "mp4", "mov", "csv", "doc", "docx")

# Form fields whose length limit is their column size; published in /public/config
# so the apps stop input at the limit the API enforces.
FORM_FIELD_COLUMNS = {
    "title": Complaint.title,
    "additional_details": Complaint.additional_details,
    "feedback": Complaint.feedback_comment,
    "assignment_reason": ComplaintAssignment.reason,
    "person_name": EndUser.name,
    "external_id": EndUser.external_id,
    "address": EndUser.address,
    "email": User.email,
    "staff_name": User.name,
    "role_key": Role.key,
    "role_name": Role.name,
    "role_description": Role.description,
    "department_name": Department.name,
    "department_code": Department.code,
    "department_description": Department.description,
    "category_name": ComplaintCategory.name,
    "location_name": Location.name,
    "location_level_key": LocationType.key,
    "location_level_name": LocationType.name,
    "priority_key": Priority.key,
    "priority_name": Priority.name,
    "rejection_reason_name": RejectionReason.name,
    "reset_identifier": PasswordResetTicket.identifier,
    "reset_reason": PasswordResetTicket.reason,
    "reset_note": PasswordResetTicket.decision_note,
    "organisation_name": SystemSettings.organisation_name,
    "product_name": SystemSettings.product_name,
    "support_email": SystemSettings.support_email,
    "support_phone": SystemSettings.support_phone,
    "support_hours": SystemSettings.support_hours,
    "complaint_id_prefix": SystemSettings.complaint_id_prefix,
    "phone_country_code": SystemSettings.phone_country_code,
    "phone_expected_prefixes": SystemSettings.phone_expected_prefixes,
}

# Settings every installation must configure before the platform works.
REQUIRED_SETTINGS = {
    "organisation_name": "Organisation name",
    "product_name": "Product name",
    "timezone": "Time zone",
    "complaint_id_prefix": "Complaint ID prefix",
    "complaint_next_number": "Next complaint number",
    "reopen_window_days": "Reopen window (days)",
    "max_reopens": "Maximum reopens",
    "max_attachments_per_complaint": "Maximum attachments per complaint",
    "max_attachment_mb": "Maximum attachment size (MB)",
    "allowed_attachment_types": "Allowed attachment types",
    "phone_country_code": "Phone country code",
    "phone_number_length": "Phone number length",
}


class SettingNotConfigured(HTTPException):
    def __init__(self, field: str):
        self.field = field
        self.label = REQUIRED_SETTINGS.get(field, field)
        super().__init__(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"The system is not fully configured: '{self.label}' has not been set. "
            "Ask the Super Admin to complete it under Settings.",
        )


def get_settings(db: Session, for_update: bool = False) -> SystemSettings:
    # (None, not False: only a real lock request should bypass the identity map)
    settings = db.get(SystemSettings, SETTINGS_ID, with_for_update=True if for_update else None)
    if settings is None:
        # The row is created by `python manage.py migrate`; its absence means the DB was never set up.
        raise RuntimeError("system_settings row is missing; run `python manage.py migrate`")
    return settings


def require(db: Session, field: str):
    value = getattr(get_settings(db), field)
    if value is None or value == "":
        raise SettingNotConfigured(field)
    return value


def timezone(db: Session) -> ZoneInfo:
    name = require(db, "timezone")
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        raise SettingNotConfigured("timezone") from None


def day_start_utc(tz: ZoneInfo, day: date) -> datetime:
    """Midnight at the start of `day` in `tz`, as naive UTC (how times are stored).
    Days at the very ends of the calendar (e.g. year 1 typed into a date field) are refused."""
    try:
        return datetime.combine(day, datetime.min.time(), tz).astimezone(dt_timezone.utc).replace(tzinfo=None)
    except (OverflowError, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose dates in a realistic range") from None


def day_end_utc(tz: ZoneInfo, day: date) -> datetime:
    """Midnight at the end of `day` (the start of the next one) in `tz`, as naive UTC."""
    try:
        next_day = day + timedelta(days=1)
    except OverflowError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose dates in a realistic range") from None
    return day_start_utc(tz, next_day)


def allowed_attachment_types(db: Session) -> list[str]:
    return [t for t in require(db, "allowed_attachment_types").split(",") if t]


def configuration_problems(db: Session) -> list[dict]:
    """Everything an admin still has to set up, for the admin dashboard."""
    settings = get_settings(db)
    problems = [
        {"area": "settings", "field": field, "message": f"{label} is not set"}
        for field, label in REQUIRED_SETTINGS.items()
        if getattr(settings, field) in (None, "")
    ]
    if db.query(LocationType).count() == 0:
        problems.append({"area": "locations", "field": "location_types",
                         "message": "No location levels are defined"})
    active_priorities = db.query(Priority).filter(Priority.is_active.is_(True)).all()
    if not active_priorities:
        problems.append({"area": "priorities", "field": "priorities", "message": "No active priorities are defined"})
    for priority in active_priorities:
        has_default = db.query(SlaRule).filter(
            SlaRule.priority_id == priority.id, SlaRule.department_id.is_(None),
        ).first()
        if has_default is None:
            problems.append({"area": "sla", "field": f"sla:{priority.key}",
                             "message": f"Priority '{priority.name}' has no default SLA targets"})
    for breach_type in ("response", "resolution"):
        rule = db.query(EscalationRule).filter(
            EscalationRule.breach_type == breach_type, EscalationRule.department_id.is_(None),
        ).first()
        if rule is None:
            problems.append({"area": "sla", "field": f"escalation:{breach_type}",
                             "message": f"No default escalation rule for missed {breach_type} targets"})
    return problems


def message_channels(settings: SystemSettings) -> tuple[str, ...]:
    """The channels complaint updates go out on: enabled in Settings and not switched off on the server."""
    enabled = {"sms": settings.sms_notifications_enabled, "email": settings.email_notifications_enabled}
    return tuple(channel for channel in messaging.available_channels() if enabled[channel])


def serialize_settings(settings: SystemSettings) -> dict:
    return {
        "organisation_name": settings.organisation_name,
        "product_name": settings.product_name,
        "support_email": settings.support_email,
        "support_phone": settings.support_phone,
        "support_hours": settings.support_hours,
        "timezone": settings.timezone,
        "complaint_id_prefix": settings.complaint_id_prefix,
        "complaint_next_number": settings.complaint_next_number,
        "reopen_window_days": settings.reopen_window_days,
        "max_reopens": settings.max_reopens,
        "max_attachments_per_complaint": settings.max_attachments_per_complaint,
        "max_attachment_mb": settings.max_attachment_mb,
        "allowed_attachment_types": settings.allowed_attachment_types.split(",") if settings.allowed_attachment_types else [],
        "phone_country_code": settings.phone_country_code,
        "phone_number_length": settings.phone_number_length,
        "phone_expected_prefixes": settings.phone_expected_prefixes,
        "sms_notifications_enabled": settings.sms_notifications_enabled,
        "email_notifications_enabled": settings.email_notifications_enabled,
        "updated_at": settings.updated_at.isoformat() if settings.updated_at else None,
    }


def public_config(db: Session) -> dict:
    """What both frontends need before sign-in: branding, formats, limits and
    the shared UX defaults. Unset settings are returned as null; the apps hide
    whatever depends on them."""
    settings = get_settings(db)
    updates = message_channels(settings)
    return {
        "organisation_name": settings.organisation_name,
        "product_name": settings.product_name,
        "support": {
            "email": settings.support_email,
            "phone": settings.support_phone,
            "hours": settings.support_hours,
        },
        "timezone": settings.timezone,
        "phone": {
            "country_code": settings.phone_country_code,
            "number_length": settings.phone_number_length,
        },
        "attachments": {
            "max_per_complaint": settings.max_attachments_per_complaint,
            "max_mb": settings.max_attachment_mb,
            "allowed_types": settings.allowed_attachment_types.split(",") if settings.allowed_attachment_types else [],
        },
        # Whether complaint updates also go out by SMS / email (each end user can opt out).
        "notifications": {channel: channel in updates for channel in messaging.CHANNELS},
        "otp": {
            # The channels end users can sign in with (and confirm a new contact on).
            "channels": list(messaging.available_channels()),
            "length": config.OTP_LENGTH,
            "resend_after_seconds": config.OTP_RESEND_COOLDOWN_SECONDS,
            "expires_in_seconds": config.OTP_TTL_MINUTES * 60,
        },
        "password": {
            "min_length": config.PASSWORD_MIN_LENGTH,
            "max_bytes": PASSWORD_MAX_BYTES,
            "character_classes": config.PASSWORD_CHARACTER_CLASSES,
        },
        "limits": {
            "description": config.DESCRIPTION_MAX_LENGTH,
            "comment": config.COMMENT_MAX_LENGTH,
            "note": config.NOTE_MAX_LENGTH,
            "rejection_reason_min": config.REJECTION_REASON_MIN_LENGTH,
            **{field: max_length(column) for field, column in FORM_FIELD_COLUMNS.items()},
        },
        "ui": {
            "default_page_size": config.DEFAULT_PAGE_SIZE,
            "max_page_size": config.MAX_PAGE_SIZE,
            "report_default_days": config.REPORT_DEFAULT_DAYS,
            "report_preset_days": list(config.REPORT_PRESET_DAYS),
            "report_max_days": config.REPORT_MAX_DAYS,
            "dashboard_recent_items": config.DASHBOARD_RECENT_ITEMS,
            "notification_menu_items": config.NOTIFICATION_MENU_ITEMS,
            "search_debounce_ms": config.SEARCH_DEBOUNCE_MS,
            "lookup_min_chars": config.LOOKUP_MIN_CHARS,
            "lookup_results": config.LOOKUP_RESULTS,
            "toast_seconds": config.TOAST_SECONDS,
            "csv_preview_rows": config.CSV_PREVIEW_ROWS,
            "dashboard_trend_days": config.DASHBOARD_TREND_DAYS,
            "dashboard_comparison_days": config.DASHBOARD_COMPARISON_DAYS,
            "notification_poll_seconds": config.NOTIFICATION_POLL_SECONDS,
            "complaint_refresh_seconds": config.COMPLAINT_REFRESH_SECONDS,
            "sla_good_pct": config.SLA_GOOD_PCT,
            "sla_watch_pct": config.SLA_WATCH_PCT,
        },
    }
