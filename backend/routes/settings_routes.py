"""Organisation settings and rejection reasons (permission settings.manage)."""
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func

from models import RejectionReason, SystemSettings, max_length
from services import audit_service, messaging, rejection_service, settings_service, storage_service
from services.access_service import AccessContext
from services.complaint_service import highest_number_used
from utils.auth_middleware import require_permission
from utils.security import normalize_email, utcnow
from utils.text import single_line

router = APIRouter()


class SettingsRequest(BaseModel):
    organisation_name: str | None = None
    product_name: str | None = None
    support_email: str | None = None
    support_phone: str | None = None
    support_hours: str | None = None
    timezone: str | None = None
    complaint_id_prefix: str | None = None
    complaint_next_number: int | None = None
    reopen_window_days: int | None = None
    max_reopens: int | None = None
    max_attachments_per_complaint: int | None = None
    max_attachment_mb: int | None = None
    allowed_attachment_types: list[str] | None = None
    phone_country_code: str | None = None
    phone_number_length: int | None = None
    phone_expected_prefixes: str | None = None
    sms_notifications_enabled: bool
    email_notifications_enabled: bool


class ReasonRequest(BaseModel):
    name: str


class ReasonUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None


class ReasonOrder(BaseModel):
    ids: list[int]


def _text(value: str | None, label: str, column) -> str | None:
    return single_line(value, label, max_length(column), required=False)


def _range(value: int | None, label: str, low: int, high: int) -> int | None:
    if value is not None and not low <= value <= high:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{label} must be between {low} and {high}")
    return value


@router.get("", include_in_schema=False)
@router.get("/")
def get_settings(ctx: AccessContext = Depends(require_permission("settings.manage"))):
    data = settings_service.serialize_settings(settings_service.get_settings(ctx.db))
    data["supported_attachment_types"] = list(settings_service.SUPPORTED_ATTACHMENT_TYPES)
    # Notifications can only be enabled on channels the server has not switched off.
    data["available_channels"] = list(messaging.available_channels())
    data["timezones"] = sorted(available_timezones())
    return data


@router.put("", include_in_schema=False)
@router.put("/")
def update_settings(payload: SettingsRequest, request: Request,
                    ctx: AccessContext = Depends(require_permission("settings.manage"))):
    """Replaces every setting (send the full form). Empty text clears a value.
    The next complaint number is the exception: null keeps the current one,
    which moves on with every new complaint while the form is open."""
    # Locked like complaint creation does, so the ID check below can't race a new complaint.
    settings = settings_service.get_settings(ctx.db, for_update=True)
    before = settings_service.serialize_settings(settings)

    support_email = _text(payload.support_email, "Support email", SystemSettings.support_email)
    if support_email is not None and normalize_email(support_email) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Support email is not a valid email address")
    timezone = _text(payload.timezone, "Time zone", SystemSettings.timezone)
    if timezone is not None:
        try:
            ZoneInfo(timezone)
        except (ZoneInfoNotFoundError, ValueError):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown time zone '{timezone}'") from None
    prefix = _text(payload.complaint_id_prefix, "Complaint ID prefix", SystemSettings.complaint_id_prefix)
    if prefix is not None and not re.fullmatch(r"[A-Z][A-Z0-9]*", prefix):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Complaint ID prefix must be capital letters or digits, starting with a letter")
    country_code = _text(payload.phone_country_code, "Phone country code", SystemSettings.phone_country_code)
    if country_code is not None and not re.fullmatch(r"\+[1-9]\d{0,3}", country_code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Phone country code must look like +91 or +1")
    expected = _text(payload.phone_expected_prefixes, "Expected leading digits", SystemSettings.phone_expected_prefixes)
    if expected is not None and not re.fullmatch(r"\d+", expected):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Expected leading digits must be digits only, e.g. 6789")
    types = None
    if payload.allowed_attachment_types is not None:
        types = sorted({t.strip().lower().lstrip(".") for t in payload.allowed_attachment_types if t.strip()})
        unknown = [t for t in types if t not in settings_service.SUPPORTED_ATTACHMENT_TYPES]
        if unknown:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unsupported attachment types: {', '.join(unknown)}")
    available = messaging.available_channels()
    if payload.sms_notifications_enabled and "sms" not in available:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "SMS is switched off on the server (SMS_DELIVERY=off)")
    if payload.email_notifications_enabled and "email" not in available:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email is switched off on the server (EMAIL_DELIVERY=off)")
    next_number = (payload.complaint_next_number if payload.complaint_next_number is not None
                   else settings.complaint_next_number)
    if next_number is not None and next_number < 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The next complaint number must be at least 1")
    if prefix is not None and next_number is not None:
        used = highest_number_used(ctx.db, prefix)
        if used is not None and next_number <= used:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                f"{prefix}-{used} has already been issued; the next complaint number must be "
                                f"greater than {used}")

    settings.organisation_name = _text(payload.organisation_name, "Organisation name", SystemSettings.organisation_name)
    settings.product_name = _text(payload.product_name, "Product name", SystemSettings.product_name)
    settings.support_email = normalize_email(support_email) if support_email else None
    settings.support_phone = _text(payload.support_phone, "Support phone", SystemSettings.support_phone)
    settings.support_hours = _text(payload.support_hours, "Support hours", SystemSettings.support_hours)
    settings.timezone = timezone
    settings.complaint_id_prefix = prefix
    settings.complaint_next_number = next_number
    settings.reopen_window_days = _range(payload.reopen_window_days, "Reopen window", 0, 365)
    settings.max_reopens = _range(payload.max_reopens, "Maximum reopens", 0, 100)
    settings.max_attachments_per_complaint = _range(payload.max_attachments_per_complaint, "Maximum attachments", 0, 50)
    settings.max_attachment_mb = _range(payload.max_attachment_mb, "Maximum attachment size", 1, 100)
    settings.allowed_attachment_types = ",".join(types) if types else None
    settings.phone_country_code = country_code
    settings.phone_number_length = _range(payload.phone_number_length, "Phone number length", 4, 15)
    settings.phone_expected_prefixes = expected
    settings.sms_notifications_enabled = payload.sms_notifications_enabled
    settings.email_notifications_enabled = payload.email_notifications_enabled
    settings.updated_at = utcnow()
    settings.updated_by_id = ctx.user.id

    after = settings_service.serialize_settings(settings)
    changes = audit_service.diff({k: v for k, v in before.items() if k != "updated_at"},
                                 {k: v for k, v in after.items() if k != "updated_at"})
    if changes:
        audit_service.record(ctx.db, actor=ctx.user, action="settings.update", entity_type="settings", entity_id=1,
                             summary=f"Updated settings: {', '.join(changes)}", changes=changes, request=request)
    ctx.db.commit()
    return after


