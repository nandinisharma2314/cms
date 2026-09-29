"""Complaint priorities, managed by admins with `sla.manage`.

A priority is created together with its default SLA targets, so every active
priority always has response and resolution targets. Categories name the
priority their complaints start with; staff may change it afterwards.
"""

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from config import SLA_MAX_HOURS
from models import PRIORITY_TONES, ComplaintCategory, Priority, SlaRule, max_length
from utils.text import machine_key, single_line



def serialize(priority: Priority) -> dict:
    return {
        "id": priority.id,
        "key": priority.key,
        "name": priority.name,
        "rank": priority.rank,
        "tone": priority.tone,
        "is_active": priority.is_active,
    }


def list_priorities(db: Session, include_inactive: bool) -> list[Priority]:
    query = db.query(Priority)
    if not include_inactive:
        query = query.filter(Priority.is_active.is_(True))
    return query.order_by(Priority.rank).all()


def get_active(db: Session, priority_id: int) -> Priority:
    priority = db.get(Priority, priority_id)
    if priority is None or not priority.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Priority not found or inactive")
    return priority


def validate_targets(response_hours: int, resolution_hours: int, warning_minutes: int) -> None:
    if not 1 <= response_hours <= SLA_MAX_HOURS or not 1 <= resolution_hours <= SLA_MAX_HOURS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Targets must be between 1 and {SLA_MAX_HOURS} hours")
    if response_hours > resolution_hours:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "The response target cannot be longer than the resolution target")
    if not 0 <= warning_minutes < response_hours * 60:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "The warning must come before the response target (0 to response time in minutes)")


def _clean_name(name: str) -> str:
    return single_line(name, "Name", max_length(Priority.name))


def _check_tone(tone: str) -> str:
    if tone not in PRIORITY_TONES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Tone must be one of: {', '.join(PRIORITY_TONES)}")
    return tone


def create(db: Session, key: str, name: str, tone: str, response_hours: int, resolution_hours: int,
           warning_minutes: int) -> Priority:
    """Adds a priority (least urgent, at the end of the order) with its default
    SLA targets. Flushes; the caller commits."""
    key = machine_key(key, max_length(Priority.key))
    name = _clean_name(name)
    if db.query(Priority).filter((Priority.key == key) | (func.lower(Priority.name) == name.lower())).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "A priority with this key or name already exists")
    validate_targets(response_hours, resolution_hours, warning_minutes)
    last_rank = db.query(func.max(Priority.rank)).scalar()
    priority = Priority(key=key, name=name, tone=_check_tone(tone), rank=(last_rank or 0) + 1, is_active=True)
    db.add(priority)
    db.flush()
    db.add(SlaRule(priority=priority, department_id=None, response_hours=response_hours,
                   resolution_hours=resolution_hours, warning_minutes=warning_minutes))
    db.flush()
    return priority


def update(db: Session, priority: Priority, name: str | None, tone: str | None, is_active: bool | None) -> None:
    if name is not None:
        name = _clean_name(name)
        clash = db.query(Priority).filter(func.lower(Priority.name) == name.lower(), Priority.id != priority.id).first()
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, "A priority with this name already exists")
        priority.name = name
    if tone is not None:
        priority.tone = _check_tone(tone)
    if is_active is False and priority.is_active:
        in_use = db.query(ComplaintCategory).filter(
            ComplaintCategory.default_priority_id == priority.id, ComplaintCategory.is_active.is_(True),
        ).count()
        if in_use:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"{in_use} active categor{'y uses' if in_use == 1 else 'ies use'} this priority "
                                "as their default; change them first")
    if is_active is not None:
        priority.is_active = is_active


def reorder(db: Session, ordered_ids: list[int]) -> None:
    """Sets ranks to the given order (most urgent first). Must list every priority."""
    priorities = {p.id: p for p in db.query(Priority).all()}
    if sorted(ordered_ids) != sorted(priorities):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The order must list every priority exactly once")
    # Two passes keep the unique rank constraint satisfied at every step.
    for position, priority_id in enumerate(ordered_ids, start=1):
        priorities[priority_id].rank = -position
    db.flush()
    for position, priority_id in enumerate(ordered_ids, start=1):
        priorities[priority_id].rank = position
    db.flush()
