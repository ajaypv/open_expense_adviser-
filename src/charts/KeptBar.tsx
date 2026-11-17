import { formatMoney } from '../db/money'
import { Icon } from '../ui/Icon'
import { useIntro } from '../ui/motion'

interface Props {
  /** Salary received in the month. */
  salaryMinor: number
  /** Other money received in the month. */
  otherMinor: number
  /** Left over from earlier months and still there to spend. */
  carriedMinor?: number
  /** The month the leftover comes from, by name ("October"). */
  carriedFrom?: string
  sentMinor: number
  currency: string
  /** The month being looked at, by name ("November"). */
  monthName: string
  /** The month is not over, so what is kept is "so far". */
  inProgress?: boolean
}

const SPENT = 'var(--accent)'
const KEPT = 'var(--good-text)'
const OVER = 'var(--critical)'

/**
 * What you had, what went out and what is left, in one picture: a single bar that is everything you had to spend (the salary
 * of the month, other money in and what was left from earlier months), split into the part spent and the part saved, then
 * lines that say the same in words. A salary that came in October and was not all spent is still there in November, so it is
 * counted as "left from October". When more went out than you had, the bar is everything spent with the part that was not
 * covered in red, and the last line says how much it was over by.
 */
export function KeptBar({ salaryMinor, otherMinor, carriedMinor = 0, carriedFrom = 'last month', sentMinor, currency, monthName, inProgress = false }: Props) {
  const intro = useIntro()
  const money = (m: number) => formatMoney(m, currency)
  const hadMinor = salaryMinor + otherMinor + carriedMinor
  const savedMinor = hadMinor - sentMinor
  const over = savedMinor < 0
  const whole = Math.max(hadMinor, sentMinor)
  const pct = (m: number) => (whole > 0 ? (m / whole) * 100 : 0)
  const keptPct = hadMinor > 0 ? Math.round((Math.max(savedMinor, 0) / hadMinor) * 100) : 0
  const spentPct = 100 - keptPct
  const so = inProgress ? ' so far' : ''

  const segments = over
    ? [
        { key: 'covered', width: pct(hadMinor), color: SPENT },
        { key: 'over', width: pct(-savedMinor), color: OVER },
      ]
    : [
        { key: 'spent', width: pct(sentMinor), color: SPENT },
        { key: 'kept', width: pct(savedMinor), color: KEPT },
      ]

  type Row = { key: string; label: string; note: string; amount: string; dot: string | null; tone: string; arrow?: boolean }
  const rows: Row[] = []
  if (carriedMinor > 0) rows.push({ key: 'carried', label: `Left from ${carriedFrom}`, note: 'Carried forward', amount: money(carriedMinor), dot: 'var(--ink-2)', tone: 'text-ink' })
  if (salaryMinor > 0) rows.push({ key: 'salary', label: 'Salary', note: `Received in ${monthName}`, amount: money(salaryMinor), dot: null, tone: 'text-ink', arrow: true })
  if (otherMinor > 0) rows.push({ key: 'other', label: salaryMinor > 0 ? 'Other money in' : 'Money received', note: `Received in ${monthName}`, amount: money(otherMinor), dot: null, tone: 'text-ink', arrow: true })
  rows.push({ key: 'spent', label: 'Spent', note: over ? 'More than you had' : `${spentPct}% of it`, amount: money(sentMinor), dot: SPENT, tone: 'text-ink' })
  rows.push(
    over
      ? { key: 'over', label: `Over by${so}`, note: 'Not covered by what you had', amount: money(-savedMinor), dot: OVER, tone: 'text-critical' }
      : { key: 'kept', label: `Saved${so}`, note: `${keptPct}% of it`, amount: money(savedMinor), dot: KEPT, tone: 'text-good' },
  )

  return (
    <div>
      <p className="text-sm text-ink-2">{over ? `You spent more than you had${so}` : `You saved${so}`}</p>
      <p className={`num mt-0.5 text-[clamp(1.75rem,8.4vw,2.25rem)] font-extrabold leading-none tracking-tight ${over ? 'text-critical' : 'text-good'}`}>
        {over ? money(-savedMinor) : money(savedMinor)}
      </p>
      {!over && hadMinor > 0 && <p className="mt-1.5 text-ink-2">{`out of ${money(hadMinor)} you had`}</p>}

      <div
        role="img"
        aria-label={
          over
            ? `${money(hadMinor)} to spend, ${money(sentMinor)} spent, ${money(-savedMinor)} over`
            : `${money(hadMinor)} to spend: ${money(sentMinor)} spent (${spentPct}%) and ${money(savedMinor)} saved (${keptPct}%)`
        }
        className="mt-4 flex h-4 gap-0.5 overflow-hidden rounded-full"
      >
        {segments.map((s) =>
          s.width > 0 ? (
            <span
              key={s.key}
              data-segment={s.key}
              className={`${intro ? 'bar-reveal ' : ''}h-full min-w-1 first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${s.width}%`, background: s.color }}
            />
          ) : null,
        )}
      </div>

      <dl className="mt-3 divide-y divide-line">
        {rows.map((r) => (
          <div key={r.key} data-row={r.key} className="flex min-h-12 items-center gap-3 py-2">
            <dt className="flex min-w-0 flex-1 items-center gap-2.5">
              {r.arrow ? (
                <span aria-hidden="true" data-icon="arrowDown" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-good">
                  <Icon name="arrowDown" size={15} weight={2.25} />
                </span>
              ) : (
                <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center">
                  <span className="size-3.5 rounded-full" style={{ background: r.dot ?? undefined }} />
                </span>
              )}
              <span className="min-w-0">
                <span className={`block font-semibold leading-tight ${r.tone}`}>{r.label}</span>
                <span className="block text-sm leading-tight text-ink-2">{r.note}</span>
              </span>
            </dt>
            <dd className={`num shrink-0 text-lg ${r.tone}`}>{r.amount}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
