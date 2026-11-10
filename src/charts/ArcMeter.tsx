import { formatMoney } from '../db/money'
import { AnimatedMoney } from '../ui/AnimatedMoney'
import { Icon } from '../ui/Icon'
import { useIntro } from '../ui/motion'
import { BUDGET_SKY, budgetStatus, budgetTone } from './budgetTone'

/** How many bars make the half circle, and where they sit: from the ring's inner edge to its outer edge. */
export const ARC_BARS = 41
const CENTRE = { x: 150, y: 154 }
const INNER = 110
const OUTER = 140

interface Props {
  spentMinor: number
  limitMinor: number
  currency: string
  /** Said above the figure, such as "Spent so far in November". */
  heading: string
  /** Said instead of the figure when nothing has been spent yet. */
  emptyHeading: string
}

/** How many of the bars are lit: in proportion to what is used, at least one once anything is spent, all of them once the limit is reached. */
export function litBars(spentMinor: number, limitMinor: number): number {
  if (spentMinor <= 0 || limitMinor <= 0) return 0
  const ratio = spentMinor / limitMinor
  if (ratio >= 1) return ARC_BARS
  return Math.max(1, Math.round(ratio * ARC_BARS))
}

/** The two ends of bar `i`, which runs along the radius at its place on the half circle (left end first, right end last). */
function bar(i: number) {
  const angle = Math.PI - (i * Math.PI) / (ARC_BARS - 1)
  const at = (r: number) => ({ x: CENTRE.x + r * Math.cos(angle), y: CENTRE.y - r * Math.sin(angle) })
  return { from: at(INNER), to: at(OUTER) }
}

const BARS = Array.from({ length: ARC_BARS }, (_, i) => bar(i))

/**
 * Budget progress as a half circle of bars, lit from the left as the month's money is used, with what was spent in the middle.
 * The state is stated in words and an icon under it, never by colour alone, and the whole is one meter for a screen reader.
 */
export function ArcMeter({ spentMinor, limitMinor, currency, heading, emptyHeading }: Props) {
  const intro = useIntro()
  const ratio = spentMinor / limitMinor
  const { over, close, fill } = budgetTone(ratio)
  const lit = litBars(spentMinor, limitMinor)
  const status = budgetStatus(spentMinor, limitMinor, currency)

  return (
    <div>
      <div
        role="meter"
        aria-label="Monthly budget used"
        aria-valuemin={0}
        aria-valuemax={limitMinor / 100}
        aria-valuenow={Math.min(spentMinor, limitMinor) / 100}
        aria-valuetext={status}
        data-lit={lit}
        className="relative mx-auto max-w-sm"
      >
        <svg viewBox="-4 0 308 162" aria-hidden="true" className="block w-full">
          {BARS.map((b, i) => (
            <line
              key={i}
              x1={b.from.x}
              y1={b.from.y}
              x2={b.to.x}
              y2={b.to.y}
              strokeWidth={5.5}
              strokeLinecap="round"
              stroke={i < lit ? fill : BUDGET_SKY}
              className={i < lit && intro ? 'arc-bar-in' : undefined}
              style={i < lit && intro ? { animationDelay: `${0.2 + i * 0.022}s` } : undefined}
            />
          ))}
        </svg>
        <div className="absolute inset-x-0 bottom-0 px-[18%] text-center">
          {spentMinor === 0 ? (
            <p className="text-lg font-semibold leading-snug tracking-tight">{emptyHeading}</p>
          ) : (
            <>
              <p className="text-[0.8125rem] text-ink-2">{heading}</p>
              <p className="mt-0.5 whitespace-nowrap text-[clamp(1.875rem,9vw,2.25rem)] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
                <AnimatedMoney minor={spentMinor} currency={currency} id="hero" />
              </p>
            </>
          )}
        </div>
      </div>
      <p className="mt-1 text-center tabular-nums text-ink-2">
        <span className="font-semibold text-ink">{Math.round(ratio * 100)}%</span> of {formatMoney(limitMinor, currency)}
      </p>
      <p className={`mt-1 flex items-center justify-center gap-1.5 ${over ? 'font-semibold text-critical' : close ? 'font-medium text-ink' : 'text-ink-2'}`}>
        {(over || close) && (
          <span style={{ color: over ? 'var(--critical)' : 'var(--warn-ui)' }}>
            <Icon name="warn" size={18} />
          </span>
        )}
        {status}
      </p>
    </div>
  )
}
