import { useEffect, useState } from 'react'
import type { Goal } from '../db/schema'
import { goalsTotals } from '../insights/goals'
import { Icon } from './Icon'

const RADIUS = 11.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

// The glow is there to say "goals live here". Once it has played it has done its job, so it plays once
// each time the app is opened, not every time the person comes back to Home.
let glowed = false

/** For tests: forget that the glow has played, as if the app had just been opened. */
export function resetGoalGlow() {
  glowed = false
}

/**
 * Goals in the bottom bar, beside Home, Activity and Insights: a flag, the word "Goals", and once there is a goal a ring round the flag
 * that fills as the money is saved. It opens the goals page. What it shows is also said in words.
 */
export function GoalsButton({ goals, onClick }: { goals: Goal[]; onClick: () => void }) {
  // Read before the first paint, and marked as played only after it, so a redraw can't restart it.
  const [glow] = useState(() => !glowed)
  useEffect(() => {
    glowed = true
  }, [])

  const totals = goalsTotals(goals)
  const percent = totals.targetMinor > 0 ? Math.round((totals.savedMinor / totals.targetMinor) * 100) : 0
  const label =
    totals.count === 0
      ? 'Goals. None yet'
      : `Goals. ${totals.count} ${totals.count === 1 ? 'goal' : 'goals'}, ${percent}% saved${totals.reachedCount > 0 ? `, ${totals.reachedCount} reached` : ''}`

  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={label}
      className={`${glow ? 'goal-glow ' : ''}flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-3xl text-xs font-medium text-muted short:min-h-11`}
    >
      <span aria-hidden="true" className="relative flex h-7 w-12 items-center justify-center rounded-full">
        <span className="relative flex size-7 items-center justify-center">
          {totals.count > 0 && (
            <svg width="28" height="28" viewBox="0 0 28 28" className="absolute inset-0 -rotate-90" focusable="false">
              <circle cx="14" cy="14" r={RADIUS} fill="none" strokeWidth="2.25" stroke="color-mix(in oklab, var(--accent) 22%, transparent)" />
              <circle
                cx="14"
                cy="14"
                r={RADIUS}
                fill="none"
                strokeWidth="2.25"
                strokeLinecap="round"
                stroke={totals.reachedCount === totals.count ? 'var(--good-text)' : 'var(--accent)'}
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(1, percent / 100))}
                className="transition-[stroke-dashoffset] duration-500"
              />
            </svg>
          )}
          <Icon name="flag" size={totals.count > 0 ? 15 : 21} />
        </span>
      </span>
      <span aria-hidden="true" className="short:sr-only">
        Goals
      </span>
    </button>
  )
}
