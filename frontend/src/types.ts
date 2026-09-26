// Shapes returned by the FastAPI backend (see backend/api.py).

export const STATUSES = ['New', 'Applied', 'In progress', 'Interview scheduled', 'Rejected'] as const
export type JobStatus = (typeof STATUSES)[number]

export interface Job {
  id: number
  url: string
  title: string
  company: string | null
  location: string | null
  source: string
  match_score: number | null
  match_reason: string | null
  status: JobStatus
  notes: string
  date_found: string
  date_updated: string
}

export interface JobDetail extends Job {
  description: string | null
}

export interface JobListResponse {
  count: number
  min_score_applied: number | null
  jobs: Job[]
}

export interface Stats {
  by_status: Record<JobStatus, number>
  by_source: Record<string, number>
  scores: {
    total: number
    scored: number
    unscored: number
    above_threshold: number
    threshold: number
  }
}

export interface Meta {
  statuses: JobStatus[]
  sources: string[]
  score_threshold: number
  gemini_configured: boolean
}

export interface RunOptions {
  quick?: boolean
  skip_collect?: boolean
  skip_match?: boolean
}

export interface SourceResult {
  source: string
  fetched: number
  filtered_out: number
  duplicates: number
  inserted: number
  errors: string[]
}

export interface MatchSummary {
  scored: number
  failed: number
  remaining: number
  stopped_early: boolean
  stop_reason: string
  errors: string[]
}

export interface RunResult {
  collector: Record<string, SourceResult> | null
  matcher: MatchSummary | null
  errors: string[]
  duration_seconds?: number
}

export interface RunStatus {
  state: 'idle' | 'running' | 'finished' | 'failed'
  started_at: string | null
  finished_at: string | null
  options: RunOptions | null
  current_step: string | null
  log: string[]
  result: RunResult | null
  error: string | null
}

/** Filters chosen in the filter bar. */
export interface Filters {
  source: string // '' = all sources
  minScore: number // applies to the "New" column only
  includeUnscored: boolean
  location: string
  search: string
}
