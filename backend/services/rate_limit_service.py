"""Fixed-window counters kept in the database, so limits hold across every
API worker. Each hit is an upsert on (bucket, subject, window start)."""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.orm import Session

from models import RateLimitCounter, max_length
from utils.security import utcnow

SUBJECT_LENGTH = max_length(RateLimitCounter.subject)


def _window_start(now: datetime, window: timedelta) -> datetime:
    """Start of the fixed window containing `now` (naive UTC in, naive UTC out)."""
    seconds = int(window.total_seconds())
    epoch = int(now.replace(tzinfo=timezone.utc).timestamp())
    return datetime.fromtimestamp(epoch - epoch % seconds, timezone.utc).replace(tzinfo=None)


def hit(db: Session, bucket: str, subject: str, window: timedelta) -> int:
    """Counts one event and returns the count for the current window. Commits."""
    start = _window_start(utcnow(), window)
    statement = insert(RateLimitCounter).values(bucket=bucket, subject=subject[:SUBJECT_LENGTH], window_start=start, count=1)
    db.execute(statement.on_duplicate_key_update(count=RateLimitCounter.count + 1))
    db.commit()
    return db.execute(select(RateLimitCounter.count).where(
        RateLimitCounter.bucket == bucket, RateLimitCounter.subject == subject[:SUBJECT_LENGTH],
        RateLimitCounter.window_start == start,
    )).scalar_one()


def count(db: Session, bucket: str, subject: str, window: timedelta) -> int:
    start = _window_start(utcnow(), window)
    return db.execute(select(func.coalesce(func.sum(RateLimitCounter.count), 0)).where(
        RateLimitCounter.bucket == bucket, RateLimitCounter.subject == subject[:SUBJECT_LENGTH],
        RateLimitCounter.window_start == start,
    )).scalar_one()


def reset(db: Session, bucket: str, subject: str) -> None:
    """Clears a subject's counters (e.g. failed logins after a successful one). Commits."""
    db.execute(delete(RateLimitCounter).where(RateLimitCounter.bucket == bucket,
                                              RateLimitCounter.subject == subject[:SUBJECT_LENGTH]))
    db.commit()


def enforce(db: Session, bucket: str, subject: str, limit: int, window: timedelta, message: str) -> None:
    """Counts one event and rejects it with 429 once the window's limit is exceeded."""
    if hit(db, bucket, subject, window) > limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, message,
                            headers={"Retry-After": str(int(window.total_seconds()))})


def prune(db: Session, older_than: timedelta) -> int:
    """Deletes windows that ended long ago. Commits."""
    result = db.execute(delete(RateLimitCounter).where(RateLimitCounter.window_start < utcnow() - older_than))
    db.commit()
    return result.rowcount
