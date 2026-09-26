import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage, fetchJob, updateJob } from '../api'
import { type Job, type JobDetail, type JobStatus, STATUSES } from '../types'
import { cleanDescription, sourceLabel, timeAgo } from '../utils'
import { ScoreBadge } from './ScoreBadge'

interface JobModalProps {
  jobId: number
  onClose: () => void
  onJobUpdated: (job: Job) => void
  onError: (message: string) => void
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** Full job details with status picker and auto-saving notes. */
export function JobModal({ jobId, onClose, onJobUpdated, onError }: JobModalProps) {
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

  // Stop a pending timer if the modal unmounts.
  useEffect(() => () => window.clearTimeout(saveTimer.current), [])

  // Save any pending edit immediately, then close.
  const close = useCallback(() => {
    window.clearTimeout(saveTimer.current)
    if (job && notes !== savedNotes.current) void saveNotes(notes)
    onClose()
  }, [job, notes, saveNotes, onClose])

  // Esc closes the modal.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const changeStatus = async (status: JobStatus) => {
    if (!job) return
    try {
      const updated = await updateJob(job.id, { status })
      setJob(updated)
      onJobUpdated(updated)
    } catch (error) {
      onError(`Couldn't change status: ${errorMessage(error)}`)
    }
  }

  const saveLabel: Record<SaveState, string> = {
    idle: '',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Not saved',
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-modal-title"
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-slate-900"
      >
        {!job && !loadError && <p className="p-8 text-center text-sm text-slate-500">Loading…</p>}
        {loadError && (
          <div className="p-8 text-center text-sm">
            <p className="text-rose-600 dark:text-rose-400">{loadError}</p>
            <button type="button" onClick={onClose} className="mt-4 text-sky-700 hover:underline dark:text-sky-300">
              Close
            </button>
          </div>
        )}

        {job && (
          <>
            {/* Header */}
            <div className="flex items-start gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
              <ScoreBadge score={job.match_score} size="lg" />
              <div className="min-w-0 flex-1">
                <h2 id="job-modal-title" className="text-lg leading-snug font-bold">
                  {job.title}
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{job.company ?? 'Unknown company'}</span>
                  {job.location ? ` · ${job.location}` : ''} · {sourceLabel(job.source)} · found {timeAgo(job.date_found)}
                </p>
                {job.match_reason && <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{job.match_reason}</p>}
              </div>
              <button type="button" onClick={close} className="text-xl leading-none opacity-60 hover:opacity-100" aria-label="Close">
                ✕
              </button>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
              <label className="flex items-center gap-2 text-sm">
                Status
                <select
                  value={job.status}
                  onChange={(event) => void changeStatus(event.target.value as JobStatus)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  {STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
              >
                Open job ↗
              </a>
            </div>

            {/* Body: notes + description */}
            <div className="thin-scroll flex-1 overflow-y-auto p-5">
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="job-notes" className="text-sm font-semibold">
                  Notes
                </label>
                <span
                  className={`text-xs ${saveState === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}
                  aria-live="polite"
                >
                  {saveLabel[saveState]}
                </span>
              </div>
              <textarea
                id="job-notes"
                value={notes}
                onChange={(event) => handleNotesChange(event.target.value)}
                rows={4}
                placeholder="Referral contact, recruiter name, interview dates… (saves automatically)"
                className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
              />

              <h3 className="mt-5 mb-2 text-sm font-semibold">Description</h3>
              <div className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                {job.description?.trim()
                  ? cleanDescription(job.description)
                  : 'No description available. Open the job link for details.'}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
