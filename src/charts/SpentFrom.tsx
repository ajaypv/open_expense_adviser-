import { useState, type ReactNode } from 'react'
import { formatMoney, parseLocalDate } from '../db/money'
import { daysInMonth } from '../insights/aggregates'
import type { MonthBreakdown } from '../insights/trends'
import { Icon } from '../ui/Icon'
import { useIntro } from '../ui/motion'

interface Props {
  breakdown: MonthBreakdown
  /** For the names and colours of what the earlier money paid for. */
  categoryById: Map<number, { name: string; color: string }>
  currency: string
  /** The month being looked at, by name ("November"). */
  monthName: string
  /** The month before, by name ("October"). */
  prevName: string
  /** The month before, as a key ("2026-10"), for its last day. */
  prevMonth: string
  /** A month key ("2026-10") by name, for the month-by-month lines. */
  labelOf: (month: string) => string
  /** The month is not over. */
  inProgress?: boolean
  /** The whole month in one picture (money in, spent, saved), shown first in the full view. */
  more?: ReactNode
}

const USED = 'var(--accent)'
const LEFT = 'var(--good-text)'
const EARLIER = 'var(--ink-2)'
const OVER = 'var(--critical)'

/** Months shown in the month-by-month lines of the full view. */
const SHOWN_MONTHS = 6

/**
 * What was left from last month, and how this month has used it. By default only that: the amount left on the last day of the
 * month before, how much of it this month's spending has used, and how much is still left. "Full view" opens the rest: the
 * whole month (money in, spent, saved), which money paid for the spending, what last month's money paid for, and the
 * carry-forward month by month.
 */
