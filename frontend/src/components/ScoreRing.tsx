import { scoreTone } from '../utils'

interface ScoreRingProps {
  score: number | null
  size?: 'sm' | 'lg'
}

/** Circular progress ring showing the 0-100 match score. Dashed and empty if unscored. */
export function ScoreRing({ score, size = 'sm' }: ScoreRingProps) {
  const tone = scoreTone(score)
  const dimension = size === 'lg' ? 64 : 40
  const stroke = size === 'lg' ? 5 : 3.5
  const radius = (dimension - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: dimension, height: dimension }}
      title={score === null ? tone.label : `${tone.label}: ${score}/100`}
      aria-label={score === null ? 'Not scored yet' : `Match score ${score} out of 100`}
      role="img"
    >
      <svg width={dimension} height={dimension} className="-rotate-90">
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-200 dark:stroke-white/10"
          strokeDasharray={score === null ? '3 4' : undefined}
        />
        {score !== null && (
          <circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            className={`${tone.stroke} transition-[stroke-dashoffset] duration-700 ease-out`}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
          />
        )}
      </svg>
      <span
        className={`absolute font-semibold tabular-nums ${tone.text} ${size === 'lg' ? 'text-lg' : 'text-[11px]'}`}
      >
        {score ?? '–'}
      </span>
    </div>
  )
}
