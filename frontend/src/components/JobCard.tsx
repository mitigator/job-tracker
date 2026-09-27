import { useDraggable } from '@dnd-kit/core'
import { Clock, ExternalLink, MapPin, NotebookPen, Sparkles } from 'lucide-react'
import type { Job } from '../types'
import { sourceLabel, timeAgo } from '../utils'
import { CompanyAvatar } from './CompanyAvatar'
import { ScoreRing } from './ScoreRing'

interface JobCardContentProps {
  job: Job
  onOpenDetails?: () => void
  dragging?: boolean
}

/** The visual card. Used both in the column and as the floating drag preview. */
export function JobCardContent({ job, onOpenDetails, dragging = false }: JobCardContentProps) {
  return (
    <article
      className={`group rounded-xl border bg-white p-3.5 text-left transition-all duration-200 dark:bg-[#141821] ${
        dragging
          ? 'rotate-2 border-indigo-300 shadow-2xl shadow-indigo-500/20 dark:border-indigo-400/50'
          : 'border-slate-200/80 shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5 dark:border-white/[0.07] dark:hover:border-white/15 dark:hover:shadow-black/30'
      }`}
    >
      {/* Company + title + score */}
      <div className="flex items-start gap-3">
        <CompanyAvatar company={job.company} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onOpenDetails?.()
            }}
            // Enter/Space on the title opens details instead of starting a keyboard drag.
            onKeyDown={(event) => event.stopPropagation()}
            className="line-clamp-2 text-left text-[13.5px] leading-snug font-semibold text-slate-900 decoration-indigo-400/60 underline-offset-2 hover:underline dark:text-slate-100"
          >
            {job.title}
          </button>
          <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">{job.company ?? 'Unknown company'}</p>
        </div>
        <ScoreRing score={job.match_score} />
      </div>

      {/* Meta */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500 dark:text-slate-400">
        {job.location && (
          <span className="inline-flex max-w-full min-w-0 items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{job.location}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo(job.date_found)}
        </span>
      </div>

      {job.match_reason && (
        <p className="mt-2.5 flex gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-600 dark:bg-white/[0.03] dark:text-slate-400">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-indigo-400" />
          <span className="line-clamp-3">{job.match_reason}</span>
        </p>
      )}

      {job.notes && (
        <p className="mt-2 flex gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:bg-amber-400/[0.07] dark:text-amber-200">
          <NotebookPen className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-2">{job.notes}</span>
        </p>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-white/[0.06]">
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
          {sourceLabel(job.source)}
        </span>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
        >
          Open job <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </article>
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
      className={`cursor-grab rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      }`}
    >
      <JobCardContent job={job} onOpenDetails={() => onOpenDetails(job.id)} />
    </div>
  )
}
