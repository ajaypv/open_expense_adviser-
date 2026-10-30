import { Meter } from '../charts/Meter'
import { formatMoney } from '../db/money'
import { AnimatedMoney } from './AnimatedMoney'
import { Icon } from './Icon'

export interface PeriodTile {
  id: string
  label: string
  amountMinor: number
  from: string
  to: string
}

interface Props {
  monthName: string
  /** The month in progress, which reads "so far" and has Today, Yesterday and Last 7 days. */
  isCurrent: boolean
  totalMinor: number
  /** Against the month before, as a whole percent; null when there is nothing to compare with. */
  deltaPct: number | null
  /** The comparison is over the same days of the month before, since this one is not finished. */
  partial: boolean
  prevName: string
  dailyAverageMinor: number
  expenseCount: number
  budgetMinor: number | null
  currency: string
  periods: PeriodTile[]
  privacy: boolean
  onTogglePrivacy: () => void
  onSetBudget: () => void
  onPickPeriod: (range: { from: string; to: string }) => void
}

/**
 * Where you stand, answered in one place: what was spent this month as the single headline number, how that
 * compares with last month, the daily average, how many expenses were logged, the budget and how much of it is
 * left, and (for the month in progress) the last few days kept small so they don't compete with the headline.
 */
export function SpendingOverview({
  monthName,
  isCurrent,
  totalMinor,
  deltaPct,
  partial,
  prevName,
  dailyAverageMinor,
  expenseCount,
  budgetMinor,
  currency,
  periods,
  privacy,
  onTogglePrivacy,
  onSetBudget,
  onPickPeriod,
}: Props) {
  const against = `${partial ? 'the same days in ' : ''}${prevName}`

  return (
    <section aria-label="Summary" className="relative mt-3 rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_var(--ring)]">
      <button
        type="button"
        aria-pressed={privacy}
        onClick={onTogglePrivacy}
        aria-label={privacy ? 'Show amounts' : 'Hide amounts'}
        className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"
      >
        <Icon name={privacy ? 'eyeOff' : 'eye'} size={20} />
      </button>

      {totalMinor === 0 ? (
        <p className="pr-10 text-2xl font-semibold tracking-tight">{`Nothing spent in ${monthName} yet.`}</p>
      ) : (
        <>
          <p className="text-ink-2">{isCurrent ? `Spent so far in ${monthName}` : `Spent in ${monthName}`}</p>
          <p className="mt-1 whitespace-nowrap text-[clamp(2.25rem,10vw,2.5rem)] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
            <AnimatedMoney minor={totalMinor} currency={currency} id="hero" />
          </p>
          {deltaPct !== null && (
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-ink-2">
              {deltaPct === 0 ? (
                <>{`The same as ${against}.`}</>
              ) : (
                <>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-2 pr-2.5 font-medium ${
                      deltaPct > 0 ? 'text-critical' : 'text-good'
                    }`}
                  >
                    <Icon name={deltaPct > 0 ? 'arrowUp' : 'arrowDown'} size={16} />
                    {`${Math.abs(deltaPct)}% ${deltaPct > 0 ? 'more' : 'less'}`}
                  </span>
                  {`than ${against}`}
                </>
              )}
            </p>
          )}

          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
            <div className="min-w-0">
              <dt className="text-sm text-ink-2">Daily average</dt>
              <dd className="mt-0.5 truncate text-xl font-bold tabular-nums">{formatMoney(dailyAverageMinor, currency)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-ink-2">Expenses logged</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums">{expenseCount}</dd>
            </div>
          </dl>
        </>
      )}

      <div className="mt-4 border-t border-line pt-4">
        {budgetMinor === null ? (
          <>
            <p className="font-medium">Your budget</p>
            <p className="mt-0.5 text-ink-2">Set a monthly budget to see how much you have left.</p>
            <button type="button" onClick={onSetBudget} className="mt-3 min-h-11 rounded-full bg-surface-2 px-4 font-medium">
              Set budget
            </button>
          </>
        ) : (
          <Meter spentMinor={totalMinor} limitMinor={budgetMinor} currency={currency} />
        )}
      </div>

      {periods.length > 0 && (
        <section aria-label="Recent spending" className="mt-4 grid grid-cols-3 gap-2">
          {periods.map((p) => {
            const spent = formatMoney(p.amountMinor, currency)
            const body = (
              <>
                <span className="block text-[0.8125rem] font-medium text-ink-2">{p.label}</span>
                <span className={`mt-0.5 block truncate text-base font-semibold tabular-nums ${p.amountMinor === 0 ? 'text-ink-2' : ''}`}>
                  <AnimatedMoney minor={p.amountMinor} currency={currency} id={p.id} compact />
                </span>
              </>
            )
            // A figure with something behind it opens those transactions; a day with nothing spent has nothing to open.
            return p.amountMinor > 0 ? (
              <button
                key={p.id}
                type="button"
                aria-label={`${p.label}: ${spent}. See these transactions`}
                onClick={() => onPickPeriod({ from: p.from, to: p.to })}
                className="min-h-14 min-w-0 rounded-2xl bg-surface-2 px-3 py-2 text-left active:bg-line [@media(hover:hover)]:hover:bg-line"
              >
                {body}
              </button>
            ) : (
              <div key={p.id} role="group" aria-label={`${p.label}: ${spent}`} className="min-h-14 min-w-0 rounded-2xl bg-surface-2/50 px-3 py-2">
                {body}
              </div>
            )
          })}
        </section>
      )}
    </section>
  )
}
