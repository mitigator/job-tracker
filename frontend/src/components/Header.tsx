import { BriefcaseBusiness, Loader2, Moon, RefreshCw, Sparkles, Sun } from 'lucide-react'
import type { Theme } from '../hooks'
import type { Stats } from '../types'
import { Switch } from './Switch'

interface HeaderProps {
  stats: Stats | null
  running: boolean
  quickRun: boolean
  onQuickRunChange: (value: boolean) => void
  onFetch: () => void
  onRefresh: () => void
  theme: Theme
  onToggleTheme: () => void
}

const iconButton =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'

/** Sticky, translucent app header: brand, "Fetch new jobs", refresh and theme toggle. */
export function Header({ stats, running, quickRun, onQuickRunChange, onFetch, onRefresh, theme, onToggleTheme }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b0d12]/75">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30">
            <BriefcaseBusiness className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <h1 className="text-base font-bold tracking-tight">Job Tracker</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {stats
                ? `${stats.scores.total} jobs tracked · ${stats.scores.unscored} awaiting score`
                : 'Your job hunt, organised'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Switch
            checked={quickRun}
            onChange={onQuickRunChange}
            disabled={running}
            label="Quick"
            title="Quick run: 1 search term, 1 location, 10 results per site"
          />

          <button
            type="button"
            onClick={onFetch}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:from-indigo-500 hover:to-violet-500 hover:shadow-indigo-500/40 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 dark:focus-visible:ring-offset-[#0b0d12]"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {running ? 'Fetching…' : 'Fetch new jobs'}
          </button>

          <div className="mx-1 hidden h-6 w-px bg-slate-200 sm:block dark:bg-white/10" aria-hidden />

          <button type="button" onClick={onRefresh} className={iconButton} title="Reload jobs" aria-label="Reload jobs">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className={iconButton}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  )
}
