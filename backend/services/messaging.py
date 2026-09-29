"""Outgoing SMS and email.

Each channel is configured on its own (SMS_DELIVERY, EMAIL_DELIVERY): `console`
writes messages to the log (development and tests), `twilio` / `smtp` send
them, `off` means the channel is not used. The senders raise MessageError when
a message could not be sent, so callers decide whether to retry or report it.
"""
import base64
import contextlib
import json
import logging
import smtplib
import ssl
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage

import config

logger = logging.getLogger(__name__)


CHANNELS = ("sms", "email")


class MessageError(Exception):
    pass


def available_channels() -> tuple[str, ...]:
    """The channels that are not switched off, in display order."""
    modes = {"sms": config.SMS_DELIVERY, "email": config.EMAIL_DELIVERY}
    return tuple(channel for channel in CHANNELS if modes[channel] != "off")


def send_sms(to: str, body: str) -> None:
    """`to` is a full international number, e.g. +919876543210."""
    if config.SMS_DELIVERY == "off":
        raise MessageError("SMS is switched off (SMS_DELIVERY=off)")
    if config.SMS_DELIVERY == "console":
        logger.warning("SMS to %s: %s", to, body)
        return
    url = f"https://api.twilio.com/2010-04-01/Accounts/{config.TWILIO_ACCOUNT_SID}/Messages.json"
    data = urllib.parse.urlencode({"To": to, "From": config.TWILIO_FROM_NUMBER, "Body": body}).encode()
    credentials = base64.b64encode(f"{config.TWILIO_ACCOUNT_SID}:{config.TWILIO_AUTH_TOKEN}".encode()).decode()
    request = urllib.request.Request(url, data=data, method="POST", headers={"Authorization": f"Basic {credentials}"})
    try:
        with urllib.request.urlopen(request, timeout=config.MESSAGE_TIMEOUT_SECONDS) as response:
            response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        with contextlib.suppress(ValueError):
            detail = json.loads(detail).get("message", detail)
        raise MessageError(f"SMS provider rejected the message: {detail[:300]}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise MessageError(f"SMS provider unreachable: {exc}") from exc


def send_email(to: str, subject: str, body: str) -> None:
    if config.EMAIL_DELIVERY == "off":
        raise MessageError("Email is switched off (EMAIL_DELIVERY=off)")
    if config.EMAIL_DELIVERY == "console":
        logger.warning("Email to %s: %s\n%s", to, subject, body)
        return
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = config.SMTP_FROM
    message["To"] = to
    message.set_content(body)
    try:
        if config.SMTP_SECURITY == "ssl":
            server = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=config.MESSAGE_TIMEOUT_SECONDS,
                                      context=ssl.create_default_context())
        else:
            server = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=config.MESSAGE_TIMEOUT_SECONDS)
        with server:
            if config.SMTP_SECURITY == "starttls":
                server.starttls(context=ssl.create_default_context())
            if config.SMTP_USERNAME:
                server.login(config.SMTP_USERNAME, config.SMTP_PASSWORD)
            server.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        raise MessageError(f"Email could not be sent: {exc}") from exc
