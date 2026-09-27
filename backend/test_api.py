"""
test_api.py - Phase 4 offline test for the FastAPI app.

Uses FastAPI's TestClient against a TEMPORARY database, and replaces the real
pipeline with a fake one, so no scraping or Gemini calls happen.

Run:  python test_api.py
"""

from __future__ import annotations

import tempfile
import time
from pathlib import Path
from typing import Any, Callable, Optional

from fastapi.testclient import TestClient

import api
import db
import run_daily


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(f"FAIL: {message}")
    print(f"  PASS  {message}")


def fake_pipeline(
    quick: bool = False,
    skip_collect: bool = False,
    skip_match: bool = False,
    progress: Optional[Callable[[str], None]] = None,
) -> dict[str, Any]:
    """Stands in for run_daily.run_pipeline: reports progress, inserts a job, takes ~1s."""
    if progress:
        progress("Fake: collecting")
    db.insert_job({"url": "https://example.com/new", "title": "Java Developer", "company": "NewCo",
                   "source": "lever", "description": "Spring Boot"})
    time.sleep(1)
    if progress:
        progress("Fake: scoring")
    return {"collector": {"lever": {"inserted": 1}}, "matcher": None, "errors": [], "quick": quick}


def seed() -> None:
    db.insert_jobs([
        {"url": "https://example.com/1", "title": "Backend Engineer (Java)", "company": "Acme",
         "location": "Bengaluru, India", "source": "greenhouse", "description": "Spring Boot, Kafka"},
        {"url": "https://example.com/2", "title": "Senior Frontend Engineer", "company": "Globex",
         "location": "Remote, India", "source": "linkedin", "description": "React, 7+ years"},
        {"url": "https://example.com/3", "title": "Full Stack Developer", "company": "Initech",
         "location": "Pune", "source": "linkedin", "description": "Java + Angular"},
    ])
    jobs = {j["company"]: j["id"] for j in db.query_jobs()}
    db.update_match(jobs["Acme"], 88, "Strong match")
    db.update_match(jobs["Globex"], 30, "Too senior")
    # Initech stays unscored


def run_tests(client: TestClient) -> None:
    print("\n[meta]")
    check(client.get("/health").json() == {"status": "ok"}, "GET /health")
    meta = client.get("/meta").json()
    check(meta["statuses"][0] == "New" and len(meta["statuses"]) == 5, "GET /meta statuses")
    check(meta["score_threshold"] == 60, "GET /meta threshold from config")

    print("\n[GET /jobs]")
    body = client.get("/jobs").json()
    titles = [j["title"] for j in body["jobs"]]
    check(body["min_score_applied"] == 60, "default filter = config threshold")
    check(titles == ["Backend Engineer (Java)", "Full Stack Developer"], "below-threshold job hidden, unscored shown")
    check("description" not in body["jobs"][0], "list response has no description")
    check(client.get("/jobs", params={"min_score": 0}).json()["count"] == 3, "min_score=0 shows everything")
    check(client.get("/jobs", params={"include_unscored": False}).json()["count"] == 1, "include_unscored=false")
    check(client.get("/jobs", params={"source": "linkedin", "min_score": 0}).json()["count"] == 2, "filter by source")
    check(client.get("/jobs", params={"location": "remote", "min_score": 0}).json()["count"] == 1, "filter by location")
    check(client.get("/jobs", params={"location": "pune|remote", "min_score": 0}).json()["count"] == 2,
          "location alternatives with |")
    check(client.get("/jobs", params={"location": " | ", "min_score": 0}).json()["count"] == 3, "empty alternatives ignored")
    check(client.get("/jobs", params={"search": "kafka"}).json()["count"] == 1, "search text")
    check(client.get("/jobs", params={"status": "Bogus"}).status_code == 422, "invalid status -> 422")

    job_id = body["jobs"][0]["id"]

    print("\n[GET/PATCH /jobs/{id}]")
    detail = client.get(f"/jobs/{job_id}").json()
    check(detail["description"] == "Spring Boot, Kafka", "detail includes description")
    check(client.get("/jobs/9999").status_code == 404, "unknown id -> 404")

    updated = client.patch(f"/jobs/{job_id}", json={"status": "Applied"}).json()
    check(updated["status"] == "Applied", "PATCH status")
    updated = client.patch(f"/jobs/{job_id}", json={"notes": "Referral from Priya"}).json()
    check(updated["notes"] == "Referral from Priya" and updated["status"] == "Applied", "PATCH notes keeps status")
    check(client.patch(f"/jobs/{job_id}", json={"status": "Hired"}).status_code == 422, "PATCH invalid status -> 422")
    check(client.patch(f"/jobs/{job_id}", json={}).status_code == 422, "PATCH empty body -> 422")
    check(client.patch("/jobs/9999", json={"status": "Applied"}).status_code == 404, "PATCH unknown id -> 404")
    check(client.get("/jobs", params={"status": "Applied"}).json()["count"] == 1, "filter by status")

    print("\n[GET /stats]")
    stats = client.get("/stats").json()
    check(stats["by_status"]["Applied"] == 1 and stats["by_status"]["New"] == 2, "counts per status")
    check(stats["by_source"] == {"linkedin": 2, "greenhouse": 1}, "counts per source")
    check(stats["scores"] == {"total": 3, "scored": 2, "unscored": 1, "above_threshold": 1, "threshold": 60},
          "score totals")

    print("\n[POST /run + GET /run/status]")
    check(client.get("/run/status").json()["state"] == "idle", "initial state idle")
    response = client.post("/run", json={"quick": True})
    check(response.status_code == 202 and response.json()["state"] == "running", "POST /run -> 202 running")
    check(client.post("/run").status_code == 409, "second POST /run while running -> 409")

    deadline = time.time() + 10
    while client.get("/run/status").json()["state"] == "running" and time.time() < deadline:
        time.sleep(0.2)
    final = client.get("/run/status").json()
    check(final["state"] == "finished", "run finishes")
    check(final["result"]["quick"] is True, "options passed to pipeline")
    check(any("Fake: scoring" in line for line in final["log"]), "progress log captured")
    check(client.get("/stats").json()["scores"]["total"] == 4, "pipeline's job visible in stats")

    print("\n[CORS]")
    preflight = client.options("/jobs", headers={"Origin": "http://localhost:5173",
                                                 "Access-Control-Request-Method": "PATCH"})
    check(preflight.headers.get("access-control-allow-origin") == "http://localhost:5173", "Vite origin allowed")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        db.set_db_path(Path(tmp) / "test.db")
        db.init_db()
        seed()
        run_daily.run_pipeline = fake_pipeline  # api calls run_daily.run_pipeline at run time
        with TestClient(api.app) as test_client:
            run_tests(test_client)
    print("\nAll Phase 4 checks passed.")
