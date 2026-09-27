# Job Tracker

A personal tool that collects software jobs every day, scores each one against my resume with Google Gemini, and shows them on a Kanban dashboard where I track my applications.

It **never applies to jobs automatically**. I open each link and apply myself.

![Stack](https://img.shields.io/badge/Python-3.10%2B-blue) ![Stack](https://img.shields.io/badge/FastAPI-0.141-teal) ![Stack](https://img.shields.io/badge/React-19-61dafb) ![Stack](https://img.shields.io/badge/Vite-8-646cff) ![Stack](https://img.shields.io/badge/Tailwind-4-38bdf8)

## How it works

```
                 every day (Task Scheduler) or "Fetch new jobs" button
                                        │
      ┌─────────────────────────────────┴─────────────────────────────┐
      ▼                                                               ▼
 collector.py                                                    matcher.py
 LinkedIn, Indeed (JobSpy)          ──►  jobs.db (SQLite)  ──►   Gemini scores each new job
 Greenhouse + Lever company boards       status = New            0-100 + one-line reason
                                               │
                                               ▼
                                api.py (FastAPI)  ◄──►  React dashboard
                                                        drag between New / Applied /
                                                        In progress / Interview / Rejected
```

## Quick start (Windows)

Requirements: **Python 3.10+** (tested on 3.13) and **Node.js 20.19+ or 22.12+**.

```powershell
git clone <this repo>
cd Job-Tracker

.\setup.ps1          # one time: venv, packages, .env files, database, npm install
notepad backend\.env # paste your Gemini key (https://aistudio.google.com/apikey)

.\start.ps1          # starts backend + frontend and opens http://localhost:5173
```

- You can also double-click **`start.bat`**. Press **Ctrl+C** (or close the window) to stop both servers.
- If PowerShell blocks scripts, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use `powershell -ExecutionPolicy Bypass -File .\setup.ps1`.
- `start.ps1 -NoBrowser` skips opening the browser. `start.ps1 -Reload` restarts the API when you change code (development only; a restart stops a fetch that's in progress).

Then click **Fetch new jobs** (tick **Quick** for a 1-2 minute test run), or schedule it daily (below).

## Schedule the daily run

```powershell
.\scripts\register-daily-task.ps1               # every day at 09:00
.\scripts\register-daily-task.ps1 -Time 07:30   # pick a different time (re-running replaces the task)
```

This creates a Windows Task Scheduler task called **JobTracker-Daily** that runs `backend\run_daily.py` (collect, then score):

- **Runs as you, while you're logged in.** It needs no admin rights and no stored password.
- **No window pops up.** It uses `pythonw.exe`, and output goes to `backend\logs\run_daily.log`.
- **Catches up after missed runs.** If the PC was off or asleep at 09:00, it runs as soon as it's back.
- **Waits for internet**, and is stopped if it runs longer than 2 hours.

Useful commands:

```powershell
Start-ScheduledTask -TaskName JobTracker-Daily        # run it right now
Get-ScheduledTaskInfo -TaskName JobTracker-Daily      # LastTaskResult 0 = success, 267009 = still running
Get-Content backend\logs\run_daily.log -Tail 30       # see what happened
.\scripts\unregister-daily-task.ps1                   # remove the schedule
```

You can also see and edit the task in the **Task Scheduler** app (Task Scheduler Library > JobTracker-Daily). A run exit code of 1 means a step reported errors, e.g. no Gemini key; 2 means it crashed. Details are in the log either way.

## Logs

Each program writes to its own file in `backend/logs/`, rotated at about 2 MB with 5 old copies kept:

| File | Written by |
|---|---|
| `run_daily.log` | The scheduled task, or `python run_daily.py` |
| `api.log` | The API server, including runs started with the dashboard's **Fetch new jobs** button |
| `collector.log`, `matcher.log` | Running `collector.py` / `matcher.py` by hand |

Change the level (e.g. `DEBUG`), size or folder under `logging:` in `config.yaml`. On Windows, a log file can't be rotated while another process has it open, which is why each program gets its own file.

## Dashboard

- **Summary tiles**: top matches (score at or above the threshold) and a count for every status.
- **Kanban board** with New, Applied, In progress, Interview scheduled and Rejected.
  - Drag cards between columns with the mouse, by press-and-hold on touch screens, or with the keyboard (focus a card, Space, arrow keys, Space).
  - The new status saves immediately. If the save fails, the card moves back and an error message appears.
- **Cards** show the company (as a coloured initials avatar), title, location, how long ago the job was found, and the source. They also show a score ring (green ≥ 80, lime ≥ 60, amber ≥ 40, red below, dashed if unscored), Gemini's reason, your notes, and an **Open job** link.
- **Click a card** to open the details panel, which slides in from the right:
  - full description, score and reason
  - a one-click status picker
  - notes that save automatically 800 ms after you stop typing, and again when you close the panel
- **Filters**: search, source, minimum score, "show unscored", and **city chips**.
  - Chips: Bengaluru, Remote, Gurgaon, Mumbai, Noida, Hyderabad, Pune, plus an "Other city" box.
  - You can select several chips at once, and each chip matches all spellings (e.g. Gurgaon/Gurugram/Haryana).
  - The score filter only hides jobs in **New**. Jobs you've moved to another column always stay visible.
  - Filters are remembered in the browser.
- **Header**: **Fetch new jobs** (switch on **Quick** for a short test run) with live progress and a log, a reload button, and a light/dark toggle. The theme follows your OS until you choose one.

## Job sources

| Source | How | Status (Sep 2026) |
|---|---|---|
| LinkedIn | python-jobspy | Working |
| Indeed | python-jobspy | Working |
| Naukri | python-jobspy | Blocked: Naukri answers `406 recaptcha required` |
| Google Jobs | python-jobspy | Broken upstream: returns 0 results |
| Greenhouse | Public board API | Working (Groww, Rubrik, Druva, HackerRank, InMobi) |
| Lever | Public postings API | Working (CRED, Meesho, Zeta, Hevo Data, Mindtickle) |

Naukri and Google stay enabled. The collector gives up on a site after 3 failures in a row, so they cost about 20 seconds per run and will start working automatically if JobSpy fixes them. A full collection takes roughly 35-40 minutes with all 7 search locations (about 5 minutes each; LinkedIn description fetching is the slow part), plus about 5 seconds per new job for scoring. Comment out locations in `config.yaml` to make it faster.

## How scoring works

For every job without a score, `matcher.py` sends `profile.txt` and the job description (cut to 6,000 characters) to Gemini and asks for strict JSON: `{"score": 0-100, "reason": "..."}`.

- Strong Java/Spring Boot or full-stack Java + React/Angular match within 0-3 years of experience: **85-100**
- Senior, Lead, Staff or Manager titles: at most **40**
- Roles requiring 5+ years: at most **35**; 4+ years: at most **55**

**Retries and quota:**
- Rate limits (HTTP 429), server errors and network drops are retried, with the wait doubling each time. When Google says how long to wait (`retryDelay`), it waits that long.
- If the daily quota runs out, the run stops early. The remaining jobs are scored on the next run.

**Model:** `gemini-3.5-flash-lite` by default (fast and cheap). Switch to `gemini-3.8-flash` in config for better judgement. Gemini 2.5 models are now access-restricted.

**After editing `profile.txt`**, re-score everything with `python matcher.py --rescore`.

## Configuration

Everything lives in [`backend/config.yaml`](backend/config.yaml):

| Section | What you can change |
|---|---|
| `jobspy` | Sites, search terms, locations (Bengaluru, Remote India, Gurugram, Mumbai, Noida, Hyderabad, Pune), results per search, max job age. Each location adds about 5 minutes to a full run |
| `companies` | Greenhouse/Lever board slugs, and the location keywords that keep only India jobs. A company's slug is in its careers URL: `boards.greenhouse.io/<slug>` or `jobs.lever.co/<slug>` |
| `filters` | Title keywords to always skip (e.g. Principal, Director) or require (e.g. engineer, developer) |
| `matcher` | Gemini model, score threshold (default 60), retries, delay between calls |
| `logging` | Log folder, level, rotation size and count |
| `api` | Host, port, allowed frontend origins (CORS) |
| `candidate` | Experience, target roles and locations used in the Gemini prompt |

Secrets live only in `backend/.env` (`GEMINI_API_KEY`), which git ignores. The frontend's `frontend/.env` holds `VITE_API_BASE_URL` (default `http://127.0.0.1:8000`).

## Command-line usage

Run these from `backend\` after `.\.venv\Scripts\Activate.ps1`:

```powershell
python run_daily.py                  # full pipeline: collect, then score
python run_daily.py --quick          # small test run (1 term, 1 location)
python run_daily.py --skip-collect   # only score unscored jobs
python run_daily.py --skip-match     # only collect

python collector.py --sources greenhouse,lever --dry-run   # fetch and filter, don't save
python matcher.py --limit 5          # score 5 jobs
python matcher.py --rescore          # clear all scores and score again

python db.py                         # database summary
python api.py                        # API only (docs at http://127.0.0.1:8000/docs)
```

## REST API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Server is up |
| GET | `/meta` | Statuses, sources, score threshold, whether a Gemini key is set |
| GET | `/jobs` | List jobs. Filters: `status`, `source`, `min_score`, `include_unscored`, `location`, `search`, `limit`, `offset` |
| GET | `/jobs/{id}` | One job with its full description |
| PATCH | `/jobs/{id}` | Update `status` and/or `notes` |
| GET | `/stats` | Counts per status, per source, and score totals |
| POST | `/run` | Start collector + matcher in the background (body: `quick`, `skip_collect`, `skip_match`). Returns 409 if a run is already going |
| GET | `/run/status` | State (`idle`/`running`/`finished`/`failed`), current step, recent log lines, result |

`GET /jobs` hides jobs below `score_threshold` unless you pass `min_score` (use `0` for everything). Interactive docs: <http://127.0.0.1:8000/docs>.

## Tests

```powershell
cd backend
python test_setup.py     # config, profile, database functions
python test_matcher.py   # JSON parsing, retries/backoff, rate-limit handling (fake Gemini client)
python test_api.py       # every endpoint, filters, background run, CORS (fake pipeline)

cd ..\frontend
npm run build            # TypeScript type-check + production build
npm run lint             # oxlint
```

The backend tests run offline, use a temporary database, and don't need an API key.

## Project structure

```
Job-Tracker/
├── setup.ps1                     # one-time setup
├── start.ps1 / start.bat         # start backend + frontend together
├── scripts/
│   ├── register-daily-task.ps1   # schedule run_daily.py (Task Scheduler)
│   └── unregister-daily-task.ps1
├── backend/
│   ├── config.yaml               # all settings
│   ├── profile.txt               # my resume in plain text (sent to Gemini)
│   ├── .env / .env.example       # GEMINI_API_KEY (.env is git-ignored)
│   ├── settings.py               # loads config.yaml, .env, profile.txt
│   ├── logging_setup.py          # console + rotating log files
│   ├── db.py                     # SQLite helpers
│   ├── collector.py              # JobSpy + Greenhouse/Lever fetchers
│   ├── matcher.py                # Gemini scoring
│   ├── run_daily.py              # collector -> matcher
│   ├── api.py                    # FastAPI REST API
│   ├── test_*.py                 # offline tests
│   ├── requirements.txt
│   ├── jobs.db                   # the database (git-ignored)
│   └── logs/                     # log files (git-ignored)
└── frontend/                     # React 19 + TypeScript + Vite 8 + Tailwind 4
    ├── .env / .env.example       # VITE_API_BASE_URL
    └── src/
        ├── App.tsx               # data loading, filters, drag-and-drop saves, run polling
        ├── api.ts                # axios calls to the backend
        ├── types.ts              # TypeScript types matching the API
        ├── hooks.ts              # debounce, dark mode, saved filters
        ├── utils.ts              # labels, colours, time-ago, description cleanup
        └── components/           # TopBar, FilterBar, Board, Column, JobCard, JobModal, ...
```

## Database

SQLite file at `backend/jobs.db` with one `jobs` table:

`id, url (unique), title, company, location, source, description, match_score, match_reason, status, notes, date_found, date_updated`

Statuses: `New`, `Applied`, `In progress`, `Interview scheduled`, `Rejected`. Back it up by copying the file while the app is stopped.

## Troubleshooting

| Problem | Fix |
|---|---|
| `pip install` fails building numpy | Don't install `python-jobspy` with its dependencies. It pins `numpy==1.26.3`, which has no wheels for Python 3.12+. `setup.ps1` installs it with `--no-deps`. |
| Dashboard says "Can't reach the API" | The backend isn't running. Use `start.ps1`, or check `backend\logs\api.log`. |
| "Port 8000/5173 is already in use" | Job Tracker is already running in another window, or another app uses the port. |
| Jobs aren't getting scores | Check that `GEMINI_API_KEY` is in `backend\.env` (the dashboard shows a banner if it's missing). Look for quota messages in the log. |
| LinkedIn returns 0 results | LinkedIn rate-limits scrapers. Wait a few hours, or lower `results_wanted` in config. |
| Scheduled task didn't run | Open Task Scheduler and check the task's History tab. The task only runs while you're logged in. |

## Tech notes

- **python-jobspy 1.1.82** is installed with `--no-deps` (see Troubleshooting).
- **google-genai** is the current official Gemini SDK. It replaced `google-generativeai`, and structured JSON output uses `response_json_schema`.
- **Starlette 1.7** needs `httpx2` for FastAPI's `TestClient`.
- **Tailwind 4** is configured in CSS (`@import 'tailwindcss'`, `@custom-variant dark`), so there's no `tailwind.config.js`.
- **Vite 8's React template** uses oxlint and TypeScript 6.0.
