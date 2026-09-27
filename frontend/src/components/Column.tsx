import { useDroppable } from '@dnd-kit/core'
import { EyeOff, Inbox } from 'lucide-react'
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
      className={`flex w-[85vw] max-w-sm shrink-0 flex-col rounded-2xl border transition-all duration-200 sm:w-80 xl:w-auto xl:max-w-none xl:min-w-0 xl:flex-1 ${
        isOver
          ? 'border-indigo-400 bg-indigo-50/70 ring-4 ring-indigo-500/10 dark:border-indigo-400/50 dark:bg-indigo-500/[0.07]'
          : 'border-slate-200/70 bg-slate-100/60 dark:border-white/[0.06] dark:bg-white/[0.02]'
      }`}
    >
      <header className="flex items-center gap-2 px-3.5 pt-3.5 pb-2.5">
        <span className={`h-2.5 w-2.5 rounded-full ${style.dot} ring-4 ${style.ring}`} aria-hidden />
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{status}</h2>
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 tabular-nums shadow-[0_1px_2px_rgba(16,24,40,0.06)] dark:bg-white/[0.06] dark:text-slate-300">
          {jobs.length}
        </span>
      </header>

      <div className="thin-scroll flex max-h-[calc(100dvh-15rem)] min-h-40 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-2.5">
        {jobs.slice(0, visible).map((job) => (
          <JobCard key={job.id} job={job} onOpenDetails={onOpenDetails} />
        ))}

        {jobs.length > visible && (
          <button
            type="button"
            onClick={() => setVisible((count) => count + PAGE_SIZE)}
            className="rounded-xl border border-dashed border-slate-300 py-2.5 text-xs font-semibold text-indigo-600 transition-colors hover:border-indigo-300 hover:bg-white dark:border-white/10 dark:text-indigo-300 dark:hover:bg-white/[0.04]"
          >
            Show {Math.min(PAGE_SIZE, jobs.length - visible)} more · {jobs.length - visible} left
          </button>
        )}

        {jobs.length === 0 && (
          <div
            className={`flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
              isOver ? 'border-indigo-300 dark:border-indigo-400/40' : 'border-slate-200 dark:border-white/[0.06]'
            }`}
          >
            <Inbox className="h-6 w-6 text-slate-300 dark:text-slate-600" />
            <p className="text-xs text-slate-400 dark:text-slate-500">Drag jobs here</p>
          </div>
        )}

        {hiddenCount > 0 && (
          <p className="mt-auto flex items-center justify-center gap-1.5 pt-1 text-[11px] text-slate-400 dark:text-slate-500">
            <EyeOff className="h-3 w-3" /> {hiddenCount} hidden {hiddenHint}
          </p>
        )}
      </div>
    </section>
  )
}
