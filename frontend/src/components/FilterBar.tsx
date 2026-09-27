import { Check, MapPin, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react'
import type { Filters } from '../types'
import { LOCATION_PRESETS, sourceLabel } from '../utils'
import { Switch } from './Switch'

interface FilterBarProps {
  filters: Filters
  sources: string[]
  defaultMinScore: number
  shownCount: number
  onChange: (filters: Filters) => void
}

const fieldClass =
  'h-10 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/15 focus:outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400/60'

/** Search, source, minimum score, unscored toggle, and city chips. */
export function FilterBar({ filters, sources, defaultMinScore, shownCount, onChange }: FilterBarProps) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value })

  const toggleCity = (key: string) =>
    set('locations', filters.locations.includes(key) ? filters.locations.filter((k) => k !== key) : [...filters.locations, key])

  const isDefault =
    !filters.source &&
    !filters.location &&
    !filters.search &&
    filters.locations.length === 0 &&
    filters.minScore === defaultMinScore &&
    filters.includeUnscored

  const reset = () =>
    onChange({ source: '', location: '', locations: [], search: '', minScore: defaultMinScore, includeUnscored: true })

  const chip = (active: boolean) =>
    `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
      active
        ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm shadow-indigo-500/30 dark:border-indigo-500 dark:bg-indigo-500'
        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white'
    }`

  return (
    <section
      aria-label="Filters"
      className="rounded-2xl border border-slate-200/80 bg-white/70 p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] backdrop-blur sm:p-4 dark:border-white/[0.07] dark:bg-white/[0.02]"
    >
      {/* Row 1: search + source + score + unscored */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={filters.search}
            onChange={(event) => set('search', event.target.value)}
            placeholder="Search title, company, skills…"
            aria-label="Search"
            className={`${fieldClass} w-full pr-3 pl-9`}
          />
        </div>

        <select
          value={filters.source}
          onChange={(event) => set('source', event.target.value)}
          aria-label="Source"
          className={`${fieldClass} px-3 pr-8`}
        >
          <option value="">All sources</option>
          {sources.map((source) => (
            <option key={source} value={source}>
              {sourceLabel(source)}
            </option>
          ))}
        </select>

        <label className={`${fieldClass} flex items-center gap-3 px-3`}>
          <SlidersHorizontal className="h-4 w-4 text-slate-400" aria-hidden />
          <span className="text-slate-500 dark:text-slate-400">Min score</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={filters.minScore}
            onChange={(event) => set('minScore', Number(event.target.value))}
            className="w-24 accent-indigo-600 sm:w-28"
            aria-label="Minimum match score for New jobs"
          />
          <span className="w-7 text-right font-semibold text-slate-900 tabular-nums dark:text-white">{filters.minScore}</span>
        </label>

        <Switch checked={filters.includeUnscored} onChange={(value) => set('includeUnscored', value)} label="Show unscored" />

        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">{shownCount}</span> shown · score filter applies to{' '}
            <em>New</em>
          </span>
          {!isDefault && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Row 2: location chips (scrolls sideways on phones) */}
      <div className="thin-scroll -mx-1 mt-3 flex items-center gap-2 overflow-x-auto px-1 pb-1">
        <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <button
          type="button"
          onClick={() => onChange({ ...filters, locations: [], location: '' })}
          className={chip(filters.locations.length === 0 && !filters.location)}
          aria-pressed={filters.locations.length === 0 && !filters.location}
        >
          All locations
        </button>
        {LOCATION_PRESETS.map((preset) => {
          const active = filters.locations.includes(preset.key)
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => toggleCity(preset.key)}
              className={chip(active)}
              aria-pressed={active}
              title={`Matches: ${preset.aliases.join(', ')}`}
            >
              {active && <Check className="h-3.5 w-3.5" />}
              {preset.label}
            </button>
          )
        })}

        <div className="relative shrink-0">
          <input
            type="text"
            value={filters.location}
            onChange={(event) => set('location', event.target.value)}
            placeholder="Other city…"
            aria-label="Other location"
            className={`h-8 w-36 rounded-full border px-3 text-sm transition-colors focus:ring-4 focus:ring-indigo-500/15 focus:outline-none ${
              filters.location
                ? 'border-indigo-400 bg-indigo-50 pr-7 text-indigo-900 dark:border-indigo-400/60 dark:bg-indigo-500/10 dark:text-indigo-100'
                : 'border-dashed border-slate-300 bg-transparent placeholder:text-slate-400 dark:border-white/15 dark:placeholder:text-slate-500'
            }`}
          />
          {filters.location && (
            <button
              type="button"
              onClick={() => set('location', '')}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-indigo-500 hover:text-indigo-700 dark:text-indigo-300"
              aria-label="Clear other location"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
