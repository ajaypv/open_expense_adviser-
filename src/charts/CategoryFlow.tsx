import { useId, type CSSProperties } from 'react'
import type { Category } from '../db/schema'
import { formatMoney, formatMoneyCompact } from '../db/money'
import type { CategoryTotal } from '../insights/aggregates'
import { useSeen } from '../ui/motion'
import { formatShare } from './share'

interface Props {
  totals: CategoryTotal[]
  categoryById: Map<number, Category>
  currency: string
  /** The line on the pill at the top, such as "Spent in November". */
  sourceLabel: string
  onPick?: (categoryId: number) => void
}

interface Part {
  key: string
  /** Null for the folded "Everything else", which opens nothing. */
  categoryId: number | null
  name: string
  color: string
  minor: number
  share: number
}

/** The picture is drawn on a 360 by 170 sheet and scaled to the width it is given, so the labels below line up with it. */
const W = 360
const H = 170
/** How wide the stream is where it leaves the pill, and how much room each category has at the bottom. */
const SOURCE_W = 150
const MAX_COLUMNS = 5
const CAP = 5
/** How tall the band of light is that slides down the ribbons. */
const SHINE = 70

const num = (n: number) => Math.round(n * 100) / 100

/**
 * The month's spending as a stream that splits: a pill at the top middle with the total, and a ribbon from it to each
 * category along the bottom. A ribbon is as thick as the category's share where it leaves the pill and narrows to fit
 * its column, so the ones on the left bend left, the ones on the right bend right and the one in the middle goes straight
 * down. Each is smooth like water or the inside of a shell: a pearly wash of the category's colour, paler where it leaves the
 * pill and deeper where it lands, with fine strands along it like the ridges of a shell. Each pours in from the top one after
 * another when the chart comes into view, and then a soft light keeps sliding down it from the pill, which is the money
 * moving. Under each ribbon, the category with its amount and share; it opens that category's expenses. More than five
 * categories show the biggest four and fold the rest into one grey "Everything else".
 */
