"""One-time codes for end-user sign-in and for confirming a new mobile/email.

Sign-in works on the identifier the end user typed, never revealing whether it
is registered: an unknown identifier gets a decoy challenge with the same
response (nothing is sent and no code verifies it). After a correct code the
caller receives every active end user registered with that identifier; when a
family shares one phone, they pick their account.
"""
import hashlib
import hmac
import logging
import secrets
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

import config
from database import SessionLocal
from models import OTP_PURPOSE_CONTACT, OTP_PURPOSE_LOGIN, EndUser, OtpChallenge
from services import messaging, rate_limit_service, settings_service
from services.phone_service import phone_format
from utils.security import new_opaque_token, normalize_email, utcnow

HOUR = timedelta(hours=1)

logger = logging.getLogger(__name__)


def _code_hash(challenge_id: str, code: str) -> str:
    key = config.JWT_SECRET_KEY.encode("utf-8")
    return hmac.new(key, f"{challenge_id}:{code}".encode(), hashlib.sha256).hexdigest()


def normalize_identifier(db: Session, channel: str, raw: str | None) -> str:
    if channel not in messaging.CHANNELS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Channel must be 'sms' or 'email'")
    if channel not in messaging.available_channels():
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Codes can't be sent by SMS here" if channel == "sms" else "Codes can't be sent by email here")
    if channel == "sms":
        fmt = phone_format(db)
        value = fmt.normalize(raw)
        if value is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Enter your mobile number as {fmt.describe()}")
        return value
    value = normalize_email(raw)
    if value is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter a valid email address")
    return value


def mask_target(db: Session, channel: str, target: str) -> str:
    if channel == "sms":
        return f"{settings_service.require(db, 'phone_country_code')} {'•' * (len(target) - 4)}{target[-4:]}"
    local, _, domain = target.partition("@")
    return f"{local[:2]}{'•' * max(len(local) - 2, 1)}@{domain}"


def _send(db: Session, challenge: OtpChallenge, code: str) -> None:
    """Sends the code; raises messaging.MessageError when that fails."""
    product = settings_service.require(db, "product_name")
    text = f"{code} is your {product} verification code. It expires in {config.OTP_TTL_MINUTES} minutes."
    if config.IS_DEVELOPMENT or config.EXPOSE_DEV_OTP:
        print(
            f"\n"
            f"==================================== [DEV LOGIN OTP] ====================================\n"
            f"Channel:    {challenge.channel.upper()}\n"
            f"Target:     {challenge.target}\n"
            f"OTP Code:   {code}\n"
            f"Expires In: {config.OTP_TTL_MINUTES} minutes\n"
            f"=========================================================================================\n",
            flush=True,
        )
    if challenge.channel == "sms":
        messaging.send_sms(phone_format(db).international(challenge.target), text)
    else:
        messaging.send_email(challenge.target, f"Your {product} verification code", text)


def send_login_code(db_or_id: Session | str, challenge_or_code: OtpChallenge | str, code: str | None = None) -> None:
    """Sends a sign-in code. When sending fails the challenge is removed so the person can ask again at once."""
    if isinstance(db_or_id, Session):
        db = db_or_id
        challenge = challenge_or_code
        actual_code = code
        try:
            _send(db, challenge, actual_code)
        except messaging.MessageError:
            logger.exception("Could not send a %s sign-in code", challenge.channel)
            db.delete(challenge)
            db.commit()
            raise
    else:
        challenge_id = db_or_id
        actual_code = challenge_or_code
        with SessionLocal() as db:
            challenge = db.query(OtpChallenge).filter(OtpChallenge.challenge_id == challenge_id).first()
            if challenge is None:
                return
            try:
                _send(db, challenge, actual_code)
            except messaging.MessageError:
                logger.exception("Could not send a %s sign-in code", challenge.channel)
                db.delete(challenge)
                db.commit()
                raise


