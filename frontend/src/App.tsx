import { KeyRound, ServerCrash } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE_URL, errorMessage, fetchJobs, fetchMeta, fetchRunStatus, fetchStats, startRun, updateJob } from './api'
import { Board } from './components/Board'
import { BoardSkeleton } from './components/BoardSkeleton'
import { FilterBar } from './components/FilterBar'
import { Header } from './components/Header'
import { JobDrawer } from './components/JobDrawer'
import { RunProgress } from './components/RunProgress'
import { StatTiles } from './components/StatTiles'
import { type Toast, Toasts } from './components/Toasts'
import { useDebouncedValue, usePersistentState, useTheme } from './hooks'
import { type Filters, type Job, type JobStatus, type Meta, type RunStatus, type Stats, STATUSES } from './types'
import { buildLocationQuery } from './utils'

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
    locations: [],
    location: '',
    search: '',
  })
  // Typing in search/location waits 350ms before hitting the API.
  const debouncedSearch = useDebouncedValue(filters.search, 350)
  const debouncedLocation = useDebouncedValue(filters.location, 350)
  // City chips + typed city -> "bengaluru|bangalore|...|<typed>" (the API treats | as OR).
  const locationQuery = buildLocationQuery(filters.locations, debouncedLocation)

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
      const data = await fetchJobs({ source: filters.source, location: locationQuery, search: debouncedSearch })
      setJobs(data)
      setApiError(null)
    } catch (error) {
      setApiError(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [filters.source, locationQuery, debouncedSearch])

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
    <div className="relative min-h-dvh">
      {/* Soft brand glow behind the top of the page */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-linear-to-b from-indigo-100/70 via-violet-50/40 to-transparent dark:from-indigo-500/[0.08] dark:via-violet-500/[0.03]"
        aria-hidden
      />

      <Header
        stats={stats}
        running={isRunning}
        quickRun={quickRun}
        onQuickRunChange={setQuickRun}
        onFetch={() => void handleFetch()}
        onRefresh={refreshAll}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="mx-auto max-w-[1800px] space-y-4 px-4 py-5 sm:px-6">
        <StatTiles stats={stats} />

        {run && <RunProgress run={run} onDismiss={() => setRun(null)} />}

        {meta && !meta.gemini_configured && (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/[0.06] dark:text-amber-200">
            <KeyRound className="h-4 w-4 shrink-0" />
            <p>
              <code className="font-semibold">GEMINI_API_KEY</code> isn't set in <code>backend/.env</code>, so new jobs won't be
              scored.
            </p>
          </div>
        )}

        <FilterBar
          filters={filters}
          sources={meta?.sources ?? []}
          defaultMinScore={threshold}
          shownCount={shownCount}
          onChange={setFilters}
        />

        {apiError ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-white px-6 py-12 text-center dark:border-rose-400/20 dark:bg-white/[0.02]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-500/10">
              <ServerCrash className="h-6 w-6" />
            </div>
            <div>
              <p className="font-display font-semibold">{apiError}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Start it with <code className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-white/10">.\start.ps1</code> (expects{' '}
                {API_BASE_URL}), then retry.
              </p>
            </div>
            <button
              type="button"
              onClick={refreshAll}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <BoardSkeleton />
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
        <JobDrawer
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
