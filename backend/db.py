"""
db.py - SQLite helpers for the job tracker.

Design notes:
- One table: `jobs`. The `url` column is UNIQUE, so duplicates are skipped
  automatically with INSERT OR IGNORE.
- Each function opens its own short-lived connection. This is simple and safe
  when the API and the daily run touch the DB at the same time.
- WAL journal mode lets readers (the dashboard) and a writer (the collector)
  work concurrently without "database is locked" errors.
- Rows are returned as plain dicts so they convert easily to JSON / Pydantic.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Iterator, Optional

from settings import get_db_path

# The five Kanban columns. Order matters: the dashboard shows them in this order.
VALID_STATUSES: tuple[str, ...] = (
    "New",
    "Applied",
    "In progress",
    "Interview scheduled",
    "Rejected",
)
DEFAULT_STATUS = "New"

# Columns that callers may provide when inserting a job.
_INSERTABLE_FIELDS: tuple[str, ...] = (
    "url",
    "title",
    "company",
    "location",
    "source",
    "description",
)

# Database path. Defaults to config.yaml; tests can override it with set_db_path().
_db_path: Path = get_db_path()


# -----------------------------------------------------------------------------
# Connection handling
# -----------------------------------------------------------------------------
def set_db_path(path: str | Path) -> None:
    """Point the module at a different database file (used by tests)."""
    global _db_path
    _db_path = Path(path)


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    """
    Open a connection, commit on success, roll back on error, always close.

    Usage:
        with get_connection() as conn:
            conn.execute(...)
    """
    conn = sqlite3.connect(_db_path, timeout=30)
    conn.row_factory = sqlite3.Row  # rows behave like dicts
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _now() -> str:
    """Current local time as an ISO string, e.g. '2026-09-26T10:15:00'."""
    return datetime.now().isoformat(timespec="seconds")


def _row_to_dict(row: Optional[sqlite3.Row]) -> Optional[dict[str, Any]]:
    return dict(row) if row is not None else None


# -----------------------------------------------------------------------------
# Schema
# -----------------------------------------------------------------------------
def init_db() -> None:
    """Create the jobs table and indexes if they don't exist yet."""
    _db_path.parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS jobs (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                url           TEXT    NOT NULL UNIQUE,
                title         TEXT    NOT NULL,
                company       TEXT,
                location      TEXT,
                source        TEXT    NOT NULL,
                description   TEXT,
                match_score   INTEGER,          -- NULL until Gemini scores it
                match_reason  TEXT,
                status        TEXT    NOT NULL DEFAULT '{DEFAULT_STATUS}',
                notes         TEXT    NOT NULL DEFAULT '',
                date_found    TEXT    NOT NULL,
                date_updated  TEXT    NOT NULL
            );
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_score  ON jobs(match_score);")


# -----------------------------------------------------------------------------
# Insert
# -----------------------------------------------------------------------------
def insert_job(job: dict[str, Any]) -> bool:
    """
    Insert one job. Returns True if inserted, False if the URL already existed.

    Required keys: url, title, source. Optional: company, location, description.
    """
    inserted, _ = insert_jobs([job])
    return inserted == 1


def insert_jobs(jobs: Iterable[dict[str, Any]]) -> tuple[int, int]:
    """
    Insert many jobs in one transaction, skipping duplicate URLs.
    Returns (inserted_count, skipped_count).
    """
    now = _now()
    inserted = 0
    skipped = 0

    with get_connection() as conn:
        for job in jobs:
            url = (job.get("url") or "").strip()
            title = (job.get("title") or "").strip()
            source = (job.get("source") or "").strip()

            # Skip rows that are missing the essentials.
            if not url or not title or not source:
                skipped += 1
                continue

            values = {field: job.get(field) for field in _INSERTABLE_FIELDS}
            values["url"] = url
            values["title"] = title
            values["source"] = source

            cursor = conn.execute(
                """
                INSERT OR IGNORE INTO jobs
                    (url, title, company, location, source, description,
                     status, notes, date_found, date_updated)
                VALUES
                    (:url, :title, :company, :location, :source, :description,
                     :status, '', :now, :now)
                """,
                {**values, "status": DEFAULT_STATUS, "now": now},
            )
            # rowcount is 1 when inserted, 0 when ignored as a duplicate.
            if cursor.rowcount == 1:
                inserted += 1
            else:
                skipped += 1

    return inserted, skipped


