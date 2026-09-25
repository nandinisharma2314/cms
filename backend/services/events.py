"""Complaint timeline entries (complaint_history)."""
from datetime import datetime

from sqlalchemy.orm import Session

from models import Complaint, ComplaintEvent, EndUser, User
from utils.security import utcnow


def actor_fields(actor: User | EndUser | None) -> dict:
    if isinstance(actor, User):
        return {"actor_type": "staff", "actor_id": actor.id, "actor_name": actor.name}
    if isinstance(actor, EndUser):
        return {"actor_type": "end_user", "actor_id": actor.id, "actor_name": actor.name}
    return {"actor_type": "system", "actor_id": None, "actor_name": None}


def record_event(
    db: Session,
    complaint: Complaint,
    event_type: str,
    actor: User | EndUser | None,
    message: str,
    public_message: str | None = None,
    *,
    from_status: str | None = None,
    to_status: str | None = None,
    note: str | None = None,
    at: datetime | None = None,
) -> None:
    db.add(ComplaintEvent(
        complaint=complaint,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        message=message[:500],
        public_message=public_message[:500] if public_message else None,
        note=note,
        created_at=at or utcnow(),
        **actor_fields(actor),
    ))
