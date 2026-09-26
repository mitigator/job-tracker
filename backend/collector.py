"""
collector.py - Fetches jobs from job boards and company career pages.

Sources:
  * JobSpy (python-jobspy): LinkedIn, Indeed, Naukri, Google Jobs
  * Greenhouse public job board API
  * Lever public postings API

Every job is normalized into ONE dict shape before saving:
    {"url", "title", "company", "location", "source", "description"}

Robustness rules:
  * Each source (and each individual search) is wrapped in try/except, so one
    failing site never stops the others.
  * We sleep between requests to be polite and avoid rate limits.
  * Duplicates are skipped by URL (DB unique constraint) and by
    (title, company), which catches the same job posted on several boards.
  * Jobs are saved after EACH source finishes, so a crash later in the run
    doesn't lose what was already collected.

Run it directly:
    python collector.py                         # everything in config.yaml
    python collector.py --quick                 # 1 term, 1 location, 10 results/site
    python collector.py --sources greenhouse,lever
    python collector.py --dry-run               # fetch + filter, but don't save
"""

from __future__ import annotations

import argparse
import copy
import html
import logging
import math
import re
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Iterator, Optional

import requests
from bs4 import BeautifulSoup
from jobspy import scrape_jobs

import db
from settings import load_config

logger = logging.getLogger("collector")

# Type alias for an optional "report progress" function (used by the API in Phase 4).
ProgressCallback = Optional[Callable[[str], None]]

REQUEST_TIMEOUT_SECONDS = 20
HTTP_HEADERS = {"User-Agent": "personal-job-tracker/1.0 (+manual applications only)"}

GREENHOUSE_URL = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
LEVER_URL = "https://api.lever.co/v0/postings/{slug}"


