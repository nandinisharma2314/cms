"""Notifications for staff and end users.

`notify` is the single entry point. Every notification appears in the app;
for end users it is also queued as SMS and/or email when the organisation has
enabled that channel (Settings) and the end user has not opted out (profile).
The background worker sends queued messages (see deliver_due).
"""
import logging
from datetime import datetime, timedelta
from collections.abc import Iterable

from sqlalchemy.orm import Session, joinedload

from config import MESSAGE_MAX_ATTEMPTS
from models import (
    DELIVERY_FAILED, DELIVERY_PENDING, DELIVERY_SENT, Complaint, EndUser, MessageDelivery, Notification, User,
    max_length,
)
from services import messaging, settings_service
from services.phone_service import phone_format
from utils.security import utcnow

logger = logging.getLogger(__name__)


def notify(
    db: Session,
    recipients: Iterable[User | EndUser | None],
    kind: str,
    title: str,
    body: str | None = None,
    complaint: Complaint | None = None,
    *,
    exclude: User | EndUser | None = None,
    at: datetime | None = None,
) -> None:
    """Adds one notification per distinct, active recipient (skipping None and
    `exclude`, usually the person who caused the event). The caller commits."""
    settings = settings_service.get_settings(db)
    seen: set[tuple[str, int]] = set()
    now = at or utcnow()
    for recipient in recipients:
        if recipient is None or not recipient.is_active:
            continue
        recipient_type = "staff" if isinstance(recipient, User) else "end_user"
        key = (recipient_type, recipient.id)
        if key in seen or (exclude is not None and type(exclude) is type(recipient) and exclude.id == recipient.id):
            continue
        seen.add(key)
        notification = Notification(
            recipient_type=recipient_type,
            recipient_id=recipient.id,
            kind=kind,
            title=title[:max_length(Notification.title)],
            body=body[:max_length(Notification.body)] if body else None,
            complaint=complaint,
            created_at=now,
        )
        db.add(notification)
        if isinstance(recipient, EndUser):
            for channel in settings_service.message_channels(settings):
                if channel == "sms" and recipient.notify_sms:
                    target = recipient.mobile
                elif channel == "email" and recipient.notify_email:
                    target = recipient.email
                else:
                    continue
                db.add(MessageDelivery(notification=notification, channel=channel, target=target,
                                       status=DELIVERY_PENDING, attempts=0, next_attempt_at=now))


def serialize(n: Notification) -> dict:
    return {
        "id": n.id,
        "kind": n.kind,
        "title": n.title,
        "body": n.body,
        "complaint_id": n.complaint.generated_id if n.complaint else None,
        "created_at": n.created_at.isoformat(),
        "read_at": n.read_at.isoformat() if n.read_at else None,
    }


def list_for(db: Session, recipient_type: str, recipient_id: int, unread_only: bool, page: int, page_size: int) -> dict:
    base = db.query(Notification).filter(
        Notification.recipient_type == recipient_type, Notification.recipient_id == recipient_id,
    )
    unread = base.filter(Notification.read_at.is_(None))
    query = unread if unread_only else base
    total = query.count()
    items = (
        query.options(joinedload(Notification.complaint))
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": [serialize(n) for n in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "unread_count": unread.count(),
    }


def mark_read(db: Session, recipient_type: str, recipient_id: int, notification_id: int | None = None) -> None:
    """Marks one notification (or all when id is None) as read. Commits."""
    query = db.query(Notification).filter(
        Notification.recipient_type == recipient_type,
        Notification.recipient_id == recipient_id,
        Notification.read_at.is_(None),
    )
    if notification_id is not None:
        query = query.filter(Notification.id == notification_id)
    query.update({Notification.read_at: utcnow()}, synchronize_session=False)
    db.commit()


# ---------------------------------------------------------------------------
# SMS / email delivery (background worker)
# ---------------------------------------------------------------------------

def _message_text(db: Session, notification: Notification) -> tuple[str, str]:
    product = settings_service.require(db, "product_name")
    subject = f"{product}: {notification.title}"
    body = notification.title if not notification.body else f"{notification.title}\n\n{notification.body}"
    return subject, body


def deliver_due(db: Session, batch_size: int) -> dict[str, int]:
    """Sends queued messages that are due, retrying failures with growing
    delays up to MESSAGE_MAX_ATTEMPTS. Commits after each message."""
    now = utcnow()
    due = (
        db.query(MessageDelivery)
        .filter(MessageDelivery.status == DELIVERY_PENDING, MessageDelivery.next_attempt_at <= now)
        .order_by(MessageDelivery.next_attempt_at)
        .limit(batch_size)
        .with_for_update(skip_locked=True)
        .all()
    )
    summary = {"sent": 0, "failed": 0, "retrying": 0}
    available = messaging.available_channels()
    for delivery in due:
        if delivery.channel not in available:
            # Queued before the channel was switched off: retrying would never succeed.
            delivery.status = DELIVERY_FAILED
            delivery.last_error = f"{delivery.channel} is switched off"
            summary["failed"] += 1
            db.commit()
            continue
        subject, body = _message_text(db, delivery.notification)
        delivery.attempts += 1
        try:
            if delivery.channel == "sms":
                messaging.send_sms(phone_format(db).international(delivery.target), body[:600])
            else:
                messaging.send_email(delivery.target, subject, body)
        except messaging.MessageError as exc:
            delivery.last_error = str(exc)[:max_length(MessageDelivery.last_error)]
            if delivery.attempts >= MESSAGE_MAX_ATTEMPTS:
                delivery.status = DELIVERY_FAILED
                summary["failed"] += 1
                logger.error("Giving up on %s message %s: %s", delivery.channel, delivery.id, exc)
            else:
                delivery.next_attempt_at = now + timedelta(minutes=2 ** delivery.attempts)
                summary["retrying"] += 1
        else:
            delivery.status = DELIVERY_SENT
            delivery.sent_at = utcnow()
            summary["sent"] += 1
        db.commit()
    return summary
