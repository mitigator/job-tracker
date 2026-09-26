import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { errorMessage, fetchJobs, fetchMeta, fetchRunStatus, fetchStats, startRun, updateJob } from './api'
import { Board } from './components/Board'
import { FilterBar } from './components/FilterBar'
import { JobModal } from './components/JobModal'
import { RunProgress } from './components/RunProgress'
import { type Toast, Toasts } from './components/Toasts'
import { TopBar } from './components/TopBar'
import { useDebouncedValue, usePersistentState, useTheme } from './hooks'
import { type Filters, type Job, type JobStatus, type Meta, type RunStatus, type Stats, STATUSES } from './types'

const DEFAULT_THRESHOLD = 60
const RUN_POLL_MS = 2000

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const [meta, setMeta] = useState<Meta | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)
  const [run, setRun] = useState<RunStatus | null>(null)
  const [quickRun, setQuickRun] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  const [filters, setFilters] = usePersistentState<Filters>('filters', {
    source: '',
    minScore: DEFAULT_THRESHOLD,
    includeUnscored: true,
    location: '',
    search: '',
  })
  // Typing in search/location waits 350ms before hitting the API.
  const debouncedSearch = useDebouncedValue(filters.search, 350)
  const debouncedLocation = useDebouncedValue(filters.location, 350)

  // ---------------------------------------------------------------- toasts
  const notify = useCallback((kind: Toast['kind'], message: string) => {
    const id = ++toastId.current
    setToasts((current) => [...current, { id, kind, message }])
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 6000)
  }, [])
  const notifyError = useCallback((message: string) => notify('error', message), [notify])

  // ---------------------------------------------------------------- loading
  const loadStats = useCallback(async () => {
    try {
      setStats(await fetchStats())
    } catch {
      /* the jobs request reports connection problems */
    }
  }, [])

  const loadJobs = useCallback(async () => {
    try {
      const data = await fetchJobs({ source: filters.source, location: debouncedLocation, search: debouncedSearch })
      setJobs(data)
      setApiError(null)
    } catch (error) {
      setApiError(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [filters.source, debouncedLocation, debouncedSearch])

  const loadMeta = useCallback(async () => {
    try {
      const data = await fetchMeta()
      setMeta(data)
      return data
    } catch {
      return null
    }
  }, [])

  // First load: meta (threshold), stats, and any run already in progress.
  useEffect(() => {
    void loadMeta()
    void loadStats()
    fetchRunStatus()
      .then((status) => status.state === 'running' && setRun(status))
      .catch(() => undefined)
  }, [loadMeta, loadStats])

  // Reload jobs whenever server-side filters change.
  useEffect(() => {
    void loadJobs()
  }, [loadJobs])

  const refreshAll = useCallback(() => {
    void loadJobs()
    void loadStats()
    void loadMeta()
  }, [loadJobs, loadStats, loadMeta])

  // ---------------------------------------------------------------- board data
  const threshold = meta?.score_threshold ?? DEFAULT_THRESHOLD

  // Group jobs into columns. The score filter only applies to "New".
  const { columns, hiddenInNew, shownCount } = useMemo(() => {
    const grouped = Object.fromEntries(STATUSES.map((s) => [s, [] as Job[]])) as unknown as Record<JobStatus, Job[]>
    let hidden = 0
    for (const job of jobs) {
      if (job.status === 'New') {
        const passes =
          job.match_score === null ? filters.includeUnscored : job.match_score >= filters.minScore
        if (!passes) {
          hidden += 1
          continue
        }
      }
      grouped[job.status]?.push(job)
    }
    const shown = STATUSES.reduce((sum, status) => sum + grouped[status].length, 0)
    return { columns: grouped, hiddenInNew: hidden, shownCount: shown }
  }, [jobs, filters.minScore, filters.includeUnscored])

  // ---------------------------------------------------------------- actions
  /** Drag-and-drop: update the UI immediately, then save; roll back on failure. */
  const moveJob = useCallback(
    async (jobId: number, status: JobStatus) => {
      const previous = jobs.find((job) => job.id === jobId)
      if (!previous) return
      setJobs((current) => current.map((job) => (job.id === jobId ? { ...job, status } : job)))
      try {
        await updateJob(jobId, { status })
        void loadStats()
      } catch (error) {
        setJobs((current) => current.map((job) => (job.id === jobId ? { ...job, status: previous.status } : job)))
        notifyError(`Couldn't move "${previous.title}": ${errorMessage(error)}`)
      }
    },
    [jobs, loadStats, notifyError],
  )

  /** Called by the modal after it saved notes or status. */
  const handleJobUpdated = useCallback(
    (updated: Job) => {
      setJobs((current) =>
        current.map((job) => (job.id === updated.id ? { ...job, status: updated.status, notes: updated.notes } : job)),
      )
      void loadStats()
    },
    [loadStats],
  )

  const handleFetch = async () => {
    try {
      setRun(await startRun({ quick: quickRun }))
    } catch (error) {
      notifyError(`Couldn't start the run: ${errorMessage(error)}`)
    }
  }

  // Poll /run/status while a run is going; refresh everything when it ends.
  const isRunning = run?.state === 'running'
  useEffect(() => {
    if (!isRunning) return
    const timer = window.setInterval(async () => {
      try {
        const status = await fetchRunStatus()
        setRun(status)
        if (status.state !== 'running') {
          refreshAll()
          notify(status.state === 'failed' ? 'error' : 'success', status.state === 'failed' ? 'Run failed' : 'Run finished')
        }
      } catch {
        /* backend briefly unreachable: keep polling */
      }
    }, RUN_POLL_MS)
    return () => window.clearInterval(timer)
  }, [isRunning, refreshAll, notify])

  // ---------------------------------------------------------------- render
  return (
    <div className="flex h-dvh flex-col">
      <TopBar
        stats={stats}
        running={isRunning}
        quickRun={quickRun}
        onQuickRunChange={setQuickRun}
        onFetch={() => void handleFetch()}
        onRefresh={refreshAll}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {run && <RunProgress run={run} onDismiss={() => setRun(null)} />}

      {meta && !meta.gemini_configured && (
        <p className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          GEMINI_API_KEY isn't set in <code>backend/.env</code>, so new jobs won't be scored.
        </p>
      )}

      <FilterBar
        filters={filters}
        sources={meta?.sources ?? []}
        defaultMinScore={threshold}
        shownCount={shownCount}
        onChange={setFilters}
      />

      <main className="min-h-0 flex-1">
        {apiError ? (
          <div className="mx-4 rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <p className="font-semibold">{apiError}</p>
            <p className="mt-1 opacity-80">
              Start it with <code>python api.py</code> in the backend folder, then retry.
            </p>
            <button type="button" onClick={refreshAll} className="mt-3 rounded-lg bg-rose-600 px-4 py-1.5 font-medium text-white hover:bg-rose-700">
              Retry
            </button>
          </div>
        ) : loading ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading jobs…</p>
        ) : (
          <Board
            columns={columns}
            hiddenInNew={hiddenInNew}
            hiddenHint={`(score below ${filters.minScore}${filters.includeUnscored ? '' : ' or unscored'})`}
            onMove={(jobId, status) => void moveJob(jobId, status)}
            onOpenDetails={setSelectedJobId}
          />
        )}
      </main>

      {selectedJobId !== null && (
        <JobModal
          key={selectedJobId}
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onJobUpdated={handleJobUpdated}
          onError={notifyError}
        />
      )}

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((t) => t.id !== id))} />
    </div>
  )
}
