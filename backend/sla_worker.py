"""Standalone SLA checker (warnings, breaches, escalations).

    python sla_worker.py            # loop forever, every SLA_CHECK_INTERVAL_SECONDS (default 60)
    python sla_worker.py --once     # single pass, e.g. from cron

Use this instead of the in-process checker when running several API workers
(set SLA_CHECK_INTERVAL_SECONDS=0 for the API then).
"""
import argparse
import logging
import time

from config import SLA_CHECK_INTERVAL_SECONDS
from services.sla_scheduler import run_once

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--once", action="store_true", help="run a single check and exit")
    parser.add_argument("--interval", type=int, default=SLA_CHECK_INTERVAL_SECONDS or 60, help="seconds between runs")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if args.once:
        print(run_once())
    else:
        while True:
            try:
                run_once()
            except Exception:
                logging.exception("SLA check failed")
            time.sleep(args.interval)
