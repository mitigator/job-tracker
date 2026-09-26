import { useDraggable } from '@dnd-kit/core'
import type { Job } from '../types'
import { sourceLabel, timeAgo } from '../utils'
import { ScoreBadge } from './ScoreBadge'

interface JobCardContentProps {
  job: Job
  onOpenDetails?: () => void
  dragging?: boolean
}

/** The visual card. Used both in the column and as the floating drag preview. */
export function JobCardContent({ job, onOpenDetails, dragging = false }: JobCardContentProps) {
  return (
    <div
      className={`rounded-lg border bg-white p-3 text-left shadow-sm transition-shadow dark:bg-slate-800 ${
        dragging
          ? 'rotate-1 border-sky-400 shadow-xl dark:border-sky-500'
          : 'border-slate-200 hover:shadow-md dark:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onOpenDetails?.()
          }}
          // Enter/Space on the title opens details instead of starting a keyboard drag.
          onKeyDown={(event) => event.stopPropagation()}
          className="text-left text-sm leading-snug font-semibold text-slate-900 hover:text-sky-700 hover:underline dark:text-slate-100 dark:hover:text-sky-300"
        >
          {job.title}
        </button>
        <ScoreBadge score={job.match_score} />
      </div>

      <p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-300">{job.company ?? 'Unknown company'}</span>
        {job.location ? ` · ${job.location}` : ''}
      </p>

      {job.match_reason && (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{job.match_reason}</p>
      )}

      {job.notes && (
        <p className="mt-2 line-clamp-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          📝 {job.notes}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            {sourceLabel(job.source)}
          </span>
          <span className="truncate">{timeAgo(job.date_found)}</span>
        </div>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="shrink-0 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950"
        >
          Open job ↗
        </a>
      </div>
    </div>
  )
}

interface JobCardProps {
  job: Job
  onOpenDetails: (jobId: number) => void
}

/** Draggable wrapper. While dragging, the original stays faded in place. */
export function JobCard({ job, onOpenDetails }: JobCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
    data: { status: job.status },
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpenDetails(job.id)}
      aria-label={`${job.title} at ${job.company ?? 'unknown company'}. Press space to drag.`}
      className={`cursor-grab rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sky-500 active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <JobCardContent job={job} onOpenDetails={() => onOpenDetails(job.id)} />
    </div>
  )
}
