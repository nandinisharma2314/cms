"""Standalone background worker (SLA checks, message delivery, queue routing, clean-up).

    python worker.py            # loop forever, every WORKER_INTERVAL_SECONDS
    python worker.py --once     # single run, e.g. from cron

Use this when the API runs with WORKER_INTERVAL_SECONDS=0. Several copies are
safe: a database lock lets only one run at a time.
"""
import argparse
import logging
import sys
import time

from config import WORKER_INTERVAL_SECONDS
from services.worker_service import run_once

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--once", action="store_true", help="run once and exit")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    if args.once:
        print(run_once())
        sys.exit(0)
    if WORKER_INTERVAL_SECONDS <= 0:
        sys.exit("Set WORKER_INTERVAL_SECONDS to the number of seconds between runs.")
    while True:
        try:
            run_once()
        except Exception:
            logging.exception("Background run failed")
        time.sleep(WORKER_INTERVAL_SECONDS)
