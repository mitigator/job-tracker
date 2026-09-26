"""
matcher.py - Scores jobs against your resume with Google Gemini.

For every job that has no score yet:
  1. Build a prompt = candidate summary (config.yaml) + profile.txt + job text
  2. Ask Gemini for strict JSON: {"score": <0-100>, "reason": "<one line>"}
  3. Save score + reason to SQLite

Robustness rules:
  * Uses Gemini's structured output (response_json_schema) so replies are JSON,
    and still parses defensively (code fences, extra text, wrong types).
  * Rate limits (HTTP 429) and server errors (5xx) are retried with exponential
    backoff. If Google tells us how long to wait ("retryDelay"), we wait that long.
  * If retries are exhausted on a 429, the daily quota is probably used up,
    so the run stops early; the remaining jobs get scored next time.
  * Invalid API key / unknown model stop the run immediately with a clear message.
  * Long descriptions are truncated to save tokens.

Run it directly:
    python matcher.py              # score all unscored jobs (up to batch_limit)
    python matcher.py --limit 5    # score only 5 (good first test)
    python matcher.py --rescore    # clear all scores first (after editing profile.txt)
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Optional

import httpx
from google import genai
from google.genai import errors, types

import db
from settings import get_gemini_api_key, load_config, load_profile

logger = logging.getLogger("matcher")

ProgressCallback = Optional[Callable[[str], None]]

# HTTP codes worth retrying: rate limit + temporary server problems.
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
# HTTP codes that mean "your setup is wrong"; retrying won't help.
FATAL_STATUS_CODES = {401, 403, 404}

MAX_REASON_CHARS = 200

# JSON Schema that Gemini must follow (structured output).
RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "score": {"type": "integer", "description": "Match score from 0 to 100"},
        "reason": {"type": "string", "description": "One short sentence explaining the score"},
    },
    "required": ["score", "reason"],
}


# =============================================================================
# Errors and results
# =============================================================================
class FatalMatcherError(Exception):
    """Configuration problem (bad key, unknown model). Stop the whole run."""


class RateLimitExhausted(Exception):
    """Still rate-limited after all retries. Stop the run; try again later."""


@dataclass
class MatchSummary:
    """Totals for one matcher run."""

    scored: int = 0
    failed: int = 0
    remaining: int = 0          # unscored jobs left in the DB after this run
    stopped_early: bool = False
    stop_reason: str = ""
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# =============================================================================
# Prompt building
# =============================================================================
def build_system_prompt(config: dict[str, Any]) -> str:
    """Instructions + scoring rubric. Same for every job."""
    candidate = config.get("candidate") or {}
    years = candidate.get("years_of_experience", 1.5)
    target_range = candidate.get("target_experience_range", "0-3 years")
    roles = ", ".join(candidate.get("target_roles") or [])
    locations = ", ".join(candidate.get("preferred_locations") or [])

    return f"""You are a strict technical recruiter. Rate how well ONE job fits ONE candidate.

Candidate facts:
- Total experience: {years} years. Targets roles needing {target_range} of experience.
- Target roles: {roles}.
- Preferred locations: {locations}.

Scoring rubric (0-100):
- 85-100: Core stack matches (Java/Spring Boot backend, microservices, or full stack Java + React/Angular),
  required experience is within {target_range}, and location fits.
- 65-84: Good match with some gaps (e.g. different but related stack like Node.js/Go backend,
  or a few missing skills), experience still within range.
- 40-64: Partial match: stack mostly different, OR it asks for 3-4 years.
- 0-39: Poor match: different field (sales, support, QA-manual, data science, embedded, DevOps-only, design),
  OR clearly too senior.

Hard rules (apply AFTER the rubric):
- Title contains Senior, Sr., Lead, Staff, Principal, Manager, or Architect -> score at most 40.
- Requires 5+ years of experience -> score at most 35. Requires 4+ years -> at most 55.
- Location outside the preferred list and not remote-friendly -> subtract 15.
- If the description is missing, judge from the title and company only and cap the score at 60.

