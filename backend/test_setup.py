"""
test_setup.py - Phase 1 smoke test.

Checks that config/profile/.env load, then exercises every db.py function
against a TEMPORARY database (your real jobs.db is not touched).

Run:  python test_setup.py
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import db
from settings import has_gemini_api_key, load_config, load_profile


def check(condition: bool, message: str) -> None:
    """Print a pass line or stop with a clear failure."""
    if not condition:
        raise AssertionError(f"FAIL: {message}")
    print(f"  PASS  {message}")


def test_settings() -> None:
    print("\n[settings]")
    config = load_config()
    check("jobspy" in config and "companies" in config, "config.yaml loads")
    check(len(config["companies"]["greenhouse"]) + len(config["companies"]["lever"]) == 10,
          "10 target companies configured")
    check("Spring Boot" in load_profile(), "profile.txt loads")
    if has_gemini_api_key():
        print("  PASS  GEMINI_API_KEY found in .env")
    else:
        print("  WARN  GEMINI_API_KEY not set yet (needed from Phase 3)")


def test_db() -> None:
    print("\n[db]")
    with tempfile.TemporaryDirectory() as tmp:
        db.set_db_path(Path(tmp) / "test.db")
        db.init_db()

        job_a = {
            "url": "https://example.com/jobs/1",
            "title": "Backend Engineer (Java)",
            "company": "Acme",
            "location": "Bengaluru, India",
            "source": "greenhouse",
            "description": "Spring Boot, Kafka, microservices",
        }
        job_b = {
            "url": "https://example.com/jobs/2",
            "title": "Senior Frontend Engineer",
            "company": "Globex",
            "location": "Remote, India",
            "source": "linkedin",
            "description": "React, 7+ years",
        }

        check(db.insert_job(job_a) is True, "insert new job")
        check(db.insert_job(job_a) is False, "duplicate URL is skipped")
        inserted, skipped = db.insert_jobs([job_a, job_b, {"url": "", "title": "x", "source": "y"}])
        check((inserted, skipped) == (1, 2), "bulk insert counts (1 new, 2 skipped)")

        jobs = db.query_jobs()
        check(len(jobs) == 2, "query all returns 2 jobs")
        check(all(j["status"] == "New" and j["notes"] == "" for j in jobs), "defaults: status New, empty notes")

        id_a = next(j["id"] for j in jobs if j["company"] == "Acme")
        id_b = next(j["id"] for j in jobs if j["company"] == "Globex")

        check(len(db.get_unscored_jobs()) == 2, "both jobs start unscored")
        db.update_match(id_a, 85, "Strong Java/Spring match")
        db.update_match(id_b, 150, "Too senior")  # clamped to 100 on purpose
        check(db.get_job(id_b)["match_score"] == 100, "score is clamped to 0-100")
        db.update_match(id_b, 30, "Too senior, frontend-focused")
        check(len(db.get_unscored_jobs()) == 0, "no unscored jobs after scoring")

        updated = db.update_job(id_a, status="Applied", notes="Applied via careers page")
        check(updated is not None and updated["status"] == "Applied", "update status")
        check(updated["notes"] == "Applied via careers page", "update notes")
        check(db.update_job(id_a, notes="Follow up Friday")["status"] == "Applied",
              "updating notes only keeps status")
        check(db.update_job(9999, status="Applied") is None, "unknown id returns None")
        try:
            db.update_job(id_a, status="Hired")
            check(False, "invalid status raises")
        except ValueError:
            check(True, "invalid status raises ValueError")

        check([j["id"] for j in db.query_jobs(min_score=60)] == [id_a], "filter: min_score")
        check(len(db.query_jobs(status="Applied")) == 1, "filter: status")
        check(len(db.query_jobs(source="linkedin")) == 1, "filter: source")
        check(len(db.query_jobs(location="remote")) == 1, "filter: location (case-insensitive)")
        check(len(db.query_jobs(search="KAFKA")) == 1, "filter: search in description")
        check(db.query_jobs()[0]["id"] == id_a, "sorted by best score first")

        check(db.count_by_status() == {"New": 1, "Applied": 1, "In progress": 0,
                                       "Interview scheduled": 0, "Rejected": 0}, "count_by_status")
        check(db.count_by_source() == {"greenhouse": 1, "linkedin": 1}, "count_by_source")


if __name__ == "__main__":
    test_settings()
    test_db()
    print("\nAll Phase 1 checks passed.")