@router.get("/status")
def configuration_status(ctx: AccessContext = Depends(require_permission("settings.manage"))):
    """What still has to be configured before the platform fully works."""
    return {"problems": settings_service.configuration_problems(ctx.db)}


@router.post("/logo")
def upload_logo(
    request: Request,
    file: UploadFile = File(...),
    ctx: AccessContext = Depends(require_permission("settings.manage"))
):
    settings = settings_service.get_settings(ctx.db, for_update=True)
    before = settings_service.serialize_settings(settings)

    content = file.file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is larger than 2MB")

    content_type = file.content_type or "application/octet-stream"
    if not content_type.startswith("image/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File must be an image")

    _, url = storage_service.save_file(bytes(content), file.filename, content_type, folder="logos", is_public=True)

    settings.logo_url = url
    settings.updated_at = utcnow()
    settings.updated_by_id = ctx.user.id
    ctx.db.commit()

    settings_service.serialize_settings(settings)

    audit_service.record(ctx.db, actor=ctx.user, action="settings.logo_upload", entity_type="settings", entity_id=1,
                         summary="Uploaded new organisation logo", changes={"logo_url": [before.get("logo_url"), url]}, request=request)

    return {"logo_url": url}


# ---------------------------------------------------------------------------
# Rejection reasons
# ---------------------------------------------------------------------------

@router.get("/rejection-reasons")
def list_reasons(ctx: AccessContext = Depends(require_permission("settings.manage"))):
    return [rejection_service.serialize_reason(r) for r in rejection_service.list_reasons(ctx.db, include_inactive=True)]


def _reason_name(ctx: AccessContext, name: str, exclude_id: int | None = None) -> str:
    name = single_line(name, "Name", max_length(RejectionReason.name))
    query = ctx.db.query(RejectionReason).filter(func.lower(RejectionReason.name) == name.lower())
    if exclude_id is not None:
        query = query.filter(RejectionReason.id != exclude_id)
    if query.first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A reason with this name already exists")
    return name


@router.post("/rejection-reasons", status_code=status.HTTP_201_CREATED)
def create_reason(payload: ReasonRequest, request: Request,
                  ctx: AccessContext = Depends(require_permission("settings.manage"))):
    name = _reason_name(ctx, payload.name)
    last = ctx.db.query(func.max(RejectionReason.sort_order)).scalar()
    reason = RejectionReason(name=name, sort_order=(last or 0) + 1, is_active=True)
    ctx.db.add(reason)
    ctx.db.flush()
    audit_service.record(ctx.db, actor=ctx.user, action="settings.rejection_reason_create", entity_type="rejection_reason",
                         entity_id=reason.id, summary=f"Added rejection reason {name}", request=request)
    ctx.db.commit()
    return rejection_service.serialize_reason(reason)


@router.patch("/rejection-reasons/{reason_id}")
def update_reason(reason_id: int, payload: ReasonUpdate, request: Request,
                  ctx: AccessContext = Depends(require_permission("settings.manage"))):
    reason = ctx.db.get(RejectionReason, reason_id)
    if reason is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reason not found")
    before = rejection_service.serialize_reason(reason)
    if payload.name is not None:
        reason.name = _reason_name(ctx, payload.name, exclude_id=reason.id)
    if payload.is_active is not None:
        reason.is_active = payload.is_active
    changes = audit_service.diff(before, rejection_service.serialize_reason(reason))
    if changes:
        audit_service.record(ctx.db, actor=ctx.user, action="settings.rejection_reason_update",
                             entity_type="rejection_reason", entity_id=reason.id,
                             summary=f"Updated rejection reason {reason.name}", changes=changes, request=request)
    ctx.db.commit()
    return rejection_service.serialize_reason(reason)


@router.put("/rejection-reasons/order")
def reorder_reasons(payload: ReasonOrder, ctx: AccessContext = Depends(require_permission("settings.manage"))):
    reasons = {r.id: r for r in ctx.db.query(RejectionReason).all()}
    if sorted(payload.ids) != sorted(reasons):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The order must list every reason exactly once")
    for position, reason_id in enumerate(payload.ids, start=1):
        reasons[reason_id].sort_order = position
    ctx.db.commit()
    return [rejection_service.serialize_reason(r) for r in rejection_service.list_reasons(ctx.db, include_inactive=True)]
