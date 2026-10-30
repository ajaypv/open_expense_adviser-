import { formatMoney } from '../db/money'
import type { Goal } from '../db/schema'
import { describeTimeLeft, goalProgress, sortGoals } from '../insights/goals'
import { Icon } from './Icon'

interface Props {
  goals: Goal[]
  currency: string
  today: Date
  onOpen: () => void
}

/**
 * On Home, below everything that matters more: the goal that is nearest, with what is saved, what it costs, what is
 * left and how long there is, so a percentage is never left without its meaning. Amber is the colour of goals.
 * Nothing at all when there are none: the Goals button at the top is the way in.
 */
export function GoalsSummary({ goals, currency, today, onOpen }: Props) {
  if (goals.length === 0) return null
  const focus = sortGoals(goals)[0]
  const p = goalProgress(focus, today)
  const percent = Math.round(p.fraction * 100)
  const more = goals.length - 1
  const time = describeTimeLeft(p.daysLeft)

  return (
    <section aria-label="Goals summary" className="mt-8">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-xl font-bold tracking-tight">Goals</h2>
        <button type="button" onClick={onOpen} className="min-h-11 px-2 font-medium underline underline-offset-2">
          See goals
        </button>
      </div>

      <div className="rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-lg font-semibold">{focus.name}</p>
          <p className="shrink-0 tabular-nums text-ink-2">{`${formatMoney(focus.savedMinor, currency)} of ${formatMoney(focus.targetMinor, currency)}`}</p>
        </div>
        <span
          role="progressbar"
          aria-label={`${focus.name} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}%`}
          className="mt-3 block h-2.5 overflow-hidden rounded-full"
          style={{ background: 'color-mix(in oklab, var(--s4) 18%, var(--surface))' }}
        >
          <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${p.fraction * 100}%`, background: 'var(--s4)' }} />
        </span>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          {p.reached ? (
            <span className="flex items-center gap-1.5 font-medium text-good">
              <Icon name="check" size={18} />
              Goal reached
            </span>
          ) : (
            <>
              <span className="font-medium">{`${formatMoney(p.remainingMinor, currency)} to go`}</span>
              {time && <span className="text-ink-2">{time}</span>}
            </>
          )}
        </p>
        {more > 0 && <p className="mt-1 text-ink-2">{`${more} more ${more === 1 ? 'goal' : 'goals'}`}</p>}
      </div>
    </section>
  )
}
