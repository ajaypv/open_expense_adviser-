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
const EARLIER = 'var(--ink-2)'

const step =
  'flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 transition-opacity disabled:opacity-35 active:bg-line'

/**
 * One month's money as a plain sum: what was carried over from last month, plus what was received, minus what was spent,
 * leaves what is left (or how far over you went). A month stepper at the top, the answer first as a big figure, a bar with
 * its two shares named under it, and a soft tile for each part of the sum.
 */
export function MonthMoney({ breakdown: b, month, prevName, currency, inProgress, onShift, canPrev, canNext }: Props) {
  const intro = useIntro()
  const money = (m: number) => formatMoney(m, currency)
  const monthName = monthLabel(month).split(' ')[0]
  const had = b.carriedInMinor + b.receivedMinor
  const left = had - b.spentMinor
  const over = left < 0
  const whole = Math.max(had, b.spentMinor)
  const share = (m: number) => (whole > 0 ? (m / whole) * 100 : 0)
  const empty = had === 0 && b.spentMinor === 0
  const so = inProgress ? ' so far' : ''

  const segments = over
    ? [
        { key: 'covered', label: 'Covered', minor: had, color: SPENT },
        { key: 'over', label: 'Over', minor: -left, color: OVER },
      ]
    : [
        { key: 'spent', label: 'Spent', minor: b.spentMinor, color: SPENT },
        { key: 'left', label: 'Left', minor: left, color: KEPT },
      ]

  type Row = { key: string; label: string; note: string; amount: string; arrow?: boolean; dot?: string }
  const rows: Row[] = []
  if (b.carriedInMinor > 0) rows.push({ key: 'carried', label: `Carried from ${prevName}`, note: `Left over from ${prevName}`, amount: money(b.carriedInMinor), dot: EARLIER })
  rows.push({ key: 'received', label: `Received in ${monthName}`, note: 'Salary and other money in', amount: money(b.receivedMinor), arrow: true })
  rows.push({ key: 'spent', label: `Spent in ${monthName}`, note: 'Money out', amount: money(b.spentMinor), dot: SPENT })

  return (
    <div data-month-money>
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => onShift(-1)} className={step}>
          <Icon name="chevLeft" size={20} />
        </button>
        <p aria-live="polite" className="min-w-0 text-center leading-tight">
          <span className="block text-lg font-semibold">{monthLabel(month)}</span>
          <span className="block text-sm text-ink-2">{inProgress ? 'This month' : 'Month ended'}</span>
        </p>
        <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => onShift(1)} className={step}>
          <Icon name="chevRight" size={20} />
        </button>
      </div>

      {empty ? (
        <p data-empty className="mt-5 rounded-2xl bg-surface-2 p-4 text-ink-2">{`Nothing came in or went out in ${monthName}.`}</p>
      ) : (
        <>
          <div className="mt-5">
            <p className="text-sm text-ink-2">{over ? `Over by${so}` : inProgress ? 'Left so far' : 'Left at the end of the month'}</p>
            <p className={`num mt-0.5 text-[clamp(1.75rem,8.4vw,2.25rem)] font-extrabold leading-none tracking-tight ${over ? 'text-critical' : 'text-good'}`}>
              {money(Math.abs(left))}
            </p>
          </div>

          <div
            role="img"
            aria-label={over ? `${money(had)} to spend, ${money(b.spentMinor)} spent, ${money(-left)} over` : `${money(had)} to spend: ${money(b.spentMinor)} spent and ${money(left)} left`}
            className="mt-4 flex h-4 gap-0.5 overflow-hidden rounded-full bg-surface-2"
          >
            {segments.map((s) =>
              s.minor > 0 ? (
                <span key={s.key} data-segment={s.key} className={`${intro ? 'bar-reveal ' : ''}h-full min-w-1 first:rounded-l-full last:rounded-r-full`} style={{ width: `${share(s.minor)}%`, background: s.color }} />
              ) : null,
            )}
          </div>
          <p aria-hidden="true" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
            {segments.map((s) =>
              s.minor > 0 ? (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                  {`${s.label} ${Math.round(share(s.minor))}%`}
                </span>
              ) : null,
            )}
          </p>

          <dl className="mt-4 space-y-2">
            {rows.map((r) => (
              <div key={r.key} data-row={r.key} className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2">
                <dt className="flex min-w-0 flex-1 items-center gap-3">
                  {r.arrow ? (
                    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-good">
                      <Icon name="arrowDown" size={16} weight={2.25} />
                    </span>
                  ) : (
                    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface">
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
            <p data-from-earlier className="mt-3 text-ink-2">
              <b className="num font-semibold text-ink">{money(b.fromCarriedMinor)}</b>
              {` of what you spent came from ${prevName}'s money.`}
            </p>
          )}
          {!over && left > 0 && !inProgress && <p className="mt-2 text-ink-2">{`${money(left)} carries on to next month.`}</p>}
        </>
      )}
    </div>
  )
}