export function CategoryFlow({ totals, categoryById, currency, sourceLabel, onPick }: Props) {
  const [watch, seen] = useSeen()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const nonZero = totals.filter((t) => t.totalMinor > 0)
  const grand = nonZero.reduce((a, t) => a + t.totalMinor, 0)
  if (grand <= 0) return null

  const named = (t: CategoryTotal): Part => {
    const cat = categoryById.get(t.categoryId)
    return { key: t.key ?? String(t.categoryId), categoryId: t.categoryId, name: t.name ?? cat?.name ?? 'No category', color: t.color ?? cat?.color ?? 'var(--other)', minor: t.totalMinor, share: t.totalMinor / grand }
  }
  const parts: Part[] =
    nonZero.length <= MAX_COLUMNS ? nonZero.map(named) : nonZero.slice(0, MAX_COLUMNS - 1).map(named)
  if (nonZero.length > MAX_COLUMNS) {
    const restMinor = nonZero.slice(MAX_COLUMNS - 1).reduce((a, t) => a + t.totalMinor, 0)
    parts.push({ key: 'rest', categoryId: null, name: 'Everything else', color: 'var(--other)', minor: restMinor, share: restMinor / grand })
  }

  const n = parts.length
  const colW = W / n
  // A thin share still gets a ribbon you can see; the widths are then scaled back so together they fill the pill's width.
  const raw = parts.map((p) => Math.max(p.share * SOURCE_W, 4))
  const scale = SOURCE_W / raw.reduce((a, b) => a + b, 0)
  const widths = raw.map((w) => w * scale)
  const yMid = H * 0.5
  let cursor = (W - SOURCE_W) / 2
  const ribbons = parts.map((p, i) => {
    const w = widths[i]
    const x0 = cursor
    cursor += w
    const endW = Math.min(w, colW - 10)
    const cx = colW * (i + 0.5)
    const top = { l: x0, r: x0 + w, c: x0 + w / 2 }
    const bottom = { l: cx - endW / 2, r: cx + endW / 2, c: cx }
    const shape =
      `M${num(top.l)} 0C${num(top.l)} ${yMid} ${num(bottom.l)} ${yMid} ${num(bottom.l)} ${H - CAP}` +
      `L${num(bottom.r)} ${H - CAP}C${num(bottom.r)} ${yMid} ${num(top.r)} ${yMid} ${num(top.r)} 0Z`
    // Fine strands along the ribbon, a quarter, half and three quarters of the way across it; the middle one is its centre line.
    const strands = [0.25, 0.5, 0.75].map((f) => {
      const sx = top.l + w * f
      const ex = bottom.l + endW * f
      return `M${num(sx)} 0C${num(sx)} ${yMid} ${num(ex)} ${yMid} ${num(ex)} ${H - CAP}`
    })
    return { part: p, shape, strands, capX: bottom.l, capW: endW }
  })

  const summary = parts.map((p) => `${p.name} ${formatShare(p.share)}`).join(', ')

  return (
    <div ref={watch} data-seen={seen} className="when-seen mx-auto w-full max-w-md" data-flow>
      <div className="mx-auto w-[41.667%] rounded-2xl bg-surface-2 px-3 py-2 text-center">
        <p className="text-sm text-ink-2">{sourceLabel}</p>
        <p className="text-xl font-bold leading-tight tabular-nums">{formatMoney(grand, currency)}</p>
      </div>

      <svg role="img" aria-label={`Where the money went: ${summary}`} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* The light that slides down: clear at both ends, a soft white band in the middle. */}
          <linearGradient id={`${uid}-shine`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          {ribbons.map(({ part, shape }) => (
            <g key={part.key}>
              {/* Pale where the ribbon leaves the pill, deeper where it lands. */}
              <linearGradient id={`${uid}-${part.key}-wash`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
                <stop offset="0" style={{ stopColor: part.color }} stopOpacity="0.16" />
                <stop offset="1" style={{ stopColor: part.color }} stopOpacity="0.62" />
              </linearGradient>
              <clipPath id={`${uid}-${part.key}-clip`}>
                <path d={shape} />
              </clipPath>
            </g>
          ))}
        </defs>
        {ribbons.map(({ part, shape, strands, capX, capW }, i) => {
          const style = { '--d': `${i * 110}ms` } as CSSProperties
          return (
            <g key={part.key} data-ribbon={part.key} style={style}>
              <g className="flow-pour">
                <path d={shape} fill={`url(#${uid}-${part.key}-wash)`} data-wash />
                {strands.map((s, k) => (
                  <path key={k} d={s} fill="none" stroke="#fff" strokeOpacity={k === 1 ? 0.4 : 0.25} strokeWidth={1} data-strand={k === 1 ? 'centre' : undefined} />
                ))}
                <g clipPath={`url(#${uid}-${part.key}-clip)`}>
                  <rect className="flow-shine" x={0} y={-SHINE} width={W} height={SHINE} fill={`url(#${uid}-shine)`} />
                </g>
              </g>
              <rect className="flow-cap" x={num(capX)} y={H - CAP} width={num(capW)} height={CAP} rx={2} fill={part.color} />
            </g>
          )
        })}
      </svg>

      <ul aria-label="Spending by category, as a flow" className="grid list-none p-0" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {parts.map((p, i) => {
          const row = { '--d': `${300 + i * 90}ms` } as CSSProperties
          const body = (
            <>
              <span className="line-clamp-2 min-h-[2.4em] text-[0.8125rem] font-medium leading-tight">{p.name}</span>
              <span className="mt-1 text-[0.9375rem] font-semibold tabular-nums">{formatMoneyCompact(p.minor, currency)}</span>
              <span className="text-xs tabular-nums text-ink-2">{formatShare(p.share)}</span>
            </>
          )
          const cls = 'flex min-h-11 w-full flex-col items-center px-0.5 pt-1.5 text-center'
          return (
            <li key={p.key} className="row-in" style={row}>
              {p.categoryId !== null && onPick ? (
                <button type="button" onClick={() => onPick(p.categoryId!)} aria-label={`${p.name}, ${formatMoney(p.minor, currency)}, ${formatShare(p.share)}. Show these expenses`} className={`${cls} active:opacity-70`}>
                  {body}
                </button>
              ) : (
                <p aria-label={`${p.name}, ${formatMoney(p.minor, currency)}, ${formatShare(p.share)}`} className={cls}>
                  {body}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
