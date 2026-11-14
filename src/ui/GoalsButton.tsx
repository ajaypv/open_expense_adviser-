import { useEffect, useState } from 'react'
import type { Goal } from '../db/schema'
import { goalsTotals } from '../insights/goals'
import { Icon } from './Icon'

// The glow is there to say "goals live here". Once it has played it has done its job, so it plays once
// each time the app is opened, not every time the person comes back to Home.
let glowed = false

/** For tests: forget that the glow has played, as if the app had just been opened. */
export function resetGoalGlow() {
  glowed = false
}

/**
 * Goals in the bottom bar, beside Home, Activity and Insights, drawn as they are: an icon (a flag) in the same pill, the same size, and the word
 * under it. It opens the goals page, and is never marked as the current place. How many goals there are and how much is saved is said in words
 * for a screen reader, not drawn on the icon.
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
      <span aria-hidden="true" className="flex h-7 w-12 items-center justify-center rounded-full">
        <Icon name="flag" size={21} />
      </span>
      <span aria-hidden="true" className="short:sr-only">
        Goals
      </span>
    </button>
  )
}
