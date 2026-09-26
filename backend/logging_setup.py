"""
logging_setup.py - One place to configure logging for every entry point.

Each entry point writes to its OWN rotating file in backend/logs/:
    run_daily.py -> logs/run_daily.log   (includes the scheduled daily task)
    api.py       -> logs/api.log         (server + "Fetch new jobs" runs)
    collector.py -> logs/collector.log   (when run by hand)
    matcher.py   -> logs/matcher.log     (when run by hand)

Separate files matter on Windows: a file can't be rotated (renamed) while
another process has it open, so two processes must never share one log file.

Files rotate at `max_bytes` and keep `backup_count` old copies
(run_daily.log, run_daily.log.1, ... .5), so logs never grow forever.
"""

from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from settings import load_config, resolve_path

LOG_FORMAT = "%(asctime)s %(levelname)-7s %(name)s: %(message)s"

# Chatty third-party loggers we only want to hear from on problems.
_QUIET_LOGGERS = ("httpx", "httpx2", "httpcore", "google_genai", "urllib3")


def setup_logging(name: str) -> Path:
    """
    Log to the console AND to backend/logs/<name>.log. Safe to call twice.
    Returns the log file path.
    """
    cfg = load_config().get("logging") or {}
    log_dir = resolve_path(cfg.get("dir", "logs"))
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"{name}.log"

    root = logging.getLogger()
    root.setLevel(getattr(logging, str(cfg.get("level", "INFO")).upper(), logging.INFO))

    # Remove handlers from an earlier call (e.g. uvicorn --reload re-import).
    # uvicorn's own logger doesn't propagate to root, so it gets the file handler
    # directly (server start/stop and errors end up in logs/api.log).
    uvicorn_logger = logging.getLogger("uvicorn")
    for target in (root, uvicorn_logger):
        for handler in list(target.handlers):
            if getattr(handler, "_job_tracker", False):
                target.removeHandler(handler)
                handler.close()

    formatter = logging.Formatter(LOG_FORMAT)

    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=int(cfg.get("max_bytes", 2_000_000)),
        backupCount=int(cfg.get("backup_count", 5)),
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    file_handler._job_tracker = True  # type: ignore[attr-defined]
    root.addHandler(file_handler)
    uvicorn_logger.addHandler(file_handler)  # console output for uvicorn is already handled by uvicorn

    # Console output. sys.stdout is None under pythonw.exe (the scheduled task
    # runs without a window), so only add it when a console exists.
    if sys.stdout is not None:
        if hasattr(sys.stdout, "reconfigure"):
            # Non-ASCII job titles must not crash printing on Windows consoles.
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)
        console_handler._job_tracker = True  # type: ignore[attr-defined]
        root.addHandler(console_handler)

    for noisy in _QUIET_LOGGERS:
        logging.getLogger(noisy).setLevel(logging.WARNING)

    return log_file
