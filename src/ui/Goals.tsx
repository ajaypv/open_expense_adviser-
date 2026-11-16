import { formatMoney } from '../db/money'
import type { Goal } from '../db/schema'
import { describeDue, goalProgress } from '../insights/goals'
import { Figures } from './Figures'
import { Icon } from './Icon'

interface RowProps {
  goal: Goal
  currency: string
  today: Date
  onEdit: (goal: Goal) => void
  onAddMoney: (goal: Goal) => void
}

const card = 'rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]'

/**
 * A round gauge: a ring that fills as the money is saved, with what is in the middle. Saved is the accent colour, and green once the goal is
 * reached; what is left is the same colour, pale, so one colour says both. It is a picture, hidden from a screen reader, which is given the
 * same in words by the bar beside it.
 */
export function GoalRing({ fraction, reached, size, stroke, children }: { fraction: number; reached: boolean; size: number; stroke: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <span aria-hidden="true" data-ring className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" focusable="false">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="color-mix(in oklab, var(--accent) 16%, var(--surface-2))" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={reached ? 'var(--good-text)' : 'var(--accent)'}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, fraction)))}
          className="transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
        />
      </svg>
      <span className="relative flex items-center justify-center">{children}</span>
    </span>
  )
}

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
  const left = formatMoney(p.remainingMinor, currency)
  const overdue = p.daysLeft !== null && p.daysLeft < 0
  const due = describeDue(goal, today)
  const pace = p.pace ? formatMoney(p.pace.amountMinor, currency) : ''

  return (
    <li className="p-4">
      <button type="button" onClick={() => onEdit(goal)} aria-label={`Edit goal ${goal.name}`} className="block w-full text-left">
        <span className="flex items-center gap-3">
          <GoalRing fraction={p.fraction} reached={p.reached} size={48} stroke={4}>
            <span data-icon={p.reached ? 'check' : 'flag'} className={`flex size-8 items-center justify-center rounded-full ${p.reached ? 'bg-surface-2 text-good' : 'bg-surface-2 text-ink'}`}>
              <Icon name={p.reached ? 'check' : 'flag'} size={16} weight={p.reached ? 2.25 : 1.75} />
            </span>
          </GoalRing>
          <span className="min-w-0 flex-1 truncate text-lg font-semibold leading-tight">{goal.name}</span>
          <span className="flex shrink-0 items-center gap-1 text-ink-2">
            <b className="num text-lg text-ink">{`${percent}%`}</b>
            <Icon name="chevRight" size={18} />
          </span>
        </span>
        <span className="mt-2.5 block text-[1.0625rem] leading-[1.5] text-ink-2 tabular-nums">
          <Figures text={`${saved} saved of ${target}`} figures={[saved, target]} />
        </span>
        <span
          role="progressbar"
          aria-label={`${goal.name} saved`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${saved} of ${target} saved, ${percent}%`}
          className="mt-3 block h-2.5 overflow-hidden rounded-full"
          style={{ background: 'color-mix(in oklab, var(--accent) 16%, var(--surface-2))' }}
        >
          <span
            className="block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${p.fraction * 100}%`, background: p.reached ? 'var(--good-text)' : 'var(--accent)' }}
          />
        </span>
      </button>

      <div className="mt-3.5 flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-1.5 text-[1.0625rem] leading-[1.5] text-ink-2">
          {p.reached ? (
            <p className="flex items-center gap-1.5 font-medium text-good">
              <Icon name="check" size={18} />
              Goal reached
            </p>
          ) : (
            <>
              <p className="text-ink">
                <b className="num">{left}</b> to go
              </p>
              {due && (
                <p className={`flex items-center gap-1.5 ${overdue ? 'text-critical' : ''}`}>
                  {overdue && <Icon name="warn" size={18} />}
                  {due}
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
            data-icon="plus"
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 pl-3 pr-4 font-semibold active:opacity-70"
          >
            <Icon name="plus" size={16} weight={2.25} />
            Add money
          </button>
        )}
      </div>
      {pace && !p.reached && (
        <p className="mt-2.5 rounded-2xl bg-surface-2 px-3 py-2.5 text-[1.0625rem] leading-[1.5] text-ink-2">
          <Figures text={`Save ${pace} a ${p.pace!.per} to get there on time`} figures={[pace]} />
        </p>
      )}
    </li>
  )
}