def _issue(db: Session, purpose: str, channel: str, target: str, end_user: EndUser | None,
           decoy: bool) -> tuple[OtpChallenge, str]:
    now = utcnow()
    latest = (
        db.query(OtpChallenge)
        .filter(OtpChallenge.purpose == purpose, OtpChallenge.channel == channel, OtpChallenge.target == target)
        .order_by(OtpChallenge.created_at.desc())
        .first()
    )
    if latest is not None:
        wait = config.OTP_RESEND_COOLDOWN_SECONDS - (now - latest.created_at).total_seconds()
        if wait > 0:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                                f"Please wait {int(wait) + 1} seconds before requesting another code.",
                                headers={"Retry-After": str(int(wait) + 1)})
    db.query(OtpChallenge).filter(
        OtpChallenge.purpose == purpose, OtpChallenge.channel == channel, OtpChallenge.target == target,
        OtpChallenge.consumed_at.is_(None),
    ).update({OtpChallenge.consumed_at: now}, synchronize_session=False)

    code = f"{secrets.randbelow(10 ** config.OTP_LENGTH):0{config.OTP_LENGTH}d}"
    challenge_id = new_opaque_token()
    challenge = OtpChallenge(
        challenge_id=challenge_id, purpose=purpose, channel=channel, target=target,
        end_user_id=end_user.id if end_user else None, is_decoy=decoy,
        code_hash=_code_hash(challenge_id, code), attempts=0,
        expires_at=now + timedelta(minutes=config.OTP_TTL_MINUTES), created_at=now,
    )
    db.add(challenge)
    db.commit()
    return challenge, code


def matching_end_users(db: Session, channel: str, target: str) -> list[EndUser]:
    column = EndUser.mobile if channel == "sms" else EndUser.email
    return db.query(EndUser).filter(column == target, EndUser.is_active.is_(True)).order_by(EndUser.id).all()


def request_login_code(db: Session, channel: str, raw_identifier: str | None,
                       client_ip: str) -> tuple[OtpChallenge, str]:
    """Creates a sign-in challenge. Returns it and the code to send.
    If the user is not found or inactive, tells them to contact support."""
    target = normalize_identifier(db, channel, raw_identifier)
    rate_limit_service.enforce(db, "otp_request_ip", client_ip, config.OTP_REQUESTS_PER_IP_PER_HOUR, HOUR,
                               "Too many code requests from this network. Please try again later.")
    rate_limit_service.enforce(db, "otp_request_target", f"{channel}:{target}",
                               config.OTP_REQUESTS_PER_TARGET_PER_HOUR, HOUR,
                               "Too many codes were requested for this address. Please try again later.")
    
    column = EndUser.mobile if channel == "sms" else EndUser.email
    users = db.query(EndUser).filter(column == target).all()
    if not users:
        settings = settings_service.get_settings(db)
        support = []
        if settings.support_email:
            support.append(f"email: {settings.support_email}")
        if settings.support_phone:
            support.append(f"phone: {settings.support_phone}")
        contact_str = f" ({', '.join(support)})" if support else ""
        channel_name = "mobile number" if channel == "sms" else "email address"
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"No registered account was found with this {channel_name}. Please contact support{contact_str} to register your account.",
        )
    
    active_users = [u for u in users if u.is_active]
    if not active_users:
        settings = settings_service.get_settings(db)
        support = []
        if settings.support_email:
            support.append(f"email: {settings.support_email}")
        if settings.support_phone:
            support.append(f"phone: {settings.support_phone}")
        contact_str = f" ({', '.join(support)})" if support else ""
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Your account is inactive. Please contact support{contact_str}.",
        )

    challenge, code = _issue(db, OTP_PURPOSE_LOGIN, channel, target, None, decoy=False)
    return challenge, code


