"""
api.py - FastAPI backend for the job tracker dashboard.

Endpoints:
    GET   /health          quick "is the server up" check
    GET   /meta            statuses, sources, score threshold (for the UI's dropdowns)
    GET   /jobs            list jobs with filters (no description, to keep it light)
    GET   /jobs/{id}       one job including the full description
    PATCH /jobs/{id}       update status and/or notes
    GET   /stats           counts per status, per source, and score totals
    POST  /run             start collector + matcher in the background
    GET   /run/status      progress of the current / last run

Interactive docs: http://127.0.0.1:8000/docs

Run:
    python api.py              # host/port from config.yaml, logs to logs/api.log
    python api.py --reload     # auto-restart on code changes (development)
"""

from __future__ import annotations

import argparse
import logging
import threading
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, AsyncIterator, Literal, Optional

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import db
import run_daily
from logging_setup import setup_logging
from settings import has_gemini_api_key, load_config

logger = logging.getLogger("api")

# Log to console + logs/api.log. Runs when the server process imports this
# module. Skipped when this file is the `python api.py` launcher itself: with
# --reload that launcher is a separate watcher process, and two processes must
# not hold the same log file open on Windows (rotation would fail).
if __name__ != "__main__":
    setup_logging("api")

# Must match db.VALID_STATUSES (checked at import time below).
JobStatus = Literal["New", "Applied", "In progress", "Interview scheduled", "Rejected"]
assert tuple(JobStatus.__args__) == db.VALID_STATUSES, "JobStatus is out of sync with db.VALID_STATUSES"


def _score_threshold() -> int:
    return int((load_config().get("matcher") or {}).get("score_threshold", 60))


# =============================================================================
# Pydantic models (request / response shapes, also shown in /docs)
# =============================================================================
class JobSummary(BaseModel):
    """A job as shown on a Kanban card (no description)."""

    id: int
    url: str
    title: str
    company: Optional[str] = None
    location: Optional[str] = None
    source: str
    match_score: Optional[int] = None
    match_reason: Optional[str] = None
    status: JobStatus
    notes: str = ""
    date_found: str
    date_updated: str


class JobDetail(JobSummary):
    """A job with its full description (for the detail modal)."""

    description: Optional[str] = None


class JobListResponse(BaseModel):
    count: int
    min_score_applied: Optional[int] = Field(
        None, description="Score filter actually used (defaults to the config threshold)"
    )
    jobs: list[JobSummary]


class JobUpdate(BaseModel):
    """PATCH body. Send only the fields you want to change."""

    status: Optional[JobStatus] = None
    notes: Optional[str] = Field(None, max_length=20_000)


class ScoreCounts(BaseModel):
    total: int
    scored: int
    unscored: int
    above_threshold: int
    threshold: int


class StatsResponse(BaseModel):
    by_status: dict[str, int]
    by_source: dict[str, int]
    scores: ScoreCounts


class MetaResponse(BaseModel):
    statuses: list[str]
    sources: list[str]
    score_threshold: int
    gemini_configured: bool


class RunRequest(BaseModel):
    """Options for POST /run (all optional)."""

    quick: bool = Field(False, description="Small collection: 1 search term, 1 location")
    skip_collect: bool = Field(False, description="Only score existing unscored jobs")
    skip_match: bool = Field(False, description="Only collect, don't call Gemini")


class RunStatus(BaseModel):
    state: Literal["idle", "running", "finished", "failed"]
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    options: Optional[RunRequest] = None
    current_step: Optional[str] = None
    log: list[str] = Field(default_factory=list, description="Most recent progress messages (newest last)")
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None


# =============================================================================
# Background run manager
# =============================================================================
class RunManager:
    """
    Runs the pipeline in a background thread and remembers its progress.
    A lock guarantees only one run at a time.
    """

    MAX_LOG_LINES = 100

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state: str = "idle"
        self._started_at: Optional[str] = None
        self._finished_at: Optional[str] = None
        self._options: Optional[RunRequest] = None
        self._current_step: Optional[str] = None
        self._log: deque[str] = deque(maxlen=self.MAX_LOG_LINES)
        self._result: Optional[dict[str, Any]] = None
        self._error: Optional[str] = None

    @property
    def is_running(self) -> bool:
        return self._state == "running"

    def start(self, options: RunRequest) -> bool:
        """Start a run. Returns False if one is already running."""
        with self._lock:
            if self._state == "running":
                return False
            self._state = "running"
            self._started_at = datetime.now().isoformat(timespec="seconds")
            self._finished_at = None
            self._options = options
            self._current_step = "Starting..."
            self._log.clear()
            self._result = None
            self._error = None

        thread = threading.Thread(target=self._run, args=(options,), name="pipeline-run", daemon=True)
        thread.start()
        return True

    def _progress(self, message: str) -> None:
        """Called by collector/matcher for every progress message."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        with self._lock:
            self._current_step = message
            self._log.append(f"{timestamp} {message}")

    def _run(self, options: RunRequest) -> None:
        try:
            result = run_daily.run_pipeline(
                quick=options.quick,
                skip_collect=options.skip_collect,
                skip_match=options.skip_match,
                progress=self._progress,
            )
            with self._lock:
                self._result = result
                self._finished_at = datetime.now().isoformat(timespec="seconds")
                self._state = "finished"
                self._current_step = "Done"
        except Exception as exc:  # run_pipeline already catches per step; this is a last resort
            logger.exception("Background run crashed")
            with self._lock:
                self._error = f"{type(exc).__name__}: {exc}"
                self._finished_at = datetime.now().isoformat(timespec="seconds")
                self._state = "failed"
                self._current_step = "Failed"

    def status(self) -> RunStatus:
        with self._lock:
            return RunStatus(
                state=self._state,  # type: ignore[arg-type]
                started_at=self._started_at,
                finished_at=self._finished_at,
                options=self._options,
                current_step=self._current_step,
                log=list(self._log),
                result=self._result,
                error=self._error,
            )


run_manager = RunManager()


# =============================================================================
# App setup
# =============================================================================
@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Runs once at startup: make sure the DB and table exist."""
    db.init_db()
    counts = db.get_score_counts(_score_threshold())
    logger.info("API ready: %d jobs in DB (%d scored), Gemini key %s",
                counts["total"], counts["scored"], "set" if has_gemini_api_key() else "MISSING")
    yield
    logger.info("API shutting down")


