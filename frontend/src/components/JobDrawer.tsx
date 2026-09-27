import { AlertCircle, Check, Clock, ExternalLink, Globe, Loader2, MapPin, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage, fetchJob, updateJob } from '../api'
import { type Job, type JobDetail, type JobStatus, STATUSES } from '../types'
import { cleanDescription, scoreTone, sourceLabel, STATUS_STYLES, timeAgo } from '../utils'
import { CompanyAvatar } from './CompanyAvatar'
import { ScoreRing } from './ScoreRing'

interface JobDrawerProps {
  jobId: number
  onClose: () => void
  onJobUpdated: (job: Job) => void
  onError: (message: string) => void
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** Slide-in panel with full job details, status picker and auto-saving notes. */
export function JobDrawer({ jobId, onClose, onJobUpdated, onError }: JobDrawerProps) {
  const [job, setJob] = useState<JobDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const savedNotes = useRef('') // last value confirmed by the server
  const saveTimer = useRef<number | undefined>(undefined)

  // Load the full job (including description). The parent remounts this
  // component per job (key={jobId}), so state always starts fresh.
  useEffect(() => {
    let cancelled = false
    fetchJob(jobId)
      .then((data) => {
        if (cancelled) return
        setJob(data)
        setNotes(data.notes)
        savedNotes.current = data.notes
      })
      .catch((error) => !cancelled && setLoadError(errorMessage(error)))
    return () => {
      cancelled = true
    }
  }, [jobId])

  const saveNotes = useCallback(
    async (value: string) => {
      if (value === savedNotes.current) return
      setSaveState('saving')
      try {
        const updated = await updateJob(jobId, { notes: value })
        savedNotes.current = updated.notes
        setSaveState('saved')
        onJobUpdated(updated)
      } catch (error) {
        setSaveState('error')
        onError(`Couldn't save notes: ${errorMessage(error)}`)
      }
    },
    [jobId, onJobUpdated, onError],
  )

  // Auto-save: every keystroke restarts an 800ms timer; saving happens when you pause.
  const handleNotesChange = (value: string) => {
    setNotes(value)
    setSaveState('idle')
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void saveNotes(value), 800)
  }

  // Stop a pending timer if the drawer unmounts.
  useEffect(() => () => window.clearTimeout(saveTimer.current), [])

  // Save any pending edit immediately, then close.
  const close = useCallback(() => {
    window.clearTimeout(saveTimer.current)
    if (job && notes !== savedNotes.current) void saveNotes(notes)
    onClose()
  }, [job, notes, saveNotes, onClose])

  // Esc closes the drawer.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const changeStatus = async (status: JobStatus) => {
    if (!job || status === job.status) return
    const previous = job.status
    setJob({ ...job, status }) // feels instant; rolled back on failure
    try {
      const updated = await updateJob(job.id, { status })
      setJob(updated)
      onJobUpdated(updated)
    } catch (error) {
      setJob((current) => (current ? { ...current, status: previous } : current))
      onError(`Couldn't change status: ${errorMessage(error)}`)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 animate-fade-in bg-slate-950/40 backdrop-blur-[2px]" onMouseDown={close} aria-hidden />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-drawer-title"
        className="relative flex h-full w-full max-w-2xl animate-drawer-in flex-col bg-white shadow-2xl dark:bg-[#10131a] dark:ring-1 dark:ring-white/10"
      >
        {/* Loading / error */}
        {!job && !loadError && (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading job…
          </div>
        )}
        {loadError && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm">
            <AlertCircle className="h-8 w-8 text-rose-500" />
            <p className="text-rose-600 dark:text-rose-400">{loadError}</p>
            <button type="button" onClick={onClose} className="font-medium text-indigo-600 hover:underline dark:text-indigo-300">
              Close
            </button>
          </div>
        )}

        {job && (
          <>
            {/* Header */}
            <div className="relative border-b border-slate-200/80 bg-linear-to-b from-indigo-50/80 to-white px-6 pt-6 pb-5 dark:border-white/[0.07] dark:from-indigo-500/[0.07] dark:to-transparent">
              <button
                type="button"
                onClick={close}
                className="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-start gap-4 pr-8">
                <CompanyAvatar company={job.company} size="lg" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{job.company ?? 'Unknown company'}</p>
                  <h2 id="job-drawer-title" className="mt-0.5 text-xl leading-snug font-bold tracking-tight">
                    {job.title}
                  </h2>
                  <div className="mt-2.5 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                    {job.location && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200 dark:bg-white/[0.05] dark:ring-white/10">
                        <MapPin className="h-3 w-3" /> {job.location}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200 dark:bg-white/[0.05] dark:ring-white/10">
                      <Globe className="h-3 w-3" /> {sourceLabel(job.source)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200 dark:bg-white/[0.05] dark:ring-white/10">
                      <Clock className="h-3 w-3" /> Found {timeAgo(job.date_found)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="thin-scroll flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {/* Match */}
              <section className="flex items-center gap-4 rounded-2xl border border-slate-200/80 p-4 dark:border-white/[0.07]">
                <ScoreRing score={job.match_score} size="lg" />
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${scoreTone(job.match_score).text}`}>{scoreTone(job.match_score).label}</p>
                  <p className="mt-0.5 flex gap-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    <Sparkles className="mt-1 h-3.5 w-3.5 shrink-0 text-indigo-400" />
                    {job.match_reason ?? 'Gemini has not scored this job yet.'}
                  </p>
                </div>
              </section>

              {/* Status */}
              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">Status</h3>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Status">
                  {STATUSES.map((status) => {
                    const active = job.status === status
                    const style = STATUS_STYLES[status]
                    return (
                      <button
                        key={status}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => void changeStatus(status)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
                          active
                            ? `${style.soft} ${style.text} border-transparent ring-2 ${style.ring}`
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden />
                        {status}
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* Notes */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="job-notes" className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                    Notes
                  </label>
                  <span className="inline-flex items-center gap-1 text-xs" aria-live="polite">
                    {saveState === 'saving' && (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                      </span>
                    )}
                    {saveState === 'saved' && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3 w-3" /> Saved
                      </span>
                    )}
                    {saveState === 'error' && (
                      <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                        <AlertCircle className="h-3 w-3" /> Not saved
                      </span>
                    )}
                  </span>
                </div>
                <textarea
                  id="job-notes"
                  value={notes}
                  onChange={(event) => handleNotesChange(event.target.value)}
                  rows={4}
                  placeholder="Referral contact, recruiter name, interview dates… (saves automatically)"
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-3 text-sm leading-relaxed transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 focus:outline-none dark:border-white/10 dark:bg-white/[0.03] dark:placeholder:text-slate-500 dark:focus:bg-white/[0.05]"
                />
              </section>

              {/* Description */}
              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                  Description
                </h3>
                <div className="text-sm leading-7 whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                  {job.description?.trim()
                    ? cleanDescription(job.description)
                    : 'No description available. Open the job link for details.'}
                </div>
              </section>
            </div>

            {/* Sticky footer */}
            <div className="flex items-center justify-between gap-3 border-t border-slate-200/80 bg-white/90 px-6 py-3.5 backdrop-blur dark:border-white/[0.07] dark:bg-[#10131a]/90">
              <p className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">
                Press <kbd className="rounded border border-slate-300 px-1 font-sans dark:border-white/20">Esc</kbd> to close
              </p>
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98]"
              >
                Open job posting <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
