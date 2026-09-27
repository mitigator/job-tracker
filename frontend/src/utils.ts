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

/**
 * City quick-filters. Each city matches all the spellings job sites use
 * (e.g. Gurgaon vs Gurugram, or Indeed's state-only "Haryana, India").
 * The API treats "|" as OR, so several chips can be combined.
 */
export interface LocationPreset {
  key: string
  label: string
  aliases: string[]
}

export const LOCATION_PRESETS: LocationPreset[] = [
  { key: 'bengaluru', label: 'Bengaluru', aliases: ['bengaluru', 'bangalore', 'karnataka'] },
  { key: 'remote', label: 'Remote', aliases: ['remote'] },
  { key: 'gurgaon', label: 'Gurgaon', aliases: ['gurgaon', 'gurugram', 'haryana'] },
  { key: 'mumbai', label: 'Mumbai', aliases: ['mumbai', 'thane'] },
  { key: 'noida', label: 'Noida', aliases: ['noida', 'uttar pradesh'] },
  { key: 'hyderabad', label: 'Hyderabad', aliases: ['hyderabad', 'secunderabad', 'telangana'] },
  { key: 'pune', label: 'Pune', aliases: ['pune', 'pimpri'] },
]

/** Build the API's location query from selected chips + free text ("a|b|c"). */
export function buildLocationQuery(presetKeys: string[], custom: string): string {
  const parts = LOCATION_PRESETS.filter((preset) => presetKeys.includes(preset.key)).flatMap((preset) => preset.aliases)
  if (custom.trim()) parts.push(custom.trim())
  return parts.join('|')
}

/** Per-status colours: column dot, tile icon background, active pill. */
export const STATUS_STYLES: Record<JobStatus, { dot: string; soft: string; text: string; ring: string }> = {
  New: {
    dot: 'bg-sky-500',
    soft: 'bg-sky-50 dark:bg-sky-500/10',
    text: 'text-sky-700 dark:text-sky-300',
    ring: 'ring-sky-500/30',
  },
  Applied: {
    dot: 'bg-violet-500',
    soft: 'bg-violet-50 dark:bg-violet-500/10',
    text: 'text-violet-700 dark:text-violet-300',
    ring: 'ring-violet-500/30',
  },
  'In progress': {
    dot: 'bg-amber-500',
    soft: 'bg-amber-50 dark:bg-amber-500/10',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-500/30',
  },
  'Interview scheduled': {
    dot: 'bg-emerald-500',
    soft: 'bg-emerald-50 dark:bg-emerald-500/10',
    text: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-500/30',
  },
  Rejected: {
    dot: 'bg-rose-500',
    soft: 'bg-rose-50 dark:bg-rose-500/10',
    text: 'text-rose-700 dark:text-rose-300',
    ring: 'ring-rose-500/30',
  },
}

/** Score -> colour family used by the score ring. */
export function scoreTone(score: number | null): { stroke: string; text: string; label: string } {
  if (score === null) return { stroke: 'stroke-slate-300 dark:stroke-slate-600', text: 'text-slate-400', label: 'Not scored yet' }
  if (score >= 80) return { stroke: 'stroke-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', label: 'Great match' }
  if (score >= 60) return { stroke: 'stroke-lime-500', text: 'text-lime-600 dark:text-lime-400', label: 'Good match' }
  if (score >= 40) return { stroke: 'stroke-amber-500', text: 'text-amber-600 dark:text-amber-400', label: 'Partial match' }
  return { stroke: 'stroke-rose-500', text: 'text-rose-600 dark:text-rose-400', label: 'Weak match' }
}

// Full class strings (not built dynamically) so Tailwind includes them in the CSS.
const AVATAR_COLOURS = [
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
]

/** Same company -> same colour, every time. */
export function avatarColour(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length]
}

/** "Hevo Data" -> "HD", "CRED" -> "CR", "" -> "?" */
export function initials(name: string | null): string {
  const words = (name ?? '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
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
