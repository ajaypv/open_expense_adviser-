import { formatMoney } from '../db/money'
import type { Goal } from '../db/schema'
import { describeDue, goalProgress } from '../insights/goals'
import { Icon } from './Icon'

interface RowProps {
  goal: Goal
  currency: string
  today: Date
  onEdit: (goal: Goal) => void
  onAddMoney: (goal: Goal) => void
}

const card = 'rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]'

/** Goals in one card, in the order given. Each row opens the goal, or sets money aside for it. */
export function GoalList({ goals, currency, today, onEdit, onAddMoney }: Omit<RowProps, 'goal'> & { goals: Goal[] }) {
  return (
    <ul className={`${card} divide-y divide-line overflow-hidden`}>
      {goals.map((g) => (
        <GoalRow key={g.id} goal={g} currency={currency} today={today} onEdit={onEdit} onAddMoney={onAddMoney} />
      ))}
    </ul>
  )
}

function GoalRow({ goal, currency, today, onEdit, onAddMoney }: RowProps) {
  const p = goalProgress(goal, today)
  const percent = Math.round(p.fraction * 100)
  const saved = formatMoney(goal.savedMinor, currency)
  const target = formatMoney(goal.targetMinor, currency)
  const overdue = p.daysLeft !== null && p.daysLeft < 0
  const due = describeDue(goal, today)

  return (
    <li className="p-4">
      <button type="button" onClick={() => onEdit(goal)} aria-label={`Edit goal ${goal.name}`} className="block w-full text-left">
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-lg font-semibold">{goal.name}</span>
          <span className="shrink-0 text-ink-2">
            <Icon name="chevRight" size={18} />
          </span>
        </span>
        <span className="mt-1 flex items-baseline justify-between gap-3 tabular-nums">
          <span>
            <span className="font-semibold">{saved}</span>
            <span className="text-ink-2"> saved of {target}</span>
          </span>
          <span className="shrink-0 font-semibold">{percent}%</span>
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

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-0.5 text-[0.9375rem] text-ink-2">
          {p.reached ? (
            <p className="flex items-center gap-1.5 font-medium text-good">
              <Icon name="check" size={18} />
              Goal reached
            </p>
          ) : (
            <>
              <p className="font-medium text-ink">{`${formatMoney(p.remainingMinor, currency)} to go`}</p>
              {due && (
                <p className={`flex items-center gap-1.5 ${overdue ? 'text-critical' : ''}`}>
                  {overdue && <Icon name="warn" size={18} />}
                  {due}
                </p>
              )}
              {p.pace && <p>{`Save ${formatMoney(p.pace.amountMinor, currency)} a ${p.pace.per} to get there on time`}</p>}
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
