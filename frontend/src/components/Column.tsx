import { useDroppable } from '@dnd-kit/core'
import { useState } from 'react'
import type { Job, JobStatus } from '../types'
import { STATUS_STYLES } from '../utils'
import { JobCard } from './JobCard'

const PAGE_SIZE = 50 // cards rendered at a time; keeps big "New" columns fast

interface ColumnProps {
  status: JobStatus
  jobs: Job[]
  hiddenCount?: number
  hiddenHint?: string
  onOpenDetails: (jobId: number) => void
}

/** One Kanban column; also a drop target for drag-and-drop. */
export function Column({ status, jobs, hiddenCount = 0, hiddenHint, onOpenDetails }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const [visible, setVisible] = useState(PAGE_SIZE)
  const style = STATUS_STYLES[status]

  return (
    <section
      ref={setNodeRef}
      aria-label={`${status} column`}
      className={`flex h-full w-[85vw] max-w-sm shrink-0 flex-col rounded-xl border border-t-4 border-slate-200 bg-slate-50 transition-colors sm:w-80 xl:w-auto xl:max-w-none xl:min-w-0 xl:flex-1 dark:border-slate-800 dark:bg-slate-900 ${
        style.accent
      } ${isOver ? 'bg-sky-50 ring-2 ring-sky-400 dark:bg-sky-950/40' : ''}`}
    >
      <header className="flex items-center justify-between px-3 py-2.5">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{status}</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${style.pill}`}>{jobs.length}</span>
      </header>

      <div className="thin-scroll flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {jobs.slice(0, visible).map((job) => (
          <JobCard key={job.id} job={job} onOpenDetails={onOpenDetails} />
        ))}

        {jobs.length > visible && (
          <button
            type="button"
            onClick={() => setVisible((count) => count + PAGE_SIZE)}
            className="rounded-md py-2 text-xs font-medium text-sky-700 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-900/40"
          >
            Show {Math.min(PAGE_SIZE, jobs.length - visible)} more ({jobs.length - visible} left)
          </button>
        )}

        {jobs.length === 0 && (
          <p className="mt-6 px-4 text-center text-xs text-slate-400 dark:text-slate-500">Drop jobs here</p>
        )}

        {hiddenCount > 0 && (
          <p className="mt-auto px-2 pt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
            {hiddenCount} hidden {hiddenHint}
          </p>
        )}
      </div>
    </section>
  )
}
