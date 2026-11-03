import { useState, type CSSProperties } from 'react'
import { formatMoney } from '../db/money'
import type { Category } from '../db/schema'
import type { CategoryTotal } from '../insights/aggregates'
import { useSeen } from '../ui/motion'
import { formatShare } from './share'

interface Props {
  totals: CategoryTotal[]
  categoryById: Map<number, Category>
  currency: string
  /** Show this many categories and fold the rest into one grey "Everything else". */
  limit?: number
  onPick?: (categoryId: number) => void
}

interface Row {
  key: string
  /** Null for the folded "Everything else", which opens nothing. */
  categoryId: number | null
  name: string
  color: string
  minor: number
}

const RADIUS = 38
const STROKE = 13
/** The selected segment is a little thicker. */
const STROKE_SELECTED = 15
/** The gap left between two segments, beyond the round caps. */
const GAP = 3
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Spend by category as a ring of rounded segments with a legend beside it. The middle shows the total, or the
 * category being looked at: tap a segment, hover or focus a legend row, and that one stands out while the rest fade.
 * A sentence under it says what most of the spending went on. The legend rows carry the full name, share and
 * amount, and open the category when tapped.
 */
export function CategoryDonut({ totals, categoryById, currency, limit = 6, onPick }: Props) {
  // A tap on a segment is kept until it is tapped again; a mouse or focus only looks.
  const [picked, setPicked] = useState<string | null>(null)
  const [looking, setLooking] = useState<string | null>(null)
  // It is drawn when the person can see it, not when the page was drawn.
  const [watch, seen] = useSeen()

  const grand = totals.reduce((a, t) => a + t.totalMinor, 0)
  if (grand <= 0) return null

  const rows: Row[] = totals.slice(0, limit).map((t) => {
    const cat = categoryById.get(t.categoryId)
    return { key: String(t.categoryId), categoryId: t.categoryId, name: cat?.name ?? 'No category', color: cat?.color ?? 'var(--other)', minor: t.totalMinor }
  })
  const restMinor = totals.slice(limit).reduce((a, t) => a + t.totalMinor, 0)
  if (restMinor > 0) rows.push({ key: 'rest', categoryId: null, name: 'Everything else', color: 'var(--other)', minor: restMinor })

  const money = (minor: number) => formatMoney(minor, currency)
  const activeKey = looking ?? picked
  const active = rows.find((r) => r.key === activeKey) ?? null

  // Where each segment starts, as a fraction of the way round: the shares of all those before it.
  const shares = rows.map((r) => r.minor / grand)
  const arcs = rows.map((r, i) => {
    const share = shares[i]
    const start = shares.slice(0, i).reduce((a, b) => a + b, 0)
    // Each end is a round cap that reaches half a stroke past the dash, so a gap is the stroke plus the gap; a share
    // too small to leave any length is still drawn as a dot.
    const length = Math.max(share * CIRCUMFERENCE - STROKE - GAP, 0.01)
    return { row: r, share, length, offset: -(start * CIRCUMFERENCE + (STROKE + GAP) / 2) }
  })

  const [first, second] = rows
  const firstShare = first.minor / grand
  const insight =
    rows.length === 1
      ? `All of it went on ${first.name}.`
      : firstShare > 0.5
        ? `More than half of it went on ${first.name}.`
        : `Most of it went on ${first.name} and ${second.name}, ${formatShare((first.minor + second.minor) / grand)} together.`

  return (
    <div ref={watch} data-seen={seen} className="when-seen">
      <div className="relative mx-auto aspect-square w-full max-w-[16rem]">
        <svg viewBox="0 0 100 100" className="size-full" aria-hidden="true">
          <g transform="rotate(-90 50 50)">
            <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--surface-2)" strokeWidth={STROKE} />
            {arcs.map(({ row, length, offset }, i) => {
              const on = row.key === activeKey
              return (
                <circle
                  key={row.key}
                  data-segment={row.key}
                  className="donut-seg"
                  cx="50"
                  cy="50"
                  r={RADIUS}
                  fill="none"
                  stroke={row.color}
                  strokeWidth={on ? STROKE_SELECTED : STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                  strokeDashoffset={offset}
                  onClick={() => setPicked((p) => (p === row.key ? null : row.key))}
                  style={
                    {
                      opacity: activeKey === null || on ? 1 : 0.4,
                      cursor: 'pointer',
                      transition: 'opacity 0.2s, stroke-width 0.2s',
                      // Each segment starts drawing a beat after the one before it, so the ring is drawn round.
                      '--d': `${i * 110}ms`,
                    } as CSSProperties
                  }
                />
              )
            })}
          </g>
        </svg>
        <div data-testid="donut-centre" aria-live="polite" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-[22%] text-center">
          {/* Keyed on what it shows, so a new reading pops in when the chosen category changes. */}
          <span key={active?.key ?? 'total'} className="donut-pop flex max-w-full flex-col items-center">
            <span className="text-[clamp(1.25rem,6.5vw,1.75rem)] font-semibold leading-tight tabular-nums">{money(active ? active.minor : grand)}</span>
            <span className="mt-0.5 line-clamp-2 text-sm leading-tight text-ink-2">{active ? `${active.name}, ${formatShare(active.minor / grand)}` : 'Total'}</span>
          </span>
        </div>
      </div>

      <ul aria-label="Spending by category" onPointerLeave={(e) => e.pointerType === 'mouse' && setLooking(null)} className="mt-4 divide-y divide-line">
        {arcs.map(({ row, share }, i) => {
          const label = `${row.name}, ${formatShare(share)}, ${money(row.minor)}`
          const content = (
            <>
              <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: row.color }} />
              <span className="min-w-0 flex-1 truncate text-left">{row.name}</span>
              <span className="shrink-0 tabular-nums text-ink-2">{formatShare(share)}</span>
              <span className="w-20 shrink-0 text-right font-semibold tabular-nums">{money(row.minor)}</span>
            </>
          )
          const rowClass = `flex min-h-12 w-full items-center gap-3 py-2 ${row.key === activeKey ? 'font-semibold' : ''}`
          return (
            <li key={row.key} className="row-in" style={{ '--d': `${300 + i * 60}ms` } as CSSProperties}>
              {onPick && row.categoryId !== null ? (
                <button
                  type="button"
                  aria-label={`${label}. Show these expenses`}
                  onClick={() => onPick(row.categoryId!)}
                  onFocus={() => setLooking(row.key)}
                  onBlur={() => setLooking(null)}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setLooking(row.key)}
                  className={rowClass}
                >
                  {content}
                </button>
              ) : (
                <div className={rowClass} onPointerEnter={(e) => e.pointerType === 'mouse' && setLooking(row.key)}>
                  {content}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <p className="row-in mt-3 rounded-2xl bg-surface-2 p-3.5 text-[0.9375rem] leading-snug text-ink-2" style={{ '--d': `${300 + rows.length * 60}ms` } as CSSProperties}>
        {insight}
      </p>
    </div>
  )
}
