import { useState } from 'react'
import { formatMoney, parseLocalDate } from '../db/money'
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
  /** A month key ("2026-10") by name, for the month-by-month lines. */
  labelOf: (month: string) => string
  /** The month is not over. */
  inProgress?: boolean
}

const EARLIER = 'var(--ink-2)'
const NEW = 'var(--accent)'
const OVER = 'var(--critical)'

/** Months shown in the month-by-month lines of the full view. */
const SHOWN_MONTHS = 6

/**
 * Which money paid for this month's spending. What was left from earlier months is spent first, so the card says how much
 * of the month went on last month's money and how much on what came in this month. "Full view" opens the rest: what the
 * earlier money paid for, when it ran out or what is still left, and the carry-forward month by month.
 */
export function SpentFrom({ breakdown: b, categoryById, currency, monthName, prevName, labelOf, inProgress = false }: Props) {
  const intro = useIntro()
  const [open, setOpen] = useState(false)
  const money = (m: number) => formatMoney(m, currency)
  const pct = (m: number) => (b.spentMinor > 0 ? Math.round((m / b.spentMinor) * 100) : 0)
  const so = inProgress ? ' so far' : ''
  const day = (date: string) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).format(parseLocalDate(date))
  const nothingBefore = b.carriedInMinor === 0

  const parts = [
    { key: 'earlier', label: `From ${prevName}'s money`, note: nothingBefore ? `Nothing was left from ${prevName}` : `${pct(b.fromCarriedMinor)}% of what you spent`, minor: b.fromCarriedMinor, color: EARLIER },
    { key: 'income', label: `From ${monthName}'s money`, note: `${pct(b.fromIncomeMinor)}% of what you spent`, minor: b.fromIncomeMinor, color: NEW },
    ...(b.notCoveredMinor > 0 ? [{ key: 'over', label: 'More than you had', note: `${pct(b.notCoveredMinor)}% of what you spent`, minor: b.notCoveredMinor, color: OVER }] : []),
  ]

  const used = b.fromCarriedMinor
  const left = b.carriedInMinor - used
  const steps = b.steps.slice(-SHOWN_MONTHS)
  const earlierPaid = b.fromCarriedByCategory.slice(0, 6)

  return (
    <div data-spent-from>
      <p className="text-sm text-ink-2">{`Where ${monthName}'s spending came from`}</p>
      <p className="mt-1 text-lg font-semibold leading-snug">
        {nothingBefore
          ? `All ${money(b.spentMinor)} came from ${monthName}'s money${so}.`
          : `${money(b.fromCarriedMinor)} of the ${money(b.spentMinor)} came from ${prevName}'s money${so}.`}
      </p>

      <div role="img" aria-label={parts.map((p) => `${money(p.minor)} ${p.label.toLowerCase()}`).join(', ')} className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface-2">
        {parts.map((p) =>
          p.minor > 0 ? (
            <span
              key={p.key}
              data-segment={p.key}
              className={`${intro ? 'bar-reveal ' : ''}h-full min-w-1 first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${(p.minor / b.spentMinor) * 100}%`, background: p.color }}
            />
          ) : null,
        )}
      </div>

      <dl className="mt-3 divide-y divide-line">
        {parts.map((p) => (
          <div key={p.key} data-part={p.key} className="flex min-h-12 items-center gap-3 py-2">
            <dt className="flex min-w-0 flex-1 items-center gap-2.5">
              <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center">
                <span className="size-3.5 rounded-full" style={{ background: p.color }} />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold leading-tight">{p.label}</span>
                <span className="block text-sm leading-tight text-ink-2">{p.note}</span>
              </span>
            </dt>
            <dd className="num shrink-0 text-lg">{money(p.minor)}</dd>
          </div>
        ))}
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
        <div data-full-view className="mt-1">
          <h3 className="font-semibold">{`${prevName}'s money`}</h3>
          {nothingBefore ? (
            <p className="mt-1 text-ink-2">{`Nothing was left over from ${prevName} or the months before, so everything came from ${monthName}'s money.`}</p>
          ) : (
            <>
              <dl className="mt-1 divide-y divide-line">
                {[
                  { key: 'left', label: `Left from ${prevName}`, minor: b.carriedInMinor },
                  { key: 'used', label: `Spent in ${monthName}${so}`, minor: used },
                  { key: 'still', label: left > 0 ? `Still there${so}` : 'Used up', minor: left },
                ].map((r) => (
                  <div key={r.key} data-line={r.key} className="flex min-h-11 items-center justify-between gap-3 py-2">
                    <dt className="text-ink-2">{r.label}</dt>
                    <dd className="num text-lg">{money(r.minor)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-1 text-ink-2">
                {b.carriedRanOutOn
                  ? `${prevName}'s money was used up on ${day(b.carriedRanOutOn)}. After that, spending came from ${monthName}'s money.`
                  : `${prevName}'s money has not run out${so}: ${money(left)} of it is still there to spend.`}
              </p>
              {earlierPaid.length > 0 && (
                <>
                  <h3 className="mt-4 font-semibold">{`What ${prevName}'s money paid for`}</h3>
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
            </>
          )}

          <h3 className="mt-4 font-semibold">Carried forward, month by month</h3>
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
