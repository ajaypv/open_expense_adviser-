import { useEffect, useState } from 'react'
import type { Goal } from '../db/schema'
import { goalsTotals } from '../insights/goals'
import { Icon } from './Icon'

const RADIUS = 13.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

// The glow is there to say "goals live here". Once it has played it has done its job, so it plays once
// each time the app is opened, not every time the person comes back to Home.
let glowed = false

/** For tests: forget that the glow has played, as if the app had just been opened. */
export function resetGoalGlow() {
  glowed = false
}

/**
 * The goals button in Home's header: a flag, the word "Goals", and once there is a goal a ring that
 * fills as the money is saved, with the percentage beside it. What it shows is also said in words.
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
      className={`${glow ? 'goal-glow ' : ''}flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-surface py-1 pl-1.5 pr-4 font-medium shadow-[0_0_0_1px_var(--ring)]`}
    >
      <span aria-hidden="true" className="relative flex size-8 items-center justify-center">
        {totals.count > 0 && (
          <svg width="32" height="32" viewBox="0 0 32 32" className="absolute inset-0 -rotate-90" focusable="false">
            <circle cx="16" cy="16" r={RADIUS} fill="none" strokeWidth="2.5" stroke="color-mix(in oklab, var(--s1) 22%, transparent)" />
            <circle
              cx="16"
              cy="16"
              r={RADIUS}
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              stroke={totals.reachedCount === totals.count ? 'var(--good-text)' : 'var(--s1)'}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(1, percent / 100))}
              className="transition-[stroke-dashoffset] duration-500"
            />
          </svg>
        )}
        <Icon name="flag" size={16} />
      </span>
      <span>Goals</span>
    </button>
  )
}
