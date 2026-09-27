import { CalendarCheck2, CircleDashed, Hourglass, type LucideIcon, Send, Sparkles, XCircle } from 'lucide-react'
import type { JobStatus, Stats } from '../types'
import { STATUS_STYLES } from '../utils'

interface StatTilesProps {
  stats: Stats | null
}

const STATUS_TILES: { status: JobStatus; label: string; icon: LucideIcon }[] = [
  { status: 'New', label: 'New', icon: CircleDashed },
  { status: 'Applied', label: 'Applied', icon: Send },
  { status: 'In progress', label: 'In progress', icon: Hourglass },
  { status: 'Interview scheduled', label: 'Interviews', icon: CalendarCheck2 },
  { status: 'Rejected', label: 'Rejected', icon: XCircle },
]

const tileBase =
  'flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-white/[0.03]'

/** A row of summary tiles: top matches, then the count for every status. */
export function StatTiles({ stats }: StatTilesProps) {
  return (
    <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {/* Highlight tile */}
      <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl bg-linear-to-br from-indigo-600 to-violet-600 p-3.5 text-white shadow-lg shadow-indigo-500/20">
        <div className="pointer-events-none absolute -top-6 -right-6 h-20 w-20 rounded-full bg-white/10" aria-hidden />
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-2xl leading-none font-bold tabular-nums">{stats?.scores.above_threshold ?? '–'}</p>
          <p className="mt-1 text-xs leading-tight text-indigo-100">
            Top matches
            {stats && <span className="ml-1 whitespace-nowrap opacity-75">≥ {stats.scores.threshold}</span>}
          </p>
        </div>
      </div>

      {STATUS_TILES.map(({ status, label, icon: Icon }) => {
        const style = STATUS_STYLES[status]
        return (
          <div key={status} className={tileBase}>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.soft} ${style.text}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-2xl leading-none font-bold tabular-nums">{stats?.by_status[status] ?? '–'}</p>
              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{label}</p>
            </div>
          </div>
        )
      })}
    </section>
  )
}
