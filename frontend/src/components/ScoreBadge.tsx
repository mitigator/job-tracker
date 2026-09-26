interface ScoreBadgeProps {
  score: number | null
  size?: 'sm' | 'lg'
}

/** Coloured match score: green >= 80, lime >= 60, amber >= 40, red below, grey if unscored. */
export function ScoreBadge({ score, size = 'sm' }: ScoreBadgeProps) {
  const sizing = size === 'lg' ? 'px-3 py-1 text-base' : 'px-2 py-0.5 text-xs'

  if (score === null) {
    return (
      <span
        className={`${sizing} shrink-0 rounded-full bg-slate-200 font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300`}
        title="Not scored yet"
      >
        –
      </span>
    )
  }

  const colour =
    score >= 80
      ? 'bg-emerald-100 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300'
      : score >= 60
        ? 'bg-lime-100 text-lime-800 ring-lime-600/20 dark:bg-lime-500/15 dark:text-lime-300'
        : score >= 40
          ? 'bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300'
          : 'bg-rose-100 text-rose-800 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300'

  return (
    <span className={`${sizing} ${colour} shrink-0 rounded-full font-semibold tabular-nums ring-1 ring-inset`} title="Match score">
      {score}
    </span>
  )
}
