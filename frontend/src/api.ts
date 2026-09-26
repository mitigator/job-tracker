import axios, { AxiosError } from 'axios'
import type { Job, JobDetail, JobListResponse, JobStatus, Meta, RunOptions, RunStatus, Stats } from './types'

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '')

const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
})

/** Turn any axios error into a short, human-readable message. */
export function errorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    if (!error.response) return `Can't reach the API at ${API_BASE_URL}. Is the backend running?`
    const detail = (error.response.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
    return `API error ${error.response.status}`
  }
  return error instanceof Error ? error.message : String(error)
}

export interface JobQuery {
  source?: string
  location?: string
  search?: string
}

/**
 * Fetch jobs for the board.
 * We ask for min_score=0 (everything) and apply the score filter in the UI,
 * because it should only hide *New* jobs. Jobs you've already moved to
 * Applied / Interview etc. must never disappear because of a low score.
 */
export async function fetchJobs(query: JobQuery): Promise<Job[]> {
  const params: Record<string, string | number> = { min_score: 0, limit: 2000 }
  if (query.source) params.source = query.source
  if (query.location?.trim()) params.location = query.location.trim()
  if (query.search?.trim()) params.search = query.search.trim()
  const { data } = await http.get<JobListResponse>('/jobs', { params })
  return data.jobs
}

export async function fetchJob(id: number): Promise<JobDetail> {
  const { data } = await http.get<JobDetail>(`/jobs/${id}`)
  return data
}

export async function updateJob(id: number, changes: { status?: JobStatus; notes?: string }): Promise<JobDetail> {
  const { data } = await http.patch<JobDetail>(`/jobs/${id}`, changes)
  return data
}

export async function fetchStats(): Promise<Stats> {
  const { data } = await http.get<Stats>('/stats')
  return data
}

export async function fetchMeta(): Promise<Meta> {
  const { data } = await http.get<Meta>('/meta')
  return data
}

export async function startRun(options: RunOptions): Promise<RunStatus> {
  const { data } = await http.post<RunStatus>('/run', options)
  return data
}

export async function fetchRunStatus(): Promise<RunStatus> {
  const { data } = await http.get<RunStatus>('/run/status')
  return data
}