app = FastAPI(
    title="Job Tracker API",
    version="1.0.0",
    description="Collects jobs, scores them with Gemini, and tracks application status. Never auto-applies.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=(load_config().get("api") or {}).get("cors_origins", ["http://localhost:5173"]),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)


# =============================================================================
# Endpoints
# =============================================================================
@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/meta", response_model=MetaResponse, tags=["meta"])
def meta() -> MetaResponse:
    """Values the dashboard needs for its dropdowns and defaults."""
    return MetaResponse(
        statuses=list(db.VALID_STATUSES),
        sources=db.get_sources(),
        score_threshold=_score_threshold(),
        gemini_configured=has_gemini_api_key(),
    )


@app.get("/jobs", response_model=JobListResponse, tags=["jobs"])
def list_jobs(
    status_filter: Optional[JobStatus] = Query(None, alias="status", description="Exact status"),
    source: Optional[str] = Query(None, description="Exact source, e.g. linkedin, greenhouse"),
    min_score: Optional[int] = Query(
        None, ge=0, le=100,
        description="Minimum match score. Defaults to the config threshold; pass 0 to see everything.",
    ),
    include_unscored: bool = Query(True, description="Also return jobs Gemini hasn't scored yet"),
    location: Optional[str] = Query(
        None, description="Case-insensitive 'contains' match. Use | for alternatives, e.g. 'gurgaon|gurugram|remote'",
    ),
    search: Optional[str] = Query(None, description="Searches title, company and description"),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> JobListResponse:
    """List jobs, best score first. Jobs below the threshold are hidden unless min_score is given."""
    effective_min = _score_threshold() if min_score is None else min_score
    rows = db.query_jobs(
        status=status_filter,
        source=source,
        min_score=effective_min if effective_min > 0 else None,
        location=location,
        search=search,
        include_unscored=include_unscored,
        limit=limit,
        offset=offset,
    )
    return JobListResponse(
        count=len(rows),
        min_score_applied=effective_min,
        jobs=[JobSummary.model_validate(row) for row in rows],
    )


@app.get("/jobs/{job_id}", response_model=JobDetail, tags=["jobs"])
def get_job(job_id: int) -> JobDetail:
    job = db.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found")
    return JobDetail.model_validate(job)


@app.patch("/jobs/{job_id}", response_model=JobDetail, tags=["jobs"])
def update_job(job_id: int, update: JobUpdate) -> JobDetail:
    """Change status (e.g. drag to another column) and/or notes."""
    if update.status is None and update.notes is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                            detail="Provide 'status' and/or 'notes'")
    job = db.update_job(job_id, status=update.status, notes=update.notes)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found")
    return JobDetail.model_validate(job)


@app.get("/stats", response_model=StatsResponse, tags=["stats"])
def stats() -> StatsResponse:
    threshold = _score_threshold()
    return StatsResponse(
        by_status=db.count_by_status(),
        by_source=db.count_by_source(),
        scores=ScoreCounts(**db.get_score_counts(threshold), threshold=threshold),
    )


@app.post("/run", response_model=RunStatus, status_code=status.HTTP_202_ACCEPTED, tags=["run"])
def start_run(options: Optional[RunRequest] = None) -> RunStatus:
    """
    Start collector + matcher in the background and return immediately.
    Poll GET /run/status for progress. Returns 409 if a run is already going.
    """
    if not run_manager.start(options or RunRequest()):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A run is already in progress")
    return run_manager.status()


@app.get("/run/status", response_model=RunStatus, tags=["run"])
def run_status() -> RunStatus:
    return run_manager.status()


# =============================================================================
# `python api.py` starts the server using host/port from config.yaml
# =============================================================================
if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="Start the Job Tracker API.")
    parser.add_argument("--reload", action="store_true",
                        help="Restart on code changes (development). Note: a restart stops a running fetch.")
    args = parser.parse_args()

    api_cfg = load_config().get("api") or {}
    # Pass the app as an import string so uvicorn imports `api` fresh
    # (that import sets up file logging, see the top of this file).
    uvicorn.run(
        "api:app",
        host=api_cfg.get("host", "127.0.0.1"),
        port=int(api_cfg.get("port", 8000)),
        reload=args.reload,
        reload_includes=["*.py", "config.yaml"] if args.reload else None,
    )
