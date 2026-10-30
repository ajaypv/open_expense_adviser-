import { useMemo } from 'react'
import { formatMoney } from '../db/money'
import type { Goal } from '../db/schema'
import { goalsTotals, sortGoals } from '../insights/goals'
import { Dialog } from './Dialog'
import { GoalList } from './Goals'
import { Icon } from './Icon'

interface Props {
  open: boolean
  onClose: () => void
  goals: Goal[]
  currency: string
  today: Date
  onNew: () => void
  onEdit: (goal: Goal) => void
  onAddMoney: (goal: Goal) => void
}

const card = 'rounded-3xl bg-surface-2/60'

/** Everything the person is saving for, in a sheet opened from the goals button on Home. */
export function GoalsOverview({ open, onClose, goals, currency, today, onNew, onEdit, onAddMoney }: Props) {
  const sorted = useMemo(() => sortGoals(goals), [goals])
  const active = sorted.filter((g) => g.savedMinor < g.targetMinor)
  const reached = sorted.filter((g) => g.savedMinor >= g.targetMinor)
  const totals = goalsTotals(goals)
  const percent = totals.targetMinor > 0 ? Math.round((totals.savedMinor / totals.targetMinor) * 100) : 0
  const leftMinor = totals.targetMinor - totals.savedMinor

  return (
    <Dialog open={open} onClose={onClose} labelledBy="goals-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="goals-title" className="min-w-0 text-2xl font-semibold tracking-tight">
          Goals
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {goals.length > 0 && (
            <button type="button" onClick={onNew} className="min-h-11 rounded-full bg-btn px-4 font-semibold text-btn-ink">
              New goal
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <Icon name="close" />
          </button>
        </div>
      </div>
      <p className="mt-1 text-ink-2">Money you add to a goal is a note to yourself. It does not change your balance or spending.</p>

      {goals.length === 0 ? (
        <div className={`${card} mt-4 p-5`}>
          <p className="text-lg font-semibold">Saving for something?</p>
          <p className="mt-1 text-ink-2">Set a goal for something you want to buy or an event coming up, and see how close you are.</p>
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-ink-2 marker:font-medium marker:text-ink">
            <li>Name it and say what it costs.</li>
            <li>Pick a date if there is one, and see how much to save each week or month.</li>
            <li>Add money each time you set some aside.</li>
          </ol>
          <button type="button" onClick={onNew} className="mt-4 min-h-12 rounded-full bg-btn px-5 font-semibold text-btn-ink">
            Set a goal
          </button>
        </div>
      ) : (
        <>
          <section aria-label="Total saved" className={`${card} mt-4 p-5`}>
            <p className="tabular-nums">
              <span className="text-[clamp(2rem,10vw,2.5rem)] font-semibold leading-none tracking-tight">{formatMoney(totals.savedMinor, currency)}</span>
              <span className="ml-2 text-ink-2"> saved of {formatMoney(totals.targetMinor, currency)}</span>
            </p>
            <span
              role="progressbar"
              aria-label="All goals saved"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={`${formatMoney(totals.savedMinor, currency)} of ${formatMoney(totals.targetMinor, currency)} saved, ${percent}%`}
              className="mt-4 block h-2.5 overflow-hidden rounded-full"
              style={{ background: 'color-mix(in oklab, var(--s1) 16%, var(--surface))' }}
            >
              <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, percent)}%`, background: 'var(--s1)' }} />
            </span>
            <p className="mt-3 flex items-baseline justify-between gap-3 text-[0.9375rem] tabular-nums">
              <span className="text-ink-2">{`${percent}% saved`}</span>
              <span className="font-medium">{leftMinor > 0 ? `${formatMoney(leftMinor, currency)} to go` : 'All saved'}</span>
            </p>
            <p className="mt-1 text-[0.9375rem] text-ink-2">
              {totals.count} {totals.count === 1 ? 'goal' : 'goals'}
              {totals.reachedCount > 0 && `, ${totals.reachedCount} reached`}
            </p>
          </section>

          {active.length > 0 && (
            <section aria-labelledby="goals-active-h" className="mt-6">
              <h3 id="goals-active-h" className="mb-3 px-1 text-lg font-semibold">
                In progress
              </h3>
              <GoalList goals={active} currency={currency} today={today} onEdit={onEdit} onAddMoney={onAddMoney} />
            </section>
          )}

          {reached.length > 0 && (
            <section aria-labelledby="goals-reached-h" className="mt-6">
              <h3 id="goals-reached-h" className="mb-3 px-1 text-lg font-semibold">
                Reached
              </h3>
              <GoalList goals={reached} currency={currency} today={today} onEdit={onEdit} onAddMoney={onAddMoney} />
            </section>
          )}
        </>
      )}
    </Dialog>
  )
}