export function SpentFrom({ breakdown: b, categoryById, currency, monthName, prevName, prevMonth, labelOf, inProgress = false, more }: Props) {
  const intro = useIntro()
  const [open, setOpen] = useState(false)
  const money = (m: number) => formatMoney(m, currency)
  const so = inProgress ? ' so far' : ''
  const day = (date: string) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).format(parseLocalDate(date))

  const used = b.fromCarriedMinor
  const left = b.carriedInMinor - used
  const usedPct = b.carriedInMinor > 0 ? Math.round((used / b.carriedInMinor) * 100) : 0
  const spentPct = (m: number) => (b.spentMinor > 0 ? Math.round((m / b.spentMinor) * 100) : 0)
  const segments = [
    { key: 'used', minor: used, color: USED },
    { key: 'left', minor: left, color: LEFT },
  ]

  const parts = [
    { key: 'earlier', label: `From ${prevName}'s money`, minor: b.fromCarriedMinor, color: EARLIER },
    { key: 'income', label: `From ${monthName}'s money`, minor: b.fromIncomeMinor, color: USED },
    ...(b.notCoveredMinor > 0 ? [{ key: 'over', label: 'More than you had', minor: b.notCoveredMinor, color: OVER }] : []),
  ]
  const steps = b.steps.slice(-SHOWN_MONTHS)
  const earlierPaid = b.fromCarriedByCategory.slice(0, 6)

  return (
    <div data-spent-from>
      <p className="text-sm text-ink-2">{`Left from ${prevName}, on ${daysInMonth(prevMonth)} ${prevName}`}</p>
      <p className="num mt-0.5 text-[clamp(1.75rem,8.4vw,2.25rem)] font-extrabold leading-none tracking-tight">{money(b.carriedInMinor)}</p>

      <div
        role="img"
        aria-label={`${money(b.carriedInMinor)} left from ${prevName}: ${money(used)} used in ${monthName}, ${money(left)} still left`}
        className="mt-4 flex h-4 gap-0.5 overflow-hidden rounded-full bg-surface-2"
      >
        {segments.map((s) =>
          s.minor > 0 ? (
            <span
              key={s.key}
              data-segment={s.key}
              className={`${intro ? 'bar-reveal ' : ''}h-full min-w-1 first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${(s.minor / b.carriedInMinor) * 100}%`, background: s.color }}
            />
          ) : null,
        )}
      </div>

      <dl className="mt-3 divide-y divide-line">
        <div data-line="used" className="flex min-h-12 items-center gap-3 py-2">
          <dt className="flex min-w-0 flex-1 items-center gap-2.5">
            <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center">
              <span className="size-3.5 rounded-full" style={{ background: USED }} />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold leading-tight">{`Used in ${monthName}${so}`}</span>
              <span className="block text-sm leading-tight text-ink-2">{`${usedPct}% of it`}</span>
            </span>
          </dt>
          <dd className="num shrink-0 text-lg">{money(used)}</dd>
        </div>
        <div data-line="still" className="flex min-h-12 items-center gap-3 py-2">
          <dt className="flex min-w-0 flex-1 items-center gap-2.5">
            <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center">
              <span className="size-3.5 rounded-full" style={{ background: LEFT }} />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold leading-tight text-good">{left > 0 ? `Still left${so}` : 'Used up'}</span>
              <span className="block text-sm leading-tight text-ink-2">
                {left > 0 ? `${100 - usedPct}% of it` : b.carriedRanOutOn ? `On ${day(b.carriedRanOutOn)}` : 'Nothing left of it'}
              </span>
            </span>
          </dt>
          <dd className="num shrink-0 text-lg text-good">{money(left)}</dd>
        </div>
      </dl>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="mt-1 flex min-h-12 w-full items-center justify-between gap-3 border-t border-line pt-1 text-left font-semibold"
      >
        {open ? 'Hide full view' : 'Full view'}
        <span aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <Icon name="chevDown" size={18} />
        </span>
      </button>

      {open && (
        <div data-full-view className="mt-3">
          {more && (
            <div data-whole-month>
              <h3 className="mb-3 font-semibold">{`All of ${monthName}`}</h3>
              {more}
            </div>
          )}

          <h3 className="mt-6 font-semibold">{`Where ${monthName}'s spending came from`}</h3>
          <dl className="mt-1 divide-y divide-line">
            {parts.map((p) => (
              <div key={p.key} data-part={p.key} className="flex min-h-12 items-center gap-3 py-2">
                <dt className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center">
                    <span className="size-3.5 rounded-full" style={{ background: p.color }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold leading-tight">{p.label}</span>
                    <span className="block text-sm leading-tight text-ink-2">{`${spentPct(p.minor)}% of what you spent`}</span>
                  </span>
                </dt>
                <dd className="num shrink-0 text-lg">{money(p.minor)}</dd>
              </div>
            ))}
          </dl>
          {b.carriedInMinor > 0 && (
            <p className="mt-1 text-ink-2">
              {b.carriedRanOutOn
                ? `${prevName}'s money was used up on ${day(b.carriedRanOutOn)}. After that, spending came from ${monthName}'s money.`
                : `${prevName}'s money has not run out${so}: ${money(left)} of it is still there to spend.`}
            </p>
          )}

          {earlierPaid.length > 0 && (
            <>
              <h3 className="mt-6 font-semibold">{`What ${prevName}'s money paid for`}</h3>
              <ul data-paid-for className="mt-1 divide-y divide-line">
                {earlierPaid.map((c) => {
                  const cat = categoryById.get(c.categoryId)
                  return (
                    <li key={c.categoryId} className="flex min-h-11 items-center gap-2.5 py-2">
                      <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: cat?.color ?? EARLIER }} />
                      <span className="min-w-0 flex-1 truncate">{cat?.name ?? 'Other'}</span>
                      <span className="num text-lg">{money(c.totalMinor)}</span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          <h3 className="mt-6 font-semibold">Carried forward, month by month</h3>
          {steps.length === 0 ? (
            <p className="mt-1 text-ink-2">Once money comes in, this shows what each month carries on to the next.</p>
          ) : (
            <div className="mt-1 overflow-x-auto">
              <table className="w-full min-w-72 text-left">
                <thead>
                  <tr className="text-sm text-ink-2">
                    <th scope="col" className="py-1 pr-2 font-normal">Month</th>
                    <th scope="col" className="py-1 pr-2 text-right font-normal">Came in</th>
                    <th scope="col" className="py-1 pr-2 text-right font-normal">Spent</th>
                    <th scope="col" className="py-1 text-right font-normal">Carried on</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {steps.map((s) => (
                    <tr key={s.month} data-step={s.month}>
                      <th scope="row" className="py-2 pr-2 font-semibold">{labelOf(s.month)}</th>
                      <td className="num py-2 pr-2 text-right">{money(s.carriedInMinor + s.receivedMinor)}</td>
                      <td className="num py-2 pr-2 text-right">{money(s.spentMinor)}</td>
                      <td className="num py-2 text-right text-good">{money(s.carriedOutMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-sm text-ink-2">Came in counts what was left from the month before. A month that went over carries nothing on.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
