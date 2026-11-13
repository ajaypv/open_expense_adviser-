import { useCallback, useId, useRef, type CSSProperties } from 'react'
import type { Category } from '../db/schema'
import { formatMoney, formatMoneyCompact } from '../db/money'
import type { CategoryTotal } from '../insights/aggregates'
import { categoryIcon } from '../ui/categoryIcon'
import { Icon, type IconName } from '../ui/Icon'
import { useSeen } from '../ui/motion'
import { useSway } from '../ui/useSway'
import { formatShare } from './share'

interface Props {
  totals: CategoryTotal[]
  categoryById: Map<number, Category>
  currency: string
  /** The line on the lid of the chest, such as "Spent in November". */
  sourceLabel: string
  onPick?: (categoryId: number) => void
}

interface Part {
  key: string
  /** Null for the folded "Everything else", which opens nothing. */
  categoryId: number | null
  name: string
  color: string
  icon: IconName
  minor: number
  share: number
}

/** The picture is drawn on a 360-wide sheet and scaled to the width it is given, so the labels below line up with it. */
const W = 360
/** The treasure chest: where it sits, how big it is and how tall the lid is. */
const CHEST_X = 80
const CHEST_W = 200
const CHEST_Y = 14
const CHEST_H = 92
const LID_H = 40
/** The lines run from just inside the bottom of the chest, so they seem to come out of it, down to the dots they end on. */
const TOP = CHEST_Y + CHEST_H - 6
const FLOW = 140
const BOTTOM = TOP + FLOW
const CAP = 5
/** How far across the chest's base the lines leave it. */
const SOURCE_W = 150
const MAX_COLUMNS = 5

const num = (n: number) => Math.round(n * 100) / 100

/** How far the middle of a line is swung sideways, and up or down, at a full tilt, in the units of the picture. */
const SWAY_X = 24
const SWAY_Y = 12
/** The path of a line from where it leaves the chest to where it lands, with its middle swung by `sx` sideways and `sy` up or down. */
const linePath = (from: number, to: number, sx: number, sy: number) => {
  const mid = TOP + FLOW / 2
  return `M${num(from)} ${TOP}C${num(from + sx)} ${num(mid + sy)} ${num(to + sx)} ${num(mid + sy)} ${num(to)} ${BOTTOM - CAP - 1}`
}
interface LineGeometry {
  from: number
  to: number
}
/** A four-pointed sparkle. */
const sparkle = (x: number, y: number, r: number) =>
  `M${x} ${y - r}L${x + r * 0.3} ${y - r * 0.3}L${x + r} ${y}L${x + r * 0.3} ${y + r * 0.3}L${x} ${y + r}L${x - r * 0.3} ${y + r * 0.3}L${x - r} ${y}L${x - r * 0.3} ${y - r * 0.3}Z`

/**
 * The month's spending as a treasure chest with the money flowing out of it: the chest sits at the top middle with the
 * total written on its front and what it is on its lid, and one smooth line runs from it to each category along the bottom,
 * with the category's icon under it. The ones on the left bend left, the ones on the right bend right and the one in the
 * middle goes straight down. A line is a single stroke, not a band: a pearly wash of the category's colour, paler at the
 * chest and deeper where it lands, with a soft glow round it; a bigger spend is only a little thicker, because the share is
 * written under it. Each draws down from the chest one after another when the chart comes into view, and then a soft light
 * keeps travelling down it, which is the money moving; the chest glows and sparkles. The lines hang from the chest like
 * ropes: as the phone is tipped (the gyroscope) they swing the other way, and a push or a shake (the accelerometer) swings
 * them too and jolts the chest, while the chest and its glow drift a little, each at its own depth. With no sensor (a
 * computer) they sway gently by themselves; with reduced motion nothing moves. Under each line, the category's icon,
 * name, amount and share; it opens that category's expenses. More than five categories show the biggest four and fold the
 * rest into one grey "Everything else".
 */
