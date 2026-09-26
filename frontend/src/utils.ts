import type { JobStatus } from './types'

/** "3h ago", "2d ago" from an ISO timestamp like "2026-09-26T10:15:00". */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

/** Friendly source names for chips and dropdowns. */
export function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    linkedin: 'LinkedIn',
    indeed: 'Indeed',
    naukri: 'Naukri',
    google: 'Google Jobs',
    greenhouse: 'Greenhouse',
    lever: 'Lever',
  }
  return labels[source] ?? source
}

/** Accent colour per Kanban column (top border + count pill). */
export const STATUS_STYLES: Record<JobStatus, { accent: string; pill: string }> = {
  New: {
    accent: 'border-t-sky-500',
    pill: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  },
  Applied: {
    accent: 'border-t-violet-500',
    pill: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  },
  'In progress': {
    accent: 'border-t-amber-500',
    pill: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  'Interview scheduled': {
    accent: 'border-t-emerald-500',
    pill: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  Rejected: {
    accent: 'border-t-rose-500',
    pill: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  },
}

/**
 * JobSpy descriptions are Markdown ("1\-3 years", "**Skills:**", "* item").
 * Turn them into clean plain text for display (no HTML rendering = no XSS risk).
 */
export function cleanDescription(text: string): string {
  return text
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1') // "1\-3" -> "1-3"
    .replace(/\*\*(.+?)\*\*/g, '$1') // **bold** -> bold
    .replace(/(\S)(Responsibilities|Requirements|Qualifications|About|Skills)(:)/g, '$1\n\n$2$3') // run-on headings
    .replace(/^\s*[*-]\s+/gm, '• ') // bullets
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
