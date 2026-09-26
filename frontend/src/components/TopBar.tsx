import type { Theme } from '../hooks'
import { type JobStatus, type Stats, STATUSES } from '../types'
import { STATUS_STYLES } from '../utils'

interface TopBarProps {
  stats: Stats | null
  running: boolean
  quickRun: boolean
  onQuickRunChange: (value: boolean) => void
  onFetch: () => void
  onRefresh: () => void
  theme: Theme
  onToggleTheme: () => void
}

/** Title, per-status counts, "Fetch new jobs" button and theme toggle. */
export function TopBar({ stats, running, quickRun, onQuickRunChange, onFetch, onRefresh, theme, onToggleTheme }: TopBarProps) {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-bold tracking-tight">Job Tracker</h1>
        {stats && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {stats.scores.total} jobs · {stats.scores.scored} scored · {stats.scores.above_threshold} ≥ {stats.scores.threshold}
          </span>
        )}
      </div>

      {/* Counts per status */}
      <ul className="flex flex-wrap gap-2" aria-label="Jobs per status">
        {STATUSES.map((status: JobStatus) => (
          <li key={status} className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status].pill}`}>
            {status} <span className="font-bold tabular-nums">{stats?.by_status[status] ?? 0}</span>
          </li>
        ))}
      </ul>

      <div className="ml-auto flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400" title="1 search term, 1 location, 10 results per site">
          <input
            type="checkbox"
            checked={quickRun}
            onChange={(event) => onQuickRunChange(event.target.checked)}
            disabled={running}
            className="accent-sky-600"
          />
          Quick
        </label>

        <button
          type="button"
          onClick={onFetch}
          disabled={running}
          className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
        >
          {running && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
          {running ? 'Fetching…' : 'Fetch new jobs'}
        </button>

        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          title="Reload jobs from the database"
          aria-label="Reload jobs"
        >
          ↻
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  )
}
