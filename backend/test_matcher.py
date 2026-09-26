"""
test_matcher.py - Phase 3 offline test (no API key or internet needed).

Uses a FAKE Gemini client to check JSON parsing, retries/backoff, rate-limit
handling, fatal errors, and that scores are saved to a temporary database.

Run:  python test_matcher.py
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from google.genai import errors

import db
import matcher


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(f"FAIL: {message}")
    print(f"  PASS  {message}")


def api_error(code: int, retry_delay: str | None = None) -> errors.APIError:
    """Build an error shaped like the ones the real SDK raises."""
    details = [{"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": retry_delay}] if retry_delay else []
    body = {"error": {"code": code, "message": f"fake {code}", "status": "FAKE", "details": details}}
    cls = errors.ClientError if code < 500 else errors.ServerError
    return cls(code, body)


class FakeClient:
    """Mimics genai.Client: client.models.generate_content(...) returns queued replies."""

    def __init__(self, replies: list[Any]):
        self.replies = list(replies)
        self.calls = 0
        self.models = self

    def generate_content(self, **_: Any) -> SimpleNamespace:
        self.calls += 1
        reply = self.replies.pop(0) if self.replies else '{"score": 50, "reason": "default"}'
        if isinstance(reply, Exception):
            raise reply
        return SimpleNamespace(text=reply)


def test_parsing() -> None:
    print("\n[parse_match_response]")
    parse = matcher.parse_match_response
    check(parse('{"score": 82, "reason": "Java match"}') == (82, "Java match"), "plain JSON")
    check(parse('```json\n{"score": 70, "reason": "ok"}\n```') == (70, "ok"), "JSON in code fences")
    check(parse('Here you go: {"score": "65", "reason": "x"} thanks') == (65, "x"), "JSON with extra text, string score")
    check(parse('{"score": 140, "reason": "x"}')[0] == 100, "score clamped to 100")
    check(parse('{"score": 55.6}') == (56, "No reason given"), "float score rounded, missing reason")
    for bad in ["", "no json here", '{"reason": "missing score"}']:
        try:
            parse(bad)
            check(False, f"rejects {bad!r}")
        except ValueError:
            check(True, f"rejects {bad!r}")


def test_truncate() -> None:
    print("\n[truncate]")
    check(matcher.truncate("short", 100) == "short", "short text unchanged")
    long_text = matcher.truncate("a" * 500, 100)
    check(long_text.startswith("a" * 100) and long_text.endswith("[description truncated]"), "long text truncated")


def test_retries() -> None:
    print("\n[score_job retries]")
    kwargs = dict(model="fake", system_prompt="s", job_prompt="j", max_retries=3, initial_backoff=0)

    client = FakeClient([api_error(429, "0s"), api_error(503), '{"score": 77, "reason": "ok"}'])
    check(matcher.score_job(client, **kwargs) == (77, "ok") and client.calls == 3, "recovers after 429 + 503")

    client = FakeClient(["not json", '{"score": 60, "reason": "second try"}'])
    check(matcher.score_job(client, **kwargs) == (60, "second try"), "retries once on bad JSON")

    client = FakeClient([api_error(429, "0s")] * 3)
    try:
        matcher.score_job(client, **kwargs)
        check(False, "429 x3 raises RateLimitExhausted")
    except matcher.RateLimitExhausted:
        check(client.calls == 3, "429 x3 raises RateLimitExhausted")

    client = FakeClient([api_error(404)])
    try:
        matcher.score_job(client, **kwargs)
        check(False, "404 (bad model) is fatal")
    except matcher.FatalMatcherError:
        check(client.calls == 1, "404 (bad model) is fatal, no retries")

    check(matcher._retry_delay_from_error(api_error(429, "37s")) == 37.0, "reads retryDelay from error")


def test_pipeline() -> None:
    print("\n[match_unscored with temp DB]")
    with tempfile.TemporaryDirectory() as tmp:
        db.set_db_path(Path(tmp) / "test.db")
        db.init_db()
        db.insert_jobs([
            {"url": f"https://example.com/{i}", "title": f"Java Developer {i}", "company": "Acme",
             "source": "lever", "description": "Spring Boot " * 2000}
            for i in range(3)
        ])

        # Speed up: no delays during the test.
        cfg = matcher.load_config()
        original = dict(cfg["matcher"])
        cfg["matcher"].update(delay_between_calls_seconds=0, initial_backoff_seconds=0, max_retries=2)
        try:
            client = FakeClient([
                '{"score": 88, "reason": "Strong Spring Boot match"}',
                api_error(400),                      # non-retryable job error -> job fails, run continues
                '{"score": 30, "reason": "Too senior"}',
            ])
            summary = matcher.match_unscored(client=client)
            check(summary.scored == 2 and summary.failed == 1, "2 scored, 1 failed")
            check(summary.remaining == 1, "failed job stays unscored for next run")
            scores = sorted(j["match_score"] for j in db.query_jobs(include_unscored=False))
            check(scores == [30, 88], "scores saved to DB")

            client = FakeClient([api_error(429, "0s")] * 5)
            summary = matcher.match_unscored(client=client)
            check(summary.stopped_early and "quota" in summary.stop_reason.lower(), "stops early when quota exhausted")

            check(db.clear_scores() == 2 and len(db.get_unscored_jobs()) == 3, "clear_scores resets all")
        finally:
            cfg["matcher"].clear()
            cfg["matcher"].update(original)

    prompt = matcher.build_system_prompt(matcher.load_config())
    check("5+ years" in prompt and "Senior" in prompt, "system prompt penalizes seniority")


if __name__ == "__main__":
    test_parsing()
    test_truncate()
    test_retries()
    test_pipeline()
    print("\nAll Phase 3 checks passed.")
