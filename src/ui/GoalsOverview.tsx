import { useMemo } from 'react'
import { formatMoney } from '../db/money'
import type { Goal } from '../db/schema'
import { goalsTotals, sortGoals } from '../insights/goals'
import { Dialog } from './Dialog'
import { Figures } from './Figures'
import { GoalList, GoalRing } from './Goals'
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

const card = 'rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]'

/** A soft tile with a round icon, a small label and one bold figure, as the other pages set a pair of facts side by side. */
function Tile({ icon, label, children }: { icon: 'flag' | 'check' | 'bars'; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-ink-2">{label}</span>
        <span className="block text-[1.0625rem] leading-tight">{children}</span>
      </span>
    </div>
  )
}

/**
 * Everything the person is saving for, on a page of its own, opened from Goals in the bottom bar or from Home. At the top the whole of it in one
 * card: a ring that fills as the money is saved with the percentage in it, the amount saved large beside it, and under it what is left and how
 * many goals there are. Then each goal, nearest date first, as a row with its own small ring, what is saved, what is left, when it is due and what
 * to set aside to make it; and the ones that are reached last. With none, it says how a goal goes and offers to set one.
 */
export function GoalsOverview({ open, onClose, goals, currency, today, onNew, onEdit, onAddMoney }: Props) {
  const sorted = useMemo(() => sortGoals(goals), [goals])
  const active = sorted.filter((g) => g.savedMinor < g.targetMinor)
  const reached = sorted.filter((g) => g.savedMinor >= g.targetMinor)
  const totals = goalsTotals(goals)
  const fraction = totals.targetMinor > 0 ? Math.min(1, totals.savedMinor / totals.targetMinor) : 0
  const percent = totals.targetMinor > 0 ? Math.round((totals.savedMinor / totals.targetMinor) * 100) : 0
  const leftMinor = Math.max(0, totals.targetMinor - totals.savedMinor)
  const saved = formatMoney(totals.savedMinor, currency)
  const target = formatMoney(totals.targetMinor, currency)
  const left = formatMoney(leftMinor, currency)
  const allReached = totals.count > 0 && totals.reachedCount === totals.count

  return (
    <Dialog open={open} onClose={onClose} labelledBy="goals-title" variant="page">
      <div className="mx-auto w-full max-w-xl px-5 pb-[max(3rem,env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-10 -mx-5 flex items-center justify-between gap-3 bg-bg/80 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="min-w-0">
            <h2 id="goals-title" className="type-title">
              Goals
            </h2>
            {totals.count > 0 && (
              <p className="truncate text-xs text-ink-2">
                {`${totals.count} ${totals.count === 1 ? 'goal' : 'goals'}`}
                {totals.reachedCount > 0 && `, ${totals.reachedCount} reached`}
              </p>
            )}
          </div>
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
        </header>

        <p className="mt-1 text-[1.0625rem] leading-[1.6] text-ink-2">Money you add to a goal is a note to yourself. It does not change your balance or spending.</p>

        {goals.length === 0 ? (
          <div className={`${card} mt-5 p-5`}>
            <span aria-hidden="true" data-icon="flag" className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-ink">
              <Icon name="flag" size={22} />
            </span>
            <p className="type-title mt-4">Saving for something?</p>
            <p className="mt-1 text-[1.0625rem] leading-[1.6] text-ink-2">Set a goal for something you want to buy or an event coming up, and see how close you are.</p>
            <ol className="mt-4 space-y-3">
              {['Name it and say what it costs.', 'Pick a date if there is one, and see how much to save each week or month.', 'Add money each time you set some aside.'].map((step, i) => (
                <li key={step} className="flex items-start gap-3 text-[1.0625rem] leading-[1.5] text-ink-2">
                  <span aria-hidden="true" className="num flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm text-ink">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
            <button type="button" onClick={onNew} className="mt-5 min-h-12 rounded-full bg-btn px-5 font-semibold text-btn-ink">
              Set a goal
            </button>
          </div>
        ) : (
          <>
            <section aria-label="Total saved" className={`${card} mt-5 p-5`}>
              <div className="flex items-center gap-4">
                <GoalRing fraction={fraction} reached={allReached} size={96} stroke={9}>
                  <b className="num text-[1.5rem] leading-none">{`${percent}%`}</b>
                </GoalRing>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-2">Saved so far</p>
                  <p className="num text-[clamp(1.875rem,9vw,2.375rem)] leading-none tracking-tight">{saved}</p>
                  <p className="mt-1.5 text-[1.0625rem] leading-[1.5] text-ink-2">
                    <Figures text={`saved of ${target}`} figures={[target]} />
                  </p>
                </div>
              </div>
              <span
                role="progressbar"
                aria-label="All goals saved"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-valuetext={`${saved} of ${target} saved, ${percent}%`}
                className="sr-only"
              />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Tile icon="bars" label="Still to go">
                  {leftMinor > 0 ? <b className="num">{left}</b> : <b>All saved</b>}
                </Tile>
                <Tile icon="check" label="Reached">
                  <b className="num">{`${totals.reachedCount} of ${totals.count}`}</b>
                </Tile>
              </div>
            </section>

            {active.length > 0 && (
              <section aria-labelledby="goals-active-h" className="mt-8">
                <h3 id="goals-active-h" className="type-title mb-3 px-1">
                  In progress
                </h3>
                <GoalList goals={active} currency={currency} today={today} onEdit={onEdit} onAddMoney={onAddMoney} />
              </section>
            )}

            {reached.length > 0 && (
              <section aria-labelledby="goals-reached-h" className="mt-8">
                <h3 id="goals-reached-h" className="type-title mb-3 px-1">
                  Reached
                </h3>
                <GoalList goals={reached} currency={currency} today={today} onEdit={onEdit} onAddMoney={onAddMoney} />
              </section>
            )}
          </>
        )}
      </div>
    </Dialog>
  )
}
