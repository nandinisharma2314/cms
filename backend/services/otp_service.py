import hmac
import logging
import secrets
import smtplib
from email.message import EmailMessage
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from config import (
    IS_DEVELOPMENT, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_MINUTES, SMS_COUNTRY_CODE, SMTP_PASSWORD,
    SMTP_PORT, SMTP_SERVER, SMTP_USERNAME, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER,
)
from models import EndUser, OtpChallenge
from utils.security import new_opaque_token, sha256_hex, utcnow

logger = logging.getLogger(__name__)

CHANNELS = ("sms", "email")


def _code_hash(challenge_id: str, code: str) -> str:
    return sha256_hex(f"{challenge_id}:{code}")


def issue_challenge(db: Session, end_user: EndUser, channel: str) -> tuple[OtpChallenge, str]:
    """Creates a new OTP challenge (invalidating older open ones) and returns it
    with the plain code. Commits."""
    now = utcnow()
    latest = (
        db.query(OtpChallenge)
        .filter(OtpChallenge.end_user_id == end_user.id)
        .order_by(OtpChallenge.created_at.desc())
        .first()
    )
    if latest is not None:
        wait = OTP_RESEND_COOLDOWN_SECONDS - (now - latest.created_at).total_seconds()
        if wait > 0:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Please wait {int(wait) + 1} seconds before requesting another code.",
            )

    db.query(OtpChallenge).filter(
        OtpChallenge.end_user_id == end_user.id,
        OtpChallenge.consumed_at.is_(None),
    ).update({OtpChallenge.consumed_at: now}, synchronize_session=False)

    code = f"{secrets.randbelow(10**6):06d}"
    challenge_id = new_opaque_token()
    challenge = OtpChallenge(
        challenge_id=challenge_id,
        end_user_id=end_user.id,
        channel=channel,
        code_hash=_code_hash(challenge_id, code),
        expires_at=now + timedelta(minutes=OTP_TTL_MINUTES),
    )
    db.add(challenge)
    db.commit()
    return challenge, code


def deliver(end_user: EndUser, channel: str, code: str) -> None:
    """Sends the code by SMS (Twilio) or email (SMTP). In development it is
    printed instead. Raises 502 when the provider fails."""
    message = f"Your CMS verification code is {code}. It expires in {OTP_TTL_MINUTES} minutes."
    if IS_DEVELOPMENT:
        target = end_user.mobile if channel == "sms" else end_user.email
        print(f"--- CMS OTP for {target} ({channel}) is {code} ---", flush=True)
        return
    try:
        if channel == "sms":
            from twilio.rest import Client  # imported lazily: only needed outside development

            Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN).messages.create(
                body=message, from_=TWILIO_PHONE_NUMBER, to=f"{SMS_COUNTRY_CODE}{end_user.mobile}",
            )
        else:
            email = EmailMessage()
            email.set_content(message)
            email["Subject"] = "CMS login verification"
            email["From"] = SMTP_USERNAME
            email["To"] = end_user.email
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(email)
    except Exception:
        logger.exception("Sending the OTP by %s to end user %s failed", channel, end_user.id)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not send the verification code. Please try again.")


def verify_challenge(db: Session, challenge_id: str, code: str) -> EndUser:
    """Checks the code and consumes the challenge. Commits."""
    challenge = db.query(OtpChallenge).filter(OtpChallenge.challenge_id == challenge_id).first()
    expired_error = HTTPException(
        status.HTTP_400_BAD_REQUEST, "Verification code expired. Please request a new one."
    )
    if (
        challenge is None
        or challenge.consumed_at is not None
        or challenge.expires_at < utcnow()
        or challenge.attempts >= OTP_MAX_ATTEMPTS
    ):
        raise expired_error

    challenge.attempts += 1
    if not hmac.compare_digest(challenge.code_hash, _code_hash(challenge_id, code.strip())):
        remaining = OTP_MAX_ATTEMPTS - challenge.attempts
        db.commit()
        if remaining <= 0:
            raise expired_error
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Invalid verification code. {remaining} attempt{'s' if remaining != 1 else ''} left.",
        )

    challenge.consumed_at = utcnow()
    end_user = challenge.end_user
    end_user.last_login_at = utcnow()
    db.commit()
    return end_user


def mask_target(end_user: EndUser, channel: str) -> str:
    if channel == "sms":
        return f"******{end_user.mobile[-4:]}"
    local, _, domain = end_user.email.partition("@")
    return f"{local[:2]}{'*' * max(len(local) - 2, 1)}@{domain}"
