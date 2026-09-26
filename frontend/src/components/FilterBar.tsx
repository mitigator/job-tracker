import type { Filters } from '../types'
import { sourceLabel } from '../utils'

interface FilterBarProps {
  filters: Filters
  sources: string[]
  defaultMinScore: number
  shownCount: number
  onChange: (filters: Filters) => void
}

const inputClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:placeholder:text-slate-500'

/** Source, minimum score, location and free-text search. */
export function FilterBar({ filters, sources, defaultMinScore, shownCount, onChange }: FilterBarProps) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value })

  const isDefault =
    !filters.source &&
    !filters.location &&
    !filters.search &&
    filters.minScore === defaultMinScore &&
    filters.includeUnscored

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <input
        type="search"
        value={filters.search}
        onChange={(event) => set('search', event.target.value)}
        placeholder="Search title, company, description…"
        aria-label="Search"
        className={`${inputClass} w-full sm:w-72`}
      />

      <input
        type="text"
        value={filters.location}
        onChange={(event) => set('location', event.target.value)}
        placeholder="Location (e.g. Bengaluru, Remote)"
        aria-label="Location"
        className={`${inputClass} w-full sm:w-56`}
      />

      <select
        value={filters.source}
        onChange={(event) => set('source', event.target.value)}
        aria-label="Source"
        className={inputClass}
      >
        <option value="">All sources</option>
        {sources.map((source) => (
          <option key={source} value={source}>
            {sourceLabel(source)}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <span className="whitespace-nowrap">Min score</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={filters.minScore}
          onChange={(event) => set('minScore', Number(event.target.value))}
          className="w-28 accent-sky-600"
          aria-label="Minimum match score for New jobs"
        />
        <span className="w-7 text-right font-semibold tabular-nums">{filters.minScore}</span>
      </label>

      <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={filters.includeUnscored}
          onChange={(event) => set('includeUnscored', event.target.checked)}
          className="accent-sky-600"
        />
        Show unscored
      </label>

      {!isDefault && (
        <button
          type="button"
          onClick={() =>
            onChange({ source: '', location: '', search: '', minScore: defaultMinScore, includeUnscored: true })
          }
          className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
        >
          Reset filters
        </button>
      )}

      <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
        {shownCount} shown · score filter applies to <em>New</em> only
      </span>
    </div>
  )
}
