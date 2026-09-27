import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Terminal, X } from 'lucide-react'
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

/** Card showing live progress of POST /run, then a summary when it finishes. */
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
  const warn = run.state === 'failed' || problems.length > 0

  const Icon = running ? Loader2 : warn ? AlertTriangle : CheckCircle2
  const iconClass = running
    ? 'animate-spin text-indigo-500'
    : warn
      ? 'text-amber-500'
      : 'text-emerald-500'

  return (
    <section
      role="status"
      className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-white/[0.03]"
    >
      {/* Indeterminate progress bar while running */}
      {running && (
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-indigo-100 dark:bg-indigo-500/10">
          <div className="h-full w-2/5 animate-indeterminate rounded-full bg-linear-to-r from-indigo-500 to-violet-500" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {running ? 'Fetching new jobs' : run.state === 'failed' ? 'Run failed' : 'Run finished'}
            <span className="ml-2 font-normal text-slate-400 tabular-nums">{elapsed(run.started_at, run.finished_at)}</span>
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {running
              ? run.current_step
              : [
                  inserted !== null ? `${inserted} new jobs saved` : null,
                  result?.matcher
                    ? `${result.matcher.scored} scored${result.matcher.failed ? `, ${result.matcher.failed} failed` : ''}${
                        result.matcher.remaining ? `, ${result.matcher.remaining} still unscored` : ''
                      }`
                    : null,
                  result?.matcher?.stopped_early ? result.matcher.stop_reason : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowLog((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          aria-expanded={showLog}
        >
          <Terminal className="h-3.5 w-3.5" /> Log
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showLog ? 'rotate-180' : ''}`} />
        </button>
        {!running && (
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {problems.length > 0 && (
        <ul className="mx-4 mb-3 space-y-1 rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:bg-amber-400/[0.07] dark:text-amber-200">
          {problems.map((problem) => (
            <li key={problem}>• {problem}</li>
          ))}
        </ul>
      )}

      {showLog && (
        <pre className="thin-scroll mx-4 mb-4 max-h-56 overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300">
          {run.log.length ? run.log.join('\n') : 'No log lines yet.'}
        </pre>
      )}
    </section>
  )
}
