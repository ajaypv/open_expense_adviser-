import { Meter } from '../charts/Meter'
import { formatMoney } from '../db/money'
import { useState, type ReactNode } from 'react'
import { AnimatedMoney } from './AnimatedMoney'
import { Icon } from './Icon'
import { useSwipe } from './useSwipe'
import { WaterBorder } from './Water'

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
  onPickPeriod: (range: { from: string; to: string }) => void
  /** The month in view (YYYY-MM): when it changes, the figures slide in from the side it came from. */
  monthKey?: string
  /** Swiping to the right goes to the previous month; swiping to the left to the next, when there is one. */
  onPrevMonth?: () => void
  onNextMonth?: () => void
  /** Shown at the foot of the card, under the recent figures: what to plan for in the weeks ahead. */
  ahead?: ReactNode
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
  onPickPeriod,
  monthKey,
  onPrevMonth,
  onNextMonth,
  ahead,
}: Props) {
  const against = `${partial ? 'the same days in ' : ''}${prevName}`
  const swipe = useSwipe({ onRight: onPrevMonth, onLeft: onNextMonth })

  // Which way the month just moved, so the figures can slide in from that side. Worked out as the month changes.
  const [shown, setShown] = useState<{ key: string | undefined; dir: 'next' | 'prev' | null }>({ key: monthKey, dir: null })
  if (shown.key !== monthKey) {
    setShown({ key: monthKey, dir: monthKey === undefined || shown.key === undefined ? null : monthKey > shown.key ? 'next' : 'prev' })
  }

  return (
    <section aria-label="Summary" {...swipe} className="relative mt-3 touch-pan-y rounded-[24px] bg-surface p-5 shadow-[0_0_0_1px_var(--ring)]">
      {/* The budget, drawn on the card's own outline. */}
      {budgetMinor !== null && <WaterBorder ratio={totalMinor / budgetMinor} />}
      <button
        type="button"
        aria-pressed={privacy}
        onClick={onTogglePrivacy}
        aria-label={privacy ? 'Show amounts' : 'Hide amounts'}
        className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"
      >
        <Icon name={privacy ? 'eyeOff' : 'eye'} size={20} />
      </button>

      <div
        key={monthKey ?? 'month'}
        data-month={monthKey}
        className={shown.dir === 'next' ? 'month-slide-from-right' : shown.dir === 'prev' ? 'month-slide-from-left' : undefined}
      >
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

      {budgetMinor !== null && (
        <div className="mt-4 border-t border-line pt-4">
          <Meter spentMinor={totalMinor} limitMinor={budgetMinor} currency={currency} variant="text" />
        </div>
      )}

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

      {ahead}
      </div>
    </section>
  )
}
