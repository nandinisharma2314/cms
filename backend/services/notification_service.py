"""In-app notifications for staff and citizens.

`notify` is the single entry point; email/SMS delivery can be added here later
without touching the callers.
"""
from datetime import datetime
from typing import Iterable

from sqlalchemy.orm import Session

from models import Complaint, EndUser, Notification, User
from utils.security import utcnow


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
    seen: set[tuple[str, int]] = set()
    for recipient in recipients:
        if recipient is None or not recipient.is_active:
            continue
        recipient_type = "staff" if isinstance(recipient, User) else "end_user"
        key = (recipient_type, recipient.id)
        if key in seen or (exclude is not None and type(exclude) is type(recipient) and exclude.id == recipient.id):
            continue
        seen.add(key)
        db.add(Notification(
            recipient_type=recipient_type,
            recipient_id=recipient.id,
            kind=kind,
            title=title[:200],
            body=body[:1000] if body else None,
            complaint=complaint,
            created_at=at or utcnow(),
        ))


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


def list_for(db: Session, recipient_type: str, recipient_id: int, unread_only: bool, limit: int) -> dict:
    base = db.query(Notification).filter(
        Notification.recipient_type == recipient_type, Notification.recipient_id == recipient_id,
    )
    unread = base.filter(Notification.read_at.is_(None))
    items = (unread if unread_only else base).order_by(Notification.created_at.desc(), Notification.id.desc())
    return {
        "items": [serialize(n) for n in items.limit(min(max(limit, 1), 100)).all()],
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