# -----------------------------------------------------------------------------
# Update
# -----------------------------------------------------------------------------
def update_job(
    job_id: int,
    status: Optional[str] = None,
    notes: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """
    Update status and/or notes. Only the fields you pass are changed.
    Returns the updated job, or None if the id doesn't exist.
    Raises ValueError for an unknown status.
    """
    if status is not None and status not in VALID_STATUSES:
        raise ValueError(f"Invalid status '{status}'. Use one of: {', '.join(VALID_STATUSES)}")

    updates: dict[str, Any] = {}
    if status is not None:
        updates["status"] = status
    if notes is not None:
        updates["notes"] = notes

    if updates:
        updates["date_updated"] = _now()
        set_clause = ", ".join(f"{column} = :{column}" for column in updates)
        with get_connection() as conn:
            conn.execute(
                f"UPDATE jobs SET {set_clause} WHERE id = :id",
                {**updates, "id": job_id},
            )

    return get_job(job_id)


def update_match(job_id: int, score: int, reason: str) -> None:
    """Save the Gemini match score (clamped to 0-100) and reason for a job."""
    score = max(0, min(100, int(score)))
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE jobs
               SET match_score = ?, match_reason = ?, date_updated = ?
             WHERE id = ?
            """,
            (score, reason, _now(), job_id),
        )


# -----------------------------------------------------------------------------
# Query
# -----------------------------------------------------------------------------
def get_job(job_id: int) -> Optional[dict[str, Any]]:
    """Return one job by id, or None."""
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return _row_to_dict(row)


def query_jobs(
    status: Optional[str] = None,
    source: Optional[str] = None,
    min_score: Optional[int] = None,
    location: Optional[str] = None,
    search: Optional[str] = None,
    include_unscored: bool = True,
    limit: int = 500,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """
    Return jobs matching all given filters.

    - status / source: exact match
    - min_score: match_score >= min_score (unscored jobs kept if include_unscored)
    - location / search: case-insensitive "contains" match
      (search looks in title, company and description)

    Sorted by best score first, then newest first. Unscored jobs go last.
    """
    conditions: list[str] = []
    params: dict[str, Any] = {}

    if status:
        conditions.append("status = :status")
        params["status"] = status
    if source:
        conditions.append("source = :source")
        params["source"] = source
    if min_score is not None:
        if include_unscored:
            conditions.append("(match_score >= :min_score OR match_score IS NULL)")
        else:
            conditions.append("match_score >= :min_score")
        params["min_score"] = min_score
    elif not include_unscored:
        conditions.append("match_score IS NOT NULL")
    if location:
        conditions.append("LOWER(COALESCE(location, '')) LIKE :location")
        params["location"] = f"%{location.lower()}%"
    if search:
        conditions.append(
            "("
            "LOWER(title) LIKE :search OR "
            "LOWER(COALESCE(company, '')) LIKE :search OR "
            "LOWER(COALESCE(description, '')) LIKE :search"
            ")"
        )
        params["search"] = f"%{search.lower()}%"

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params["limit"] = limit
    params["offset"] = offset

    sql = f"""
        SELECT * FROM jobs
        {where_clause}
        ORDER BY match_score IS NULL, match_score DESC, date_found DESC, id DESC
        LIMIT :limit OFFSET :offset
    """
    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(row) for row in rows]


def get_unscored_jobs(limit: int = 200) -> list[dict[str, Any]]:
    """Jobs that Gemini hasn't scored yet (oldest first)."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM jobs WHERE match_score IS NULL ORDER BY id LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def count_by_status() -> dict[str, int]:
    """Counts per status. Every valid status is present, even if 0."""
    counts = {status: 0 for status in VALID_STATUSES}
    with get_connection() as conn:
        rows = conn.execute("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status").fetchall()
    for row in rows:
        counts[row["status"]] = row["n"]
    return counts


def count_by_source() -> dict[str, int]:
    """Counts per source, e.g. {'linkedin': 40, 'greenhouse': 12}."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT source, COUNT(*) AS n FROM jobs GROUP BY source ORDER BY n DESC"
        ).fetchall()
    return {row["source"]: row["n"] for row in rows}


def get_sources() -> list[str]:
    """Distinct sources, for the dashboard's filter dropdown."""
    return list(count_by_source().keys())


# -----------------------------------------------------------------------------
# Run directly: `python db.py` creates the DB and prints a summary.
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    init_db()
    print(f"Database ready at: {_db_path}")
    print(f"Jobs by status: {count_by_status()}")
    print(f"Jobs by source: {count_by_source()}")
