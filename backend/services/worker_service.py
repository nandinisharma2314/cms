"""Background work, run on a timer by the API process (WORKER_INTERVAL_SECONDS)
or by `python worker.py`:

  * SLA warnings, breaches and escalations
  * routing complaints that wait in the department queue
  * sending queued SMS / email notifications
  * clean-up: expired tokens and codes, old rate-limit windows, personal data
    in old import reports, and (if configured) old audit entries

A database lock makes sure only one process does this at a time, however many
API workers are running.
"""
import asyncio
import logging
from datetime import timedelta

from sqlalchemy import text

from config import AUDIT_RETENTION_DAYS, IMPORT_ISSUE_RETENTION_DAYS
from database import SessionLocal, engine
from models import AuditLog
from services import import_service, notification_service, otp_service, rate_limit_service, routing_service, \
    sla_service, token_service
from utils.security import utcnow

logger = logging.getLogger(__name__)

LOCK_NAME = "cms_background_worker"
MESSAGE_BATCH = 100


def run_once() -> dict:
    """Runs every job once. Returns a summary, or {"skipped": 1} when another
    process holds the lock."""
    with engine.connect() as lock_connection:
        acquired = lock_connection.execute(text("SELECT GET_LOCK(:name, 0)"), {"name": LOCK_NAME}).scalar()
        if acquired != 1:
            return {"skipped": 1}
        try:
            return _run_jobs()
        finally:
            lock_connection.execute(text("SELECT RELEASE_LOCK(:name)"), {"name": LOCK_NAME})


def _route_queue(db) -> int:
    routed = routing_service.retry_queue(db, utcnow())
    db.commit()
    return routed


def _prune_audit(db) -> int:
    count = db.query(AuditLog).filter(
        AuditLog.created_at < utcnow() - timedelta(days=AUDIT_RETENTION_DAYS),
    ).delete(synchronize_session=False)
    db.commit()
    return count


def _run_jobs() -> dict:
    """Each job runs on its own: one that crashes is logged and listed under
    `failed_jobs` (kept apart from the jobs' own counts, such as messages_failed),
    and the others still run."""
    jobs = [
        ("sla", sla_service.run_check),
        ("routed_from_queue", _route_queue),
        ("messages", lambda db: notification_service.deliver_due(db, MESSAGE_BATCH)),
        ("pruned_refresh_tokens", token_service.prune),
        ("pruned_otp_challenges", otp_service.prune),
        ("pruned_rate_limits", lambda db: rate_limit_service.prune(db, timedelta(days=2))),
        ("cleared_import_rows", lambda db: import_service.prune_issue_data(db, IMPORT_ISSUE_RETENTION_DAYS)),
    ]
    if AUDIT_RETENTION_DAYS:
        jobs.append(("pruned_audit_entries", _prune_audit))

    summary: dict[str, int | list[str]] = {}
    failed_jobs: list[str] = []
    with SessionLocal() as db:
        for name, job in jobs:
            try:
                result = job(db)
            except Exception:
                db.rollback()
                logger.exception("Background job %s failed", name)
                failed_jobs.append(name)
                continue
            if isinstance(result, dict):
                summary.update({f"{name}_{key}": value for key, value in result.items()})
            else:
                summary[name] = result
    if failed_jobs:
        summary["failed_jobs"] = failed_jobs
    interesting = {k: v for k, v in summary.items() if v and k != "sla_checked"}
    if interesting:
        logger.info("Background run: %s", interesting)
    return summary


async def run_forever(interval_seconds: int) -> None:
    while True:
        try:
            await asyncio.to_thread(run_once)
        except Exception:  # keep the loop alive; the next run retries
            logger.exception("Background run failed")
        await asyncio.sleep(interval_seconds)


def run_sla_check_now() -> dict:
    """The SLA part of a run, on request (admin panel). Uses the same lock."""
    with engine.connect() as lock_connection:
        acquired = lock_connection.execute(text("SELECT GET_LOCK(:name, 0)"), {"name": LOCK_NAME}).scalar()
        if acquired != 1:
            return {"skipped": 1}
        try:
            with SessionLocal() as db:
                return sla_service.run_check(db)
        finally:
            lock_connection.execute(text("SELECT RELEASE_LOCK(:name)"), {"name": LOCK_NAME})
