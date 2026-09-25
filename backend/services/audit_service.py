import json

from fastapi import Request
from sqlalchemy.orm import Session

from models import AuditLog, EndUser, User


def diff(before: dict, after: dict) -> dict:
    """{"field": [old, new]} for every key whose value changed."""
    return {
        key: [before.get(key), after.get(key)]
        for key in after
        if before.get(key) != after.get(key)
    }


def record(
    db: Session,
    *,
    actor: User | EndUser | None,
    action: str,
    entity_type: str,
    entity_id,
    summary: str,
    changes: dict | None = None,
    request: Request | None = None,
) -> None:
    """Adds an audit entry to the session; the caller's commit persists it
    together with the change being audited."""
    if isinstance(actor, User):
        actor_type = "staff"
    elif isinstance(actor, EndUser):
        actor_type = "end_user"
    else:
        actor_type = "system"
    db.add(AuditLog(
        actor_type=actor_type,
        actor_id=actor.id if actor is not None else None,
        actor_name=actor.name if actor is not None else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        summary=summary[:500],
        changes=json.dumps(changes, default=str) if changes else None,
        ip_address=request.client.host if request is not None and request.client else None,
    ))
