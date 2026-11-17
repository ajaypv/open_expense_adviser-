import { formatMoney } from '../db/money'
import { monthLabel } from '../insights/aggregates'
import type { MonthBreakdown } from '../insights/trends'
import { Icon } from '../ui/Icon'
import { useIntro } from '../ui/motion'

interface Props {
  breakdown: MonthBreakdown
  /** The month shown, as a key ("2026-11"). */
  month: string
  /** The month before, by name ("October"). */
  prevName: string
  currency: string
  /** The month is not over, so what is left is "so far". */
  inProgress: boolean
  /** Step to the month before (-1) or after (+1). */
  onShift: (delta: -1 | 1) => void
  canPrev: boolean
  canNext: boolean
}

const SPENT = 'var(--accent)'
const KEPT = 'var(--good-text)'
const OVER = 'var(--critical)'

/**
 * One month's money as a plain sum: what was carried over from last month, plus what was received, minus what was spent,
 * leaves what is left (or how far over you went), with a bar and a month stepper to look at other months.
 */
export function MonthMoney({ breakdown: b, month, prevName, currency, inProgress, onShift, canPrev, canNext }: Props) {
  const intro = useIntro()
  const money = (m: number) => formatMoney(m, currency)
  const name = monthLabel(month).split(' ')[0]
  const had = b.carriedInMinor + b.receivedMinor
  const left = had - b.spentMinor
  const over = left < 0
  const whole = Math.max(had, b.spentMinor)
  const width = (m: number) => (whole > 0 ? `${(m / whole) * 100}%` : '0%')
  const empty = had === 0 && b.spentMinor === 0

  type Row = { key: string; label: string; note: string; amount: string; arrow?: boolean; dot?: string }
  const rows: Row[] = []
  if (b.carriedInMinor > 0) rows.push({ key: 'carried', label: `Carried from ${prevName}`, note: `Left over from ${prevName}`, amount: money(b.carriedInMinor), dot: 'var(--ink-2)' })
  rows.push({ key: 'received', label: `Received in ${name}`, note: 'Salary and other money in', amount: money(b.receivedMinor), arrow: true })
  rows.push({ key: 'spent', label: `Spent in ${name}`, note: 'Money out', amount: money(b.spentMinor), dot: SPENT })

  return (
    <div data-month-money>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          disabled={!canPrev}
          onClick={() => onShift(-1)}
          className="flex size-11 items-center justify-center rounded-full bg-surface-2 disabled:opacity-40"
        >
          <Icon name="chevLeft" size={20} />
        </button>
        <p aria-live="polite" className="text-lg font-semibold">{monthLabel(month)}</p>
        <button
          type="button"
          aria-label="Next month"
          disabled={!canNext}
          onClick={() => onShift(1)}
          className="flex size-11 items-center justify-center rounded-full bg-surface-2 disabled:opacity-40"
        >
          <Icon name="chevRight" size={20} />
        </button>
      </div>

      {empty ? (
        <p data-empty className="mt-3 text-ink-2">{`Nothing came in or went out in ${name}.`}</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink-2">{over ? `Over by${inProgress ? ' so far' : ''}` : inProgress ? 'Left so far' : 'Left at the end of the month'}</p>
          <p className={`num mt-0.5 text-[clamp(1.75rem,8.4vw,2.25rem)] font-extrabold leading-none tracking-tight ${over ? 'text-critical' : 'text-good'}`}>
            {money(Math.abs(left))}
          </p>

          <div
            role="img"
            aria-label={over ? `${money(had)} to spend, ${money(b.spentMinor)} spent, ${money(-left)} over` : `${money(had)} to spend: ${money(b.spentMinor)} spent and ${money(left)} left`}
            className="mt-4 flex h-4 gap-0.5 overflow-hidden rounded-full bg-surface-2"
          >
            {(over
              ? [
                  { key: 'covered', minor: had, color: SPENT },
                  { key: 'over', minor: -left, color: OVER },
                ]
              : [
                  { key: 'spent', minor: b.spentMinor, color: SPENT },
                  { key: 'left', minor: left, color: KEPT },
                ]
            ).map((s) =>
              s.minor > 0 ? (
                <span key={s.key} data-segment={s.key} className={`${intro ? 'bar-reveal ' : ''}h-full min-w-1 first:rounded-l-full last:rounded-r-full`} style={{ width: width(s.minor), background: s.color }} />
              ) : null,
            )}
          </div>

          <dl className="mt-3 divide-y divide-line">
            {rows.map((r) => (
              <div key={r.key} data-row={r.key} className="flex min-h-12 items-center gap-3 py-2">
                <dt className="flex min-w-0 flex-1 items-center gap-2.5">
                  {r.arrow ? (
                    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-good">
                      <Icon name="arrowDown" size={15} weight={2.25} />
                    </span>
                  ) : (
                    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center">
                      <span className="size-3.5 rounded-full" style={{ background: r.dot }} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block font-semibold leading-tight">{r.label}</span>
                    <span className="block text-sm leading-tight text-ink-2">{r.note}</span>
                  </span>
                </dt>
                <dd className="num shrink-0 text-lg">{r.amount}</dd>
              </div>
            ))}
          </dl>

          {b.carriedInMinor > 0 && b.spentMinor > 0 && (
            <p data-from-earlier className="mt-1 text-ink-2">
              {`${money(b.fromCarriedMinor)} of what you spent came from ${prevName}'s money.`}
            </p>
          )}
          {!over && left > 0 && !inProgress && <p className="mt-1 text-ink-2">{`${money(left)} carries on to next month.`}</p>}
        </>
      )}
    </div>
  )
}
