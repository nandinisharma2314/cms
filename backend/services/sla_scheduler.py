"""Runs the SLA check on a timer inside the API process.

With several API workers, disable this (SLA_CHECK_INTERVAL_SECONDS=0) and run
`python sla_worker.py` as a single separate process instead, so escalations
are not processed twice at the same moment.
"""
import asyncio
import logging

from database import SessionLocal
from services import sla_service

logger = logging.getLogger(__name__)


def run_once() -> dict:
    with SessionLocal() as db:
        summary = sla_service.run_check(db)
    if len(summary) > 1:  # more than just "checked"
        logger.info("SLA check: %s", summary)
    return summary


async def run_forever(interval_seconds: int) -> None:
    while True:
        try:
            await asyncio.to_thread(run_once)
        except Exception:  # keep the loop alive; the next run retries
            logger.exception("SLA check failed")
        await asyncio.sleep(interval_seconds)
