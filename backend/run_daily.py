"""
run_daily.py - The daily pipeline: collect new jobs -> score them with Gemini.

Both steps save to SQLite as they go, so if the matcher stops early (e.g.
quota exhausted), the next run simply continues with the unscored jobs.

Run:
    python run_daily.py                  # full pipeline
    python run_daily.py --quick          # small collection, good for testing
    python run_daily.py --skip-collect   # only score what's already in the DB
    python run_daily.py --skip-match     # only collect
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from typing import Any, Callable, Optional

import collector
import matcher
from settings import has_gemini_api_key

logger = logging.getLogger("run_daily")


def run_pipeline(
    quick: bool = False,
    skip_collect: bool = False,
    skip_match: bool = False,
    progress: Optional[Callable[[str], None]] = None,
) -> dict[str, Any]:
    """
    Run collector then matcher. Returns a summary dict (used by the API in Phase 4).
    Never raises for a single failing step; errors are recorded in the summary.
    """
    started = time.time()
    summary: dict[str, Any] = {"collector": None, "matcher": None, "errors": []}

    # ---- Step 1: collect ---------------------------------------------------
    if not skip_collect:
        logger.info("=== Step 1/2: collecting jobs ===")
        try:
            results = collector.collect_all(quick=quick, progress=progress)
            summary["collector"] = {source: r.to_dict() for source, r in results.items()}
        except Exception as exc:
            logger.exception("Collector crashed")
            summary["errors"].append(f"collector: {exc}")

    # ---- Step 2: score -----------------------------------------------------
    if not skip_match:
        logger.info("=== Step 2/2: scoring jobs with Gemini ===")
        if not has_gemini_api_key():
            message = "GEMINI_API_KEY not set in backend/.env, skipping scoring"
            logger.warning(message)
            summary["errors"].append(message)
        else:
            try:
                summary["matcher"] = matcher.match_unscored(progress=progress).to_dict()
            except Exception as exc:
                logger.exception("Matcher crashed")
                summary["errors"].append(f"matcher: {exc}")

    summary["duration_seconds"] = round(time.time() - started, 1)
    logger.info("Pipeline finished in %.0fs", summary["duration_seconds"])
    return summary


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect and score jobs.")
    parser.add_argument("--quick", action="store_true", help="Small collection (1 term, 1 location).")
    parser.add_argument("--skip-collect", action="store_true", help="Only run the matcher.")
    parser.add_argument("--skip-match", action="store_true", help="Only run the collector.")
    return parser.parse_args()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
                        stream=sys.stdout)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    args = _parse_args()
    result = run_pipeline(quick=args.quick, skip_collect=args.skip_collect, skip_match=args.skip_match)
    sys.exit(1 if result["errors"] else 0)