def _check(db: Session, challenge_id: str, code: str, purpose: str, client_ip: str) -> OtpChallenge:
    rate_limit_service.enforce(db, "otp_verify_ip", client_ip, config.OTP_VERIFICATIONS_PER_IP_PER_HOUR, HOUR,
                               "Too many attempts from this network. Please try again later.")
    challenge = db.query(OtpChallenge).filter(
        OtpChallenge.challenge_id == challenge_id, OtpChallenge.purpose == purpose,
    ).with_for_update().first()
    expired = HTTPException(status.HTTP_400_BAD_REQUEST, "This code has expired. Please request a new one.")
    if (challenge is None or challenge.consumed_at is not None or challenge.expires_at < utcnow()
            or challenge.attempts >= config.OTP_MAX_ATTEMPTS):
        db.rollback()
        raise expired
    challenge.attempts += 1
    correct = not challenge.is_decoy and hmac.compare_digest(
        challenge.code_hash, _code_hash(challenge_id, (code or "").strip()),
    )
    if not correct:
        remaining = config.OTP_MAX_ATTEMPTS - challenge.attempts
        db.commit()
        if remaining <= 0:
            raise expired
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"That code is not correct. {remaining} attempt{'s' if remaining != 1 else ''} left.")
    challenge.consumed_at = utcnow()
    return challenge


def verify_login_code(db: Session, challenge_id: str, code: str, client_ip: str) -> tuple[str, str, list[EndUser]]:
    """Returns (channel, target, active end users) for a correct code. Commits."""
    challenge = _check(db, challenge_id, code, OTP_PURPOSE_LOGIN, client_ip)
    end_users = matching_end_users(db, challenge.channel, challenge.target)
    db.commit()
    if not end_users:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This code has expired. Please request a new one.")
    return challenge.channel, challenge.target, end_users


def request_contact_change(db: Session, end_user: EndUser, channel: str, raw_value: str | None,
                           client_ip: str) -> tuple[OtpChallenge, str]:
    """Sends a code to the new mobile number / email address. Commits."""
    target = normalize_identifier(db, channel, raw_value)
    current = end_user.mobile if channel == "sms" else end_user.email
    if target == current:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That is already your registered contact")
    new_mobile = target if channel == "sms" else end_user.mobile
    new_email = target if channel == "email" else end_user.email
    clash = db.query(EndUser).filter(
        EndUser.mobile == new_mobile, EndUser.email == new_email, EndUser.id != end_user.id,
    ).first()
    if clash is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Another account already uses this mobile number and email")
    rate_limit_service.enforce(db, "otp_request_ip", client_ip, config.OTP_REQUESTS_PER_IP_PER_HOUR, HOUR,
                               "Too many code requests from this network. Please try again later.")
    rate_limit_service.enforce(db, "otp_request_target", f"{channel}:{target}",
                               config.OTP_REQUESTS_PER_TARGET_PER_HOUR, HOUR,
                               "Too many codes were requested for this address. Please try again later.")
    challenge, code = _issue(db, OTP_PURPOSE_CONTACT, channel, target, end_user, decoy=False)
    try:
        _send(db, challenge, code)
    except messaging.MessageError:
        logger.exception("Could not send a %s verification code", channel)
        db.delete(challenge)  # so the person can try again at once
        db.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            "The verification code could not be sent. Please try again in a few minutes.") from None
    return challenge, code


def verify_contact_change(db: Session, end_user: EndUser, challenge_id: str, code: str,
                          client_ip: str) -> tuple[str, str, str]:
    """Applies the verified new contact. Returns (channel, old value, new value). Does not commit."""
    challenge = _check(db, challenge_id, code, OTP_PURPOSE_CONTACT, client_ip)
    if challenge.end_user_id != end_user.id:
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This code has expired. Please request a new one.")
    if challenge.channel == "sms":
        old, end_user.mobile = end_user.mobile, challenge.target
    else:
        old, end_user.email = end_user.email, challenge.target
    clash = db.query(EndUser).filter(
        EndUser.mobile == end_user.mobile, EndUser.email == end_user.email, EndUser.id != end_user.id,
    ).first()
    if clash is not None:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Another account already uses this mobile number and email")
    return challenge.channel, old, challenge.target


def prune(db: Session) -> int:
    """Deletes challenges that expired over a day ago. Commits."""
    count = db.query(OtpChallenge).filter(OtpChallenge.expires_at < utcnow() - timedelta(days=1)).delete(
        synchronize_session=False,
    )
    db.commit()
    return count