export function CategoryFlow({ totals, categoryById, currency, sourceLabel, onPick }: Props) {
  const [watch, seen] = useSeen()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const box = useRef<HTMLDivElement | null>(null)
  const geometry = useRef<LineGeometry[]>([])
  const setBox = useCallback(
    (el: HTMLDivElement | null) => {
      box.current = el
      watch(el)
    },
    [watch],
  )
  const nonZero = totals.filter((t) => t.totalMinor > 0)
  const grand = nonZero.reduce((a, t) => a + t.totalMinor, 0)
  const drawn = grand > 0
  const lineKeys = nonZero.map((t) => t.key ?? t.categoryId).join(',')

  // The sway: while the chart is on screen, the sensors swing the lines like ropes (the chest and its glow are moved by CSS, from the
  // same readings). The lines are looked up once, and again when the categories drawn are not the same ones.
  useSway(box, {
    active: drawn,
    key: lineKeys,
    setup: (el) => {
      const paths = Array.from(el.querySelectorAll<SVGGElement>('[data-ribbon]')).map((g) => Array.from(g.querySelectorAll<SVGPathElement>('path')))
      return ({ x, y, shake, seconds }) => {
        const lines = geometry.current
        for (let i = 0; i < paths.length && i < lines.length; i++) {
          // The lines swing most in the middle and not at all where they leave the chest or land.
          const d = linePath(lines[i].from, lines[i].to, x * SWAY_X + shake * Math.sin(seconds * 40 + i) * 5, y * SWAY_Y)
          for (const p of paths[i]) p.setAttribute('d', d)
        }
      }
    },
  })

  if (!drawn) return null

  const named = (t: CategoryTotal): Part => {
    const cat = categoryById.get(t.categoryId)
    const name = t.name ?? cat?.name ?? 'No category'
    return { key: t.key ?? String(t.categoryId), categoryId: t.categoryId, name, color: t.color ?? cat?.color ?? 'var(--other)', icon: t.icon ?? categoryIcon(name), minor: t.totalMinor, share: t.totalMinor / grand }
  }
  const parts: Part[] =
    nonZero.length <= MAX_COLUMNS ? nonZero.map(named) : nonZero.slice(0, MAX_COLUMNS - 1).map(named)
  if (nonZero.length > MAX_COLUMNS) {
    const restMinor = nonZero.slice(MAX_COLUMNS - 1).reduce((a, t) => a + t.totalMinor, 0)
    parts.push({ key: 'rest', categoryId: null, name: 'Everything else', color: 'var(--other)', icon: 'tag', minor: restMinor, share: restMinor / grand })
  }

  const n = parts.length
  const colW = W / n
  const lines = parts.map((p, i) => {
    // Each leaves the chest at its own place along its base, in the order of the columns, and lands in the middle of its column.
    const sx = (W - SOURCE_W) / 2 + (SOURCE_W / n) * (i + 0.5)
    const ex = colW * (i + 0.5)
    return { part: p, d: linePath(sx, ex, 0, 0), from: sx, ex, width: num(3.5 + p.share * 8) }
  })
  geometry.current = lines.map((l) => ({ from: l.from, to: l.ex }))

  const total = formatMoney(grand, currency)
  const summary = parts.map((p) => `${p.name} ${formatShare(p.share)}`).join(', ')
  // The amount is sized to fit between the chest's gold bands, however many digits it has.
  const amountSize = Math.max(15, Math.min(26, 26 - (total.length - 8) * 2))
  const cx = W / 2
  const bodyTop = CHEST_Y + LID_H
  const chestRight = CHEST_X + CHEST_W
  const lidPath = `M${CHEST_X} ${bodyTop + 4}V${CHEST_Y + 26}C${CHEST_X} ${CHEST_Y + 6} ${CHEST_X + 26} ${CHEST_Y} ${cx} ${CHEST_Y}C${chestRight - 26} ${CHEST_Y} ${chestRight} ${CHEST_Y + 6} ${chestRight} ${CHEST_Y + 26}V${bodyTop + 4}Z`
  const id = (s: string) => `${uid}-${s}`

  return (
    <div ref={setBox} data-seen={seen} className="when-seen mx-auto w-full max-w-md" data-flow>
      <svg role="img" aria-label={`${sourceLabel}, ${total}. Where the money went: ${summary}`} viewBox={`0 0 ${W} ${BOTTOM}`} className="block h-auto w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={id('wood')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#a8712f" />
            <stop offset="1" stopColor="#6b431c" />
          </linearGradient>
          <linearGradient id={id('lid')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c28a43" />
            <stop offset="1" stopColor="#855426" />
          </linearGradient>
          <linearGradient id={id('gold')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbe08a" />
            <stop offset="1" stopColor="#c9971c" />
          </linearGradient>
          <radialGradient id={id('glow')}>
            <stop offset="0" stopColor="#ffd34d" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffd34d" stopOpacity="0" />
          </radialGradient>
          {lines.map(({ part }) => (
            /* Pale where the line leaves the chest, deeper where it lands. */
            <linearGradient key={part.key} id={id(`${part.key}-wash`)} gradientUnits="userSpaceOnUse" x1="0" y1={TOP} x2="0" y2={BOTTOM}>
              <stop offset="0" style={{ stopColor: part.color }} stopOpacity="0.4" />
              <stop offset="1" style={{ stopColor: part.color }} stopOpacity="1" />
            </linearGradient>
          ))}
        </defs>

        {lines.map(({ part, d, ex, width }, i) => {
          const style = { '--d': `${i * 110}ms` } as CSSProperties
          const draw = { fill: 'none', strokeLinecap: 'round', pathLength: 100 } as const
          return (
            <g key={part.key} data-ribbon={part.key} style={style}>
              <path className="flow-draw" d={d} {...draw} stroke={part.color} strokeOpacity={0.14} strokeWidth={width + 7} />
              <path className="flow-draw" d={d} {...draw} stroke={`url(#${id(`${part.key}-wash`)})`} strokeWidth={width} data-line data-width={width} />
              <path className="flow-pulse" d={d} {...draw} stroke="#fff" strokeOpacity={0.8} strokeWidth={Math.max(1.5, width * 0.35)} />
              <circle className="flow-cap" cx={num(ex)} cy={BOTTOM - CAP} r={CAP} fill={part.color} />
            </g>
          )
        })}

        {/* The treasure chest. Drawn after the lines, so they come out from under it. */}
        <g className="flow-back">
          <ellipse className="flow-glow" cx={cx} cy={CHEST_Y + 46} rx={150} ry={62} fill={`url(#${id('glow')})`} />
        </g>
        <g data-chest className="flow-chest">
          <rect x={CHEST_X} y={bodyTop} width={CHEST_W} height={CHEST_H - LID_H} rx={8} fill={`url(#${id('wood')})`} stroke="#3f2610" strokeWidth={1.5} />
          {/* The planks. */}
          <path d={`M${CHEST_X + 2} ${bodyTop + 22}H${chestRight - 2}M${CHEST_X + 2} ${bodyTop + 38}H${chestRight - 2}`} stroke="#3f2610" strokeOpacity={0.35} strokeWidth={1} />
          <path d={lidPath} fill={`url(#${id('lid')})`} stroke="#3f2610" strokeWidth={1.5} strokeLinejoin="round" />
          {/* The gold: a band across the seam and one up each side. */}
          <rect x={CHEST_X} y={bodyTop - 2} width={CHEST_W} height={7} fill={`url(#${id('gold')})`} stroke="#8a6410" strokeWidth={1} />
          {[CHEST_X + 14, chestRight - 26].map((x) => (
            <rect key={x} x={x} y={CHEST_Y + 6} width={12} height={CHEST_H - 6} rx={2} fill={`url(#${id('gold')})`} stroke="#8a6410" strokeWidth={1} />
          ))}
          <rect x={cx - 11} y={bodyTop - 8} width={22} height={22} rx={5} fill={`url(#${id('gold')})`} stroke="#8a6410" strokeWidth={1.2} />
          <circle cx={cx} cy={bodyTop + 1} r={3} fill="#4a2f10" />
          <rect x={cx - 1.2} y={bodyTop + 2} width={2.4} height={6} rx={1} fill="#4a2f10" />
          <text x={cx} y={CHEST_Y + 26} textAnchor="middle" fontSize={12} fontWeight={600} fill="#fff4d6">
            {sourceLabel}
          </text>
          <text x={cx} y={bodyTop + 45} textAnchor="middle" fontSize={amountSize} fontWeight={800} fill="#fff4d6" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {total}
          </text>
          {[
            { x: 118, y: 9, r: 6, d: 0 },
            { x: 240, y: 11, r: 5, d: 700 },
            { x: 180, y: 4, r: 4, d: 1300 },
          ].map((s) => (
            <path key={s.x} className="flow-twinkle" d={sparkle(s.x, s.y, s.r)} fill="#ffd34d" style={{ '--d': `${s.d}ms` } as CSSProperties} />
          ))}
        </g>
      </svg>

      <ul aria-label="Spending by category, as a flow" className="grid list-none p-0" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {parts.map((p, i) => {
          const row = { '--d': `${300 + i * 90}ms` } as CSSProperties
          const body = (
            <>
              <span
                aria-hidden="true"
                data-icon={p.icon}
                className="mb-1.5 flex size-10 items-center justify-center rounded-full"
                style={{ background: `color-mix(in oklab, ${p.color} 26%, var(--surface))` }}
              >
                <Icon name={p.icon} size={20} />
              </span>
              <span className="line-clamp-2 min-h-[2.4em] text-[0.8125rem] font-medium leading-tight">{p.name}</span>
              <span className="mt-1 text-[0.9375rem] font-semibold tabular-nums">{formatMoneyCompact(p.minor, currency)}</span>
              <span className="text-xs tabular-nums text-ink-2">{formatShare(p.share)}</span>
            </>
          )
          const cls = 'flex min-h-11 w-full flex-col items-center px-0.5 pt-2 text-center'
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
