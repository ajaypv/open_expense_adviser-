import { formatMoney } from '../db/money'
import { AnimatedMoney } from '../ui/AnimatedMoney'
import { Icon } from '../ui/Icon'
import { useIntro } from '../ui/motion'
import { BUDGET_SKY, budgetStatus, budgetTone } from './budgetTone'

// The half circle: its centre, and how far the bars run from the inner edge of the ring to the outer one.
const CENTRE = { x: 150, y: 156 }
const INNER = 104
const OUTER = 146
/** The shortest a bar is (a day with nothing spent, or a day still to come), as a share of the ring's depth. */
const SHORTEST = 0.4

interface Props {
  spentMinor: number
  limitMinor: number
  currency: string
  /** Said above the figure, such as "Spent so far in November". */
  heading: string
  /** Said instead of the figure when nothing has been spent yet. */
  emptyHeading: string
  /** What was spent on each day of the month, in order; one bar for each. */
  dailyMinor: number[]
  /** The day of the month it is, for the month in progress (the bars after it are days still to come); null for a month that is over. */
  todayDay: number | null
}

/** How a day's spending compares with its share of the budget (1 is exactly the share). */
export function dayRatio(spentMinor: number, limitMinor: number, days: number): number {
  const share = limitMinor / Math.max(days, 1)
  return share > 0 ? spentMinor / share : 0
}

/** Green for a quiet day, through amber as the day's share of the budget is used, to red beyond it (fully red from half as much again). */
export function dayColor(ratio: number): string {
  const r = Math.max(0, ratio)
  if (r <= 1) return `color-mix(in oklab, var(--warn-ui) ${Math.round(r * 100)}%, var(--good-text))`
  return `color-mix(in oklab, var(--critical) ${Math.round(Math.min((r - 1) / 0.5, 1) * 100)}%, var(--warn-ui))`
}

/** How far a bar reaches across the ring, as a share of its depth: short when little is spent, the whole depth at a day's share and beyond. */
export function dayReach(ratio: number): number {
  return SHORTEST + (1 - SHORTEST) * Math.min(Math.max(ratio, 0), 1)
}

/** The two ends of bar `i` of `count`, along the radius at its place on the half circle (the first day on the left, the last on the right). */
function bar(i: number, count: number, reach: number) {
  const angle = count > 1 ? Math.PI - (i * Math.PI) / (count - 1) : Math.PI / 2
  const at = (r: number) => ({ x: CENTRE.x + r * Math.cos(angle), y: CENTRE.y - r * Math.sin(angle) })
  return { from: at(INNER), to: at(INNER + reach * (OUTER - INNER)) }
}

/**
 * The month as a half circle of bars, one for each day from the first on the left to the last on the right: a bar is longer and
 * redder the more was spent that day against its share of the budget, and green and short on a quiet one. Days still to come are
 * pale and short. The figure for the month, and how much of the budget it is, sit in the middle; the state of the budget is stated
 * in words and an icon under it, never by colour alone, and the whole is one meter for a screen reader.
 */
export function ArcMeter({ spentMinor, limitMinor, currency, heading, emptyHeading, dailyMinor, todayDay }: Props) {
  const intro = useIntro()
  const ratio = spentMinor / limitMinor
  const { over, close } = budgetTone(ratio)
  const status = budgetStatus(spentMinor, limitMinor, currency)
  const days = dailyMinor.length
  const elapsed = todayDay ?? days

  return (
    <div>
      {spentMinor > 0 && <p className="mb-1 text-center text-sm text-ink-2">{heading}</p>}
      <div
        role="meter"
        aria-label="Monthly budget used"
        aria-valuemin={0}
        aria-valuemax={limitMinor / 100}
        aria-valuenow={Math.min(spentMinor, limitMinor) / 100}
        aria-valuetext={status}
        className="relative mx-auto max-w-md"
      >
        <svg viewBox="-2 0 304 164" aria-hidden="true" className="block w-full">
          {dailyMinor.map((minor, i) => {
            const past = i < elapsed
            const r = past ? dayRatio(minor, limitMinor, days) : 0
            const b = bar(i, days, dayReach(r))
            return (
              <line
                key={i}
                data-day={i + 1}
                data-state={past ? 'past' : 'ahead'}
                x1={b.from.x}
                y1={b.from.y}
                x2={b.to.x}
                y2={b.to.y}
                strokeWidth={6.5}
                strokeLinecap="round"
                stroke={past ? dayColor(r) : BUDGET_SKY}
                className={past && intro ? 'arc-bar-in' : undefined}
                style={past && intro ? { animationDelay: `${0.15 + i * 0.02}s` } : undefined}
              />
            )
          })}
          {todayDay !== null && days > 1 && (
            // A small dot past the end of today's bar.
            <circle
              data-today
              cx={CENTRE.x + (OUTER + 7) * Math.cos(Math.PI - ((todayDay - 1) * Math.PI) / (days - 1))}
              cy={CENTRE.y - (OUTER + 7) * Math.sin(Math.PI - ((todayDay - 1) * Math.PI) / (days - 1))}
              r={2.6}
              fill="var(--ink)"
            />
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-0 px-[18%] text-center">
          {spentMinor === 0 ? (
            <p className="text-lg font-semibold leading-snug tracking-tight">{emptyHeading}</p>
          ) : (
            <p className="whitespace-nowrap text-[clamp(1.625rem,8.5vw,2.125rem)] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
              <AnimatedMoney minor={spentMinor} currency={currency} id="hero" />
            </p>
          )}
          <p className="mt-1.5 text-[0.9375rem] tabular-nums text-ink-2">
            {spentMinor > 0 && <span className="font-semibold text-ink">{Math.round(ratio * 100)}% </span>}
            of {formatMoney(limitMinor, currency)}
          </p>
        </div>
      </div>
      <p className={`mt-2 flex items-center justify-center gap-1.5 ${over ? 'font-semibold text-critical' : close ? 'font-medium text-ink' : 'text-ink-2'}`}>
        {(over || close) && (
          <span style={{ color: over ? 'var(--critical)' : 'var(--warn-ui)' }}>
            <Icon name="warn" size={18} />
          </span>
        )}
        {status}
      </p>
      <p className="mt-1 text-center text-[0.8125rem] leading-snug text-ink-2">One bar for each day. Green is a quiet day; red is more than a day’s share of the budget.</p>
    </div>
  )
}
