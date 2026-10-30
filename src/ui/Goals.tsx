import { useMemo, useState } from 'react'
import { formatMoney } from '../db/money'
import type { Goal } from '../db/schema'
import { describeTimeLeft, goalProgress, sortGoals } from '../insights/goals'
import { Icon } from './Icon'

interface Props {
  goals: Goal[]
  currency: string
  today: Date
  onNew: () => void
  onEdit: (goal: Goal) => void
  onAddMoney: (goal: Goal) => void
}

/** Goals shown before the rest are tucked behind "Show all". */
const VISIBLE = 3

const card = 'rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]'
const linkButton = 'min-h-11 px-2 font-medium underline underline-offset-2'

/** What the user is saving for, with how close each goal is. Lives on Home. */
export function GoalsSection({ goals, currency, today, onNew, onEdit, onAddMoney }: Props) {
  const [showAll, setShowAll] = useState(false)
  const sorted = useMemo(() => sortGoals(goals), [goals])
  const shown = showAll ? sorted : sorted.slice(0, VISIBLE)

  return (
    <section aria-labelledby="goals-h" className="mt-8">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 id="goals-h" className="text-lg font-semibold">
          Goals
        </h2>
        {goals.length > 0 && (
          <button type="button" onClick={onNew} className={linkButton}>
            New goal
          </button>
        )}
      </div>

      {goals.length === 0 ? (
        <div className={`${card} p-5`}>
          <p className="font-semibold">Saving for something?</p>
          <p className="mt-1 text-ink-2">Set a goal for something you want to buy or an event coming up, and see how close you are.</p>
          <button type="button" onClick={onNew} className="mt-4 min-h-12 rounded-full bg-btn px-5 font-semibold text-btn-ink">
            Set a goal
          </button>
        </div>
      ) : (
        <>
          <ul className={`${card} divide-y divide-line overflow-hidden`}>
            {shown.map((g) => (
              <GoalRow key={g.id} goal={g} currency={currency} today={today} onEdit={onEdit} onAddMoney={onAddMoney} />
            ))}
          </ul>
          {sorted.length > VISIBLE && (
            <button type="button" onClick={() => setShowAll((s) => !s)} className={`${linkButton} mt-1`}>
              {showAll ? 'Show fewer' : `Show all ${sorted.length}`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function GoalRow({ goal, currency, today, onEdit, onAddMoney }: Omit<Props, 'goals' | 'onNew'> & { goal: Goal }) {
  const p = goalProgress(goal, today)
  const percent = Math.round(p.fraction * 100)
  const saved = formatMoney(goal.savedMinor, currency)
  const target = formatMoney(goal.targetMinor, currency)
  const overdue = p.daysLeft !== null && p.daysLeft < 0
  const timeText = describeTimeLeft(p.daysLeft)

  return (
    <li className="p-4">
      <button type="button" onClick={() => onEdit(goal)} aria-label={`Edit goal ${goal.name}`} className="block w-full text-left">
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate font-semibold">{goal.name}</span>
          <span className="shrink-0 tabular-nums">
            <span className="font-semibold">{saved}</span>
            <span className="text-ink-2"> of {target}</span>
          </span>
        </span>
        <span
          role="progressbar"
          aria-label={`${goal.name} saved`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${saved} of ${target} saved, ${percent}%`}
          className="mt-3 block h-2.5 overflow-hidden rounded-full"
          style={{ background: 'color-mix(in oklab, var(--s1) 16%, var(--surface))' }}
        >
          <span
            className="block h-full rounded-full transition-[width] duration-500"
            style={{ width: `${p.fraction * 100}%`, background: p.reached ? 'var(--good-text)' : 'var(--s1)' }}
          />
        </span>
      </button>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0 text-[0.9375rem] text-ink-2">
          {p.reached ? (
            <p className="flex items-center gap-1.5 font-medium text-good">
              <Icon name="check" size={18} />
              Goal reached
            </p>
          ) : (
            <>
              <p className={`flex items-center gap-1.5 ${overdue ? 'text-critical' : ''}`}>
                {overdue && <Icon name="warn" size={18} />}
                {timeText || `${formatMoney(p.remainingMinor, currency)} to go`}
              </p>
              {p.pace && (
                <p className="mt-0.5">
                  Set aside {formatMoney(p.pace.amountMinor, currency)} a {p.pace.per}
                </p>
              )}
            </>
          )}
        </div>
        {!p.reached && (
          <button
            type="button"
            onClick={() => onAddMoney(goal)}
            aria-label={`Add money to ${goal.name}`}
            className="min-h-11 shrink-0 rounded-full bg-surface-2 px-4 font-medium"
          >
            Add money
          </button>
        )}
      </div>
    </li>
  )
}
