import { useEffect, useState } from 'react'
import type { RunStatus } from '../types'

interface RunProgressProps {
  run: RunStatus
  onDismiss: () => void
}

function elapsed(fromIso: string | null, toIso: string | null): string {
  if (!fromIso) return ''
  const end = toIso ? new Date(toIso).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((end - new Date(fromIso).getTime()) / 1000))
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

/** Banner under the top bar showing live progress of POST /run, then a summary. */
export function RunProgress({ run, onDismiss }: RunProgressProps) {
  const [showLog, setShowLog] = useState(false)
  const [, forceTick] = useState(0)
  const running = run.state === 'running'

  // Re-render every second so the elapsed timer moves.
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => forceTick((n) => n + 1), 1000)
    return () => window.clearInterval(timer)
  }, [running])

  const result = run.result
  const inserted = result?.collector
    ? Object.values(result.collector).reduce((sum, source) => sum + source.inserted, 0)
    : null
  const problems = [...(result?.errors ?? []), ...(run.error ? [run.error] : [])]

  const colour = running
    ? 'border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40'
    : run.state === 'failed' || problems.length > 0
      ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
      : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'

  return (
    <div className={`mx-4 mt-3 rounded-lg border px-4 py-3 text-sm ${colour}`} role="status">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {running && <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" aria-hidden />}
        <strong>{running ? 'Fetching jobs…' : run.state === 'failed' ? 'Run failed' : 'Run finished'}</strong>
        <span className="text-slate-500 tabular-nums dark:text-slate-400">{elapsed(run.started_at, run.finished_at)}</span>

        {running && <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300">{run.current_step}</span>}

        {!running && (
          <span className="flex-1 text-slate-700 dark:text-slate-300">
            {inserted !== null && <>{inserted} new jobs saved. </>}
            {result?.matcher && (
              <>
                {result.matcher.scored} scored{result.matcher.failed ? `, ${result.matcher.failed} failed` : ''}
                {result.matcher.remaining ? `, ${result.matcher.remaining} still unscored` : ''}.{' '}
                {result.matcher.stopped_early && <em>{result.matcher.stop_reason}</em>}
              </>
            )}
          </span>
        )}

        <button type="button" onClick={() => setShowLog((v) => !v)} className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-300">
          {showLog ? 'Hide log' : 'Show log'}
        </button>
        {!running && (
          <button type="button" onClick={onDismiss} className="text-xs opacity-60 hover:opacity-100" aria-label="Dismiss">
            ✕
          </button>
        )}
      </div>

      {problems.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-amber-800 dark:text-amber-300">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      {showLog && (
        <pre className="thin-scroll mt-2 max-h-48 overflow-auto rounded bg-white/70 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap dark:bg-slate-900/70">
          {run.log.length ? run.log.join('\n') : 'No log lines yet.'}
        </pre>
      )}
    </div>
  )
}