Reply with JSON only: {{"score": <integer 0-100>, "reason": "<one sentence, max 25 words>"}}.
The reason must mention the main factor (stack match, experience required, seniority, or location)."""


def truncate(text: str, max_chars: int) -> str:
    """Cut long descriptions to save tokens (most useful info is near the top)."""
    text = (text or "").strip()
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "\n\n[description truncated]"


def build_job_prompt(profile: str, job: dict[str, Any], max_chars: int) -> str:
    """The per-job message: resume + job details."""
    description = truncate(job.get("description") or "", max_chars) or "(no description available)"
    return f"""CANDIDATE RESUME:
{profile}

JOB POSTING:
Title: {job.get("title") or ""}
Company: {job.get("company") or "Unknown"}
Location: {job.get("location") or "Unknown"}

Description:
{description}"""


# =============================================================================
# Response parsing
# =============================================================================
def parse_match_response(text: Optional[str]) -> tuple[int, str]:
    """
    Turn Gemini's reply into (score, reason). Raises ValueError if unusable.

    Handles: plain JSON, JSON inside ```json fences, JSON with extra text
    around it, and scores sent as strings or floats.
    """
    if not text or not text.strip():
        raise ValueError("Empty response")

    cleaned = text.strip()
    # Remove markdown code fences if the model added them.
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE).strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Fall back to the first {...} block anywhere in the text.
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if not match:
            raise ValueError(f"No JSON object found in: {text[:120]!r}")
        data = json.loads(match.group(0))

    if not isinstance(data, dict) or "score" not in data:
        raise ValueError(f"JSON has no 'score': {text[:120]!r}")

    score = int(round(float(data["score"])))  # accepts 72, 72.0, "72"
    score = max(0, min(100, score))
    reason = str(data.get("reason") or "").strip() or "No reason given"
    return score, reason[:MAX_REASON_CHARS]


# =============================================================================
# Gemini call with retries
# =============================================================================
def _retry_delay_from_error(exc: errors.APIError) -> Optional[float]:
    """Google often includes RetryInfo {"retryDelay": "37s"} in 429 errors."""
    details_text = json.dumps(getattr(exc, "details", None) or {}, default=str)
    match = re.search(r'"retryDelay":\s*"(\d+(?:\.\d+)?)s"', details_text)
    return float(match.group(1)) if match else None


def score_job(
    client: genai.Client,
    model: str,
    system_prompt: str,
    job_prompt: str,
    max_retries: int = 5,
    initial_backoff: float = 5.0,
) -> tuple[int, str]:
    """
    Ask Gemini to score one job. Retries rate limits / server errors.
    Returns (score, reason). Raises FatalMatcherError, RateLimitExhausted or ValueError.
    """
    generation_config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        response_mime_type="application/json",
        response_json_schema=RESPONSE_SCHEMA,
        temperature=0.2,  # low = consistent scores between runs
        # We don't use tools/function calling; disabling it also stops the SDK
        # from logging "AFC is enabled" on every request.
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )

    backoff = initial_backoff
    last_error = ""
    for attempt in range(1, max_retries + 1):
        try:
            response = client.models.generate_content(
                model=model,
                contents=job_prompt,
                config=generation_config,
            )
            try:
                return parse_match_response(response.text)
            except (ValueError, TypeError) as parse_error:
                # Occasionally the model returns bad JSON; one retry usually fixes it.
                last_error = f"Unparseable reply: {parse_error}"
                logger.warning("  attempt %d/%d: %s", attempt, max_retries, last_error)
                if attempt >= 2:
                    raise ValueError(last_error) from parse_error

        except errors.APIError as exc:
            code = exc.code or 0
            message = (exc.message or str(exc))[:200]

            # Setup problems: stop everything.
            if code in FATAL_STATUS_CODES or "API key" in message:
                raise FatalMatcherError(f"Gemini error {code}: {message}") from exc
            if code not in RETRYABLE_STATUS_CODES:
                raise ValueError(f"Gemini error {code}: {message}") from exc

            last_error = f"Gemini error {code}: {message}"
            if attempt == max_retries:
                if code == 429:
                    raise RateLimitExhausted(last_error) from exc
                raise ValueError(last_error) from exc

            wait = _retry_delay_from_error(exc) or backoff
            logger.warning("  attempt %d/%d: %s -> waiting %.0fs", attempt, max_retries, last_error, wait)
            time.sleep(wait + random.uniform(0, 1))  # jitter avoids retrying in lockstep
            backoff *= 2
            continue

        except (httpx.HTTPError, ConnectionError, TimeoutError) as exc:
            # Network hiccup: retry with backoff.
            last_error = f"Network error: {type(exc).__name__}: {exc}"
            if attempt == max_retries:
                raise ValueError(last_error) from exc
            logger.warning("  attempt %d/%d: %s -> waiting %.0fs", attempt, max_retries, last_error, backoff)
            time.sleep(backoff)
            backoff *= 2
            continue

    raise ValueError(last_error or "Unknown error")


# =============================================================================
# Orchestration
# =============================================================================
def match_unscored(
    limit: Optional[int] = None,
    progress: ProgressCallback = None,
    client: Optional[genai.Client] = None,
) -> MatchSummary:
    """
    Score every unscored job (up to `limit`, default batch_limit from config).
    `client` can be injected for testing; normally it's created from .env.
    """
    config = load_config()
    matcher_cfg: dict[str, Any] = config.get("matcher") or {}
    model: str = matcher_cfg.get("model", "gemini-3.5-flash-lite")
    max_chars = int(matcher_cfg.get("max_description_chars", 6000))
    max_retries = int(matcher_cfg.get("max_retries", 5))
    initial_backoff = float(matcher_cfg.get("initial_backoff_seconds", 5))
    delay = float(matcher_cfg.get("delay_between_calls_seconds", 4))
    batch_limit = limit or int(matcher_cfg.get("batch_limit", 200))

    db.init_db()
    summary = MatchSummary()
    jobs = db.get_unscored_jobs(limit=batch_limit)
    if not jobs:
        _report(progress, "Matcher: no unscored jobs")
        return summary

    if client is None:
        client = genai.Client(api_key=get_gemini_api_key())

    system_prompt = build_system_prompt(config)
    profile = load_profile()
    _report(progress, f"Matcher: scoring {len(jobs)} jobs with {model}")

    for index, job in enumerate(jobs, start=1):
        label = f"[{index}/{len(jobs)}] {job['title']} @ {job.get('company') or '?'}"
        try:
            score, reason = score_job(
                client, model, system_prompt,
                build_job_prompt(profile, job, max_chars),
                max_retries=max_retries, initial_backoff=initial_backoff,
            )
            db.update_match(job["id"], score, reason)
            summary.scored += 1
            _report(progress, f"{label} -> {score}: {reason}")

        except FatalMatcherError as exc:
            summary.stopped_early, summary.stop_reason = True, str(exc)
            logger.error("Stopping: %s", exc)
            break
        except RateLimitExhausted as exc:
            summary.stopped_early = True
            summary.stop_reason = f"Rate limit / quota exhausted, try again later ({exc})"
            logger.error("Stopping: %s", summary.stop_reason)
            break
        except Exception as exc:  # this job failed; it stays unscored for next run
            summary.failed += 1
            summary.errors.append(f"job {job['id']}: {exc}")
            logger.warning("%s -> FAILED: %s", label, exc)

        if index < len(jobs):
            time.sleep(delay)  # stay under requests-per-minute limits

    summary.remaining = len(db.get_unscored_jobs(limit=100_000))
    logger.info("Matcher done: scored %d, failed %d, still unscored %d%s",
                summary.scored, summary.failed, summary.remaining,
                f" (stopped early: {summary.stop_reason})" if summary.stopped_early else "")
    return summary


def _report(progress: ProgressCallback, message: str) -> None:
    logger.info(message)
    if progress:
        progress(message)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score unscored jobs with Gemini.")
    parser.add_argument("--limit", type=int, help="Max jobs to score this run (default: batch_limit).")
    parser.add_argument("--rescore", action="store_true", help="Clear all existing scores first.")
    return parser.parse_args()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
                        stream=sys.stdout)
    # The SDK's HTTP library logs every request at INFO; keep the output readable.
    logging.getLogger("httpx").setLevel(logging.WARNING)

    args = _parse_args()
    if args.rescore:
        db.init_db()
        logger.info("Cleared %d existing scores", db.clear_scores())
    result = match_unscored(limit=args.limit)
    sys.exit(1 if result.stopped_early and result.scored == 0 else 0)
