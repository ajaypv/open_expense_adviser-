import { formatMoney } from '../db/money'
import { Icon } from '../ui/Icon'
import { useIntro } from '../ui/motion'

interface Props {
  receivedMinor: number
  sentMinor: number
  currency: string
  /** The month is not over, so what is kept is "so far". */
  inProgress?: boolean
}

const SPENT = 'var(--accent)'
const KEPT = 'var(--good-text)'
const OVER = 'var(--critical)'

/**
 * What came in, what went out and what was kept, in one picture: a single bar that is everything received, split into the
 * part spent and the part saved, then three lines that say the same in words. When more went out than came in the bar is
 * everything spent, with the part that was not covered in red, and the last line says how much it was over by.
 */
export function KeptBar({ receivedMinor, sentMinor, currency, inProgress = false }: Props) {
  const intro = useIntro()
  const money = (m: number) => formatMoney(m, currency)
  const savedMinor = receivedMinor - sentMinor
  const over = savedMinor < 0
  const whole = Math.max(receivedMinor, sentMinor)
  const pct = (m: number) => (whole > 0 ? (m / whole) * 100 : 0)
  const keptPct = receivedMinor > 0 ? Math.round((Math.max(savedMinor, 0) / receivedMinor) * 100) : 0
  const spentPct = 100 - keptPct
  const so = inProgress ? ' so far' : ''

  const segments = over
    ? [
        { key: 'covered', width: pct(receivedMinor), color: SPENT },
        { key: 'over', width: pct(-savedMinor), color: OVER },
      ]
    : [
        { key: 'spent', width: pct(sentMinor), color: SPENT },
        { key: 'kept', width: pct(savedMinor), color: KEPT },
      ]

  const rows = [
    { key: 'received', label: 'Received', note: 'Salary and other money in', amount: money(receivedMinor), dot: null as string | null, tone: 'text-ink' },
    { key: 'spent', label: 'Spent', note: over ? 'More than came in' : `${spentPct}% of it`, amount: money(sentMinor), dot: SPENT, tone: 'text-ink' },
    over
      ? { key: 'over', label: `Over by${so}`, note: 'Not covered by what came in', amount: money(-savedMinor), dot: OVER, tone: 'text-critical' }
      : { key: 'kept', label: `Saved${so}`, note: `${keptPct}% of it`, amount: money(savedMinor), dot: KEPT, tone: 'text-good' },
  ]

  return (
    <div>
      <p className="text-sm text-ink-2">{over ? `You spent more than came in${so}` : `You saved${so}`}</p>
      <p className={`num mt-0.5 text-[clamp(1.75rem,8.4vw,2.25rem)] font-extrabold leading-none tracking-tight ${over ? 'text-critical' : 'text-good'}`}>
        {over ? money(-savedMinor) : money(savedMinor)}
      </p>
      {!over && receivedMinor > 0 && <p className="mt-1.5 text-ink-2">{`out of ${money(receivedMinor)} received`}</p>}

      <div
        role="img"
        aria-label={
          over
            ? `${money(receivedMinor)} received, ${money(sentMinor)} spent, ${money(-savedMinor)} over`
            : `${money(receivedMinor)} received: ${money(sentMinor)} spent (${spentPct}%) and ${money(savedMinor)} saved (${keptPct}%)`
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
              {r.key === 'received' ? (
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