# =============================================================================
# Result bookkeeping
# =============================================================================
@dataclass
class SourceResult:
    """How many jobs one source produced at each step."""

    source: str
    fetched: int = 0        # raw jobs returned by the site/API
    filtered_out: int = 0   # dropped by title/location filters
    duplicates: int = 0     # already in DB or seen earlier in this run
    inserted: int = 0       # new rows saved
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# =============================================================================
# Small helpers
# =============================================================================
def _clean(value: Any) -> Any:
    """Turn pandas NaN / empty strings into None and strip whitespace."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _html_to_text(raw_html: Optional[str]) -> str:
    """
    Convert an HTML job description into readable plain text.
    Greenhouse double-escapes its HTML (&lt;div&gt;), so unescape first.
    """
    if not raw_html:
        return ""
    soup = BeautifulSoup(html.unescape(raw_html), "html.parser")
    text = soup.get_text("\n")
    # Collapse runs of blank lines / spaces left over from the HTML layout.
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()


def _contains_any(text: str, keywords: list[str]) -> bool:
    """Case-insensitive 'does text contain any of these words'."""
    text = text.lower()
    return any(keyword.lower() in text for keyword in keywords)


class JobFilter:
    """
    Decides whether a normalized job should be kept.
    Also remembers what it has seen, so duplicates within a run are dropped.
    """

    def __init__(self, filters_config: dict[str, Any], existing_keys: set[tuple[str, str]]):
        self.exclude_keywords: list[str] = filters_config.get("title_exclude_keywords") or []
        self.include_keywords: list[str] = filters_config.get("title_include_keywords") or []
        self.seen_urls: set[str] = set()
        self.seen_keys: set[tuple[str, str]] = set(existing_keys)

    def accept(self, job: dict[str, Any], result: SourceResult) -> bool:
        title = job["title"]

        # 1) Title filters from config.yaml
        if self.exclude_keywords and _contains_any(title, self.exclude_keywords):
            result.filtered_out += 1
            return False
        if self.include_keywords and not _contains_any(title, self.include_keywords):
            result.filtered_out += 1
            return False

        # 2) Duplicate checks (same URL, or same title at the same company)
        key = (title.strip().lower(), (job.get("company") or "").strip().lower())
        has_company = bool(key[1])
        if job["url"] in self.seen_urls or (has_company and key in self.seen_keys):
            result.duplicates += 1
            return False

        self.seen_urls.add(job["url"])
        if has_company:
            self.seen_keys.add(key)
        return True


def _save(jobs: list[dict[str, Any]], result: SourceResult, dry_run: bool) -> None:
    """Insert jobs into SQLite and update the counters."""
    if dry_run or not jobs:
        return
    inserted, skipped = db.insert_jobs(jobs)
    result.inserted += inserted
    result.duplicates += skipped


class _JobSpyErrorCapture(logging.Handler):
    """
    JobSpy often logs a failure (e.g. Naukri 'recaptcha required', Google
    'initial cursor not found') and returns an empty table instead of raising.
    This handler collects those WARNING/ERROR messages so we can count them.
    """

    def __init__(self) -> None:
        super().__init__(level=logging.WARNING)
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(record.getMessage()[:300])


@contextmanager
def _capture_jobspy_problems() -> Iterator[_JobSpyErrorCapture]:
    """Temporarily attach the capture handler to every JobSpy logger."""
    capture = _JobSpyErrorCapture()
    # Loggers are named like "JobSpy:LinkedIn", "JobSpy:Naukri", ...
    jobspy_loggers = [
        logging.getLogger(name)
        for name in list(logging.root.manager.loggerDict)
        if name.startswith("JobSpy")
    ]
    for jobspy_logger in jobspy_loggers:
        jobspy_logger.addHandler(capture)
    try:
        yield capture
    finally:
        for jobspy_logger in jobspy_loggers:
            jobspy_logger.removeHandler(capture)


def _report(progress: ProgressCallback, message: str) -> None:
    """Log a progress message and forward it to the callback, if any."""
    logger.info(message)
    if progress:
        progress(message)


# =============================================================================
# JobSpy (LinkedIn, Indeed, Naukri, Google Jobs)
# =============================================================================
def _jobspy_kwargs(site: str, term: str, location: dict[str, Any], cfg: dict[str, Any]) -> dict[str, Any]:
    """Build the scrape_jobs() arguments for one site + search term + location."""
    is_remote = bool(location.get("is_remote"))
    kwargs: dict[str, Any] = {
        "site_name": [site],
        "search_term": term,
        "location": location["name"],
        "results_wanted": cfg.get("results_wanted", 30),
        "hours_old": cfg.get("hours_old", 72),
        "country_indeed": cfg.get("country_indeed", "India"),
        "description_format": "markdown",
        "verbose": 1,  # 0 = errors only, 1 = + warnings, 2 = everything
    }

    if site == "indeed" and is_remote:
        # Indeed can't combine hours_old with is_remote (JobSpy silently drops
        # is_remote), so we put "remote" into the search text instead.
        kwargs["search_term"] = f"{term} remote"
    else:
        kwargs["is_remote"] = is_remote

    if site == "linkedin":
        kwargs["linkedin_fetch_description"] = bool(cfg.get("linkedin_fetch_description", True))

    if site == "google":
        template = cfg.get("google_search_term_template", "{term} jobs near {location}")
        google_location = location.get("google_location") or location["name"]
        kwargs["google_search_term"] = template.format(term=term, location=google_location)

    return kwargs


def _normalize_jobspy(record: dict[str, Any], site: str) -> Optional[dict[str, Any]]:
    """Convert one JobSpy DataFrame row into our standard job dict."""
    url = _clean(record.get("job_url")) or _clean(record.get("job_url_direct"))
    title = _clean(record.get("title"))
    if not url or not title:
        return None

    location = _clean(record.get("location")) or ""
    if _clean(record.get("is_remote")) and "remote" not in location.lower():
        location = f"{location} (Remote)".strip()

    # Put useful structured hints at the top of the description for Gemini.
    header_lines: list[str] = []
    experience = _clean(record.get("experience_range"))  # Naukri provides this
    if experience:
        header_lines.append(f"Experience required: {experience}")
    job_level = _clean(record.get("job_level"))  # LinkedIn provides this
    if job_level:
        header_lines.append(f"Seniority level: {job_level}")
    description = _clean(record.get("description")) or ""
    if header_lines:
        description = "\n".join(header_lines) + "\n\n" + description

    return {
        "url": str(url),
        "title": str(title),
        "company": _clean(record.get("company")),
        "location": location or None,
        "source": site,
        "description": description.strip(),
    }


def collect_jobspy_site(
    site: str,
    cfg: dict[str, Any],
    job_filter: JobFilter,
    progress: ProgressCallback = None,
    dry_run: bool = False,
) -> SourceResult:
    """Run every (search term x location) query for ONE site and save the results."""
    result = SourceResult(source=site)
    delay = float(cfg.get("delay_between_searches_seconds", 5))
    max_failures = int(cfg.get("max_consecutive_failures", 3))
    consecutive_failures = 0
    kept: list[dict[str, Any]] = []

    for location in cfg.get("locations", []):
        for term in cfg.get("search_terms", []):
            if consecutive_failures >= max_failures:
                message = f"{site}: {consecutive_failures} failures in a row, skipping the rest of this site"
                logger.warning(message)
                result.errors.append(message)
                _save(kept, result, dry_run)
                return result

            label = f"{site}: '{term}' in {location['name']}{' (remote)' if location.get('is_remote') else ''}"
            _report(progress, f"Searching {label}")

            try:
                with _capture_jobspy_problems() as capture:
                    df = scrape_jobs(**_jobspy_kwargs(site, term, location, cfg))
            except Exception as exc:  # any scraper error: log it and move on
                consecutive_failures += 1
                message = f"{label} failed: {type(exc).__name__}: {exc}"
                logger.warning(message)
                result.errors.append(message)
                time.sleep(delay)
                continue

            records = df.to_dict("records") if df is not None and not df.empty else []

            # No exception, but JobSpy logged a problem and returned nothing:
            # treat it as a failure (site is blocking us or the scraper is broken).
            if not records and capture.messages:
                consecutive_failures += 1
                message = f"{label} returned no results: {capture.messages[-1]}"
                result.errors.append(message)
                time.sleep(delay)
                continue
            consecutive_failures = 0

            result.fetched += len(records)
            for record in records:
                job = _normalize_jobspy(record, site)
                if job and job_filter.accept(job, result):
                    kept.append(job)

            logger.info("  -> %d results", len(records))
            time.sleep(delay)  # be polite between searches

    _save(kept, result, dry_run)
    return result


# =============================================================================
# Greenhouse
# =============================================================================
def _fetch_greenhouse_company(
    session: requests.Session,
    company: dict[str, str],
    location_keywords: list[str],
    job_filter: JobFilter,
    result: SourceResult,
) -> list[dict[str, Any]]:
    """Fetch and normalize all jobs for one Greenhouse company."""
    response = session.get(
        GREENHOUSE_URL.format(slug=company["slug"]),
        params={"content": "true"},  # include the job description HTML
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    postings: list[dict[str, Any]] = response.json().get("jobs", [])
    result.fetched += len(postings)

    kept: list[dict[str, Any]] = []
    for posting in postings:
        location = ((posting.get("location") or {}).get("name") or "").strip()
        office_locations = " ".join(
            (office.get("location") or office.get("name") or "") for office in posting.get("offices") or []
        )
        # Greenhouse boards are global: keep only India / Bengaluru jobs.
        if not _contains_any(f"{location} {office_locations}", location_keywords):
            result.filtered_out += 1
            continue

        url = _clean(posting.get("absolute_url"))
        title = _clean(posting.get("title"))
        if not url or not title:
            continue

        job = {
            "url": url,
            "title": title,
            "company": _clean(posting.get("company_name")) or company["name"],
            "location": location or None,
            "source": "greenhouse",
            "description": _html_to_text(posting.get("content")),
        }
        if job_filter.accept(job, result):
            kept.append(job)
    return kept


# =============================================================================
# Lever
# =============================================================================
def _lever_description(posting: dict[str, Any]) -> str:
    """Lever splits the description into an intro, bullet lists and a footer."""
    parts: list[str] = []
    if posting.get("descriptionPlain"):
        parts.append(posting["descriptionPlain"].strip())
    for section in posting.get("lists") or []:
        heading = (section.get("text") or "").strip()
        body = _html_to_text(section.get("content"))
        parts.append(f"{heading}\n{body}".strip())
    if posting.get("additionalPlain"):
        parts.append(posting["additionalPlain"].strip())
    return "\n\n".join(part for part in parts if part)


def _fetch_lever_company(
    session: requests.Session,
    company: dict[str, str],
    location_keywords: list[str],
    job_filter: JobFilter,
    result: SourceResult,
) -> list[dict[str, Any]]:
    """Fetch and normalize all jobs for one Lever company."""
    response = session.get(
        LEVER_URL.format(slug=company["slug"]),
        params={"mode": "json"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    postings = response.json()
    if not isinstance(postings, list):  # Lever returns {"ok": false, ...} for unknown slugs
        raise ValueError(f"Unexpected Lever response: {str(postings)[:200]}")
    result.fetched += len(postings)

    kept: list[dict[str, Any]] = []
    for posting in postings:
        categories = posting.get("categories") or {}
        all_locations = categories.get("allLocations") or [categories.get("location")]
        location = ", ".join(loc for loc in all_locations if loc)
        country = (posting.get("country") or "").upper()

        # Keep India jobs: by country code, or by location text.
        if country != "IN" and not _contains_any(location, location_keywords):
            result.filtered_out += 1
            continue

        if (posting.get("workplaceType") or "").lower() == "remote" and "remote" not in location.lower():
            location = f"{location} (Remote)".strip()

        url = _clean(posting.get("hostedUrl"))
        title = _clean(posting.get("text"))
        if not url or not title:
            continue

        job = {
            "url": url,
            "title": title,
            "company": company["name"],
            "location": location or None,
            "source": "lever",
            "description": _lever_description(posting),
        }
        if job_filter.accept(job, result):
            kept.append(job)
    return kept


# =============================================================================
# Company boards runner (shared by Greenhouse and Lever)
# =============================================================================
def collect_company_boards(
    platform: str,
    companies_cfg: dict[str, Any],
    job_filter: JobFilter,
    progress: ProgressCallback = None,
    dry_run: bool = False,
) -> SourceResult:
    """Fetch every configured company on one platform ('greenhouse' or 'lever')."""
    result = SourceResult(source=platform)
    fetch_company = _fetch_greenhouse_company if platform == "greenhouse" else _fetch_lever_company
    location_keywords: list[str] = companies_cfg.get("location_keywords") or ["india"]
    delay = float(companies_cfg.get("delay_between_companies_seconds", 1.5))
    kept: list[dict[str, Any]] = []

    with requests.Session() as session:
        session.headers.update(HTTP_HEADERS)
        for company in companies_cfg.get(platform) or []:
            _report(progress, f"Fetching {platform}: {company['name']}")
            try:
                company_jobs = fetch_company(session, company, location_keywords, job_filter, result)
                kept.extend(company_jobs)
                logger.info("  -> %d relevant jobs", len(company_jobs))
            except Exception as exc:  # one company failing must not stop the others
                message = f"{platform}:{company['slug']} failed: {type(exc).__name__}: {exc}"
                logger.warning(message)
                result.errors.append(message)
            time.sleep(delay)

    _save(kept, result, dry_run)
    return result


# =============================================================================
# Orchestration
# =============================================================================
def available_sources(config: Optional[dict[str, Any]] = None) -> list[str]:
    """All source names enabled in config.yaml, in run order."""
    config = config or load_config()
    return list(config["jobspy"].get("sites", [])) + ["greenhouse", "lever"]


def collect_all(
    sources: Optional[list[str]] = None,
    quick: bool = False,
    dry_run: bool = False,
    progress: ProgressCallback = None,
) -> dict[str, SourceResult]:
    """
    Run the collector for the chosen sources (default: all) and return
    per-source results. `quick` limits JobSpy to 1 term, 1 location, 10 results.
    """
    config = load_config()
    db.init_db()

    jobspy_cfg: dict[str, Any] = copy.deepcopy(config["jobspy"])
    if quick:
        jobspy_cfg["search_terms"] = jobspy_cfg["search_terms"][:1]
        jobspy_cfg["locations"] = jobspy_cfg["locations"][:1]
        jobspy_cfg["results_wanted"] = 10

    selected = sources or available_sources(config)
    job_filter = JobFilter(config.get("filters") or {}, db.get_title_company_keys())
    results: dict[str, SourceResult] = {}

    for source in selected:
        try:
            if source in ("greenhouse", "lever"):
                results[source] = collect_company_boards(source, config["companies"], job_filter, progress, dry_run)
            elif source in jobspy_cfg.get("sites", []):
                results[source] = collect_jobspy_site(source, jobspy_cfg, job_filter, progress, dry_run)
            else:
                logger.warning("Unknown source '%s' (not in config.yaml), skipping", source)
                continue
        except Exception as exc:  # last-resort safety net per source
            logger.exception("Source %s crashed", source)
            results[source] = SourceResult(source=source, errors=[f"{type(exc).__name__}: {exc}"])

        r = results[source]
        _report(progress, f"{source}: fetched {r.fetched}, new {r.inserted}, "
                          f"duplicates {r.duplicates}, filtered {r.filtered_out}, errors {len(r.errors)}")

    log_summary(results, dry_run)
    return results


def log_summary(results: dict[str, SourceResult], dry_run: bool = False) -> None:
    """Print a small table of per-source counts."""
    logger.info("=" * 72)
    logger.info("%-12s %8s %9s %11s %9s %7s", "source", "fetched", "filtered", "duplicates", "inserted", "errors")
    for r in results.values():
        logger.info("%-12s %8d %9d %11d %9d %7d",
                    r.source, r.fetched, r.filtered_out, r.duplicates, r.inserted, len(r.errors))
    total_new = sum(r.inserted for r in results.values())
    logger.info("=" * 72)
    logger.info("Total new jobs saved: %d%s", total_new, "  (dry run: nothing saved)" if dry_run else "")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect jobs into the local SQLite DB.")
    parser.add_argument("--sources", help="Comma-separated list, e.g. 'greenhouse,lever,naukri'. Default: all.")
    parser.add_argument("--quick", action="store_true", help="1 search term, 1 location, 10 results per site.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and filter but don't write to the DB.")
    return parser.parse_args()


if __name__ == "__main__":
    from logging_setup import setup_logging

    setup_logging("collector")  # console + logs/collector.log

    args = _parse_args()
    chosen = [s.strip() for s in args.sources.split(",")] if args.sources else None
    collect_all(sources=chosen, quick=args.quick, dry_run=args.dry_run)
