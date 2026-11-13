import { useCallback, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { Category } from '../db/schema'
import { formatMoney, formatMoneyCompact } from '../db/money'
import type { CategoryTotal } from '../insights/aggregates'
import { categoryIcon } from '../ui/categoryIcon'
import { Icon, type IconName } from '../ui/Icon'
import { useSeen } from '../ui/motion'
import { useSway } from '../ui/useSway'
import { tilt } from '../ui/useTilt'
import { pour, pullFrom, radii, settle, step, type Box, type CoinWorld } from './coinPhysics'
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
  /** Null for the folded "Everything else", which opens a list of what is in it. */
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
const CHEST_X = 75
const CHEST_W = 210
const CHEST_Y = 54
const CHEST_H = 106
const LID_H = 44
const BODY_TOP = CHEST_Y + LID_H
/** The lines run from just inside the bottom of the chest, so they seem to come out of it, down to the dots they end on. */
const TOP = CHEST_Y + CHEST_H - 6
const FLOW = 140
const BOTTOM = TOP + FLOW
const CAP = 5
/** How far across the chest's base the lines leave it. */
const SOURCE_W = 150
const MAX_COLUMNS = 5
/** The coins that fill the chest, and the inside of it they lie in: between its sides, from under the open lid to a little below the rim. */
const COINS = 26
const CHEST_RIGHT = CHEST_X + CHEST_W
const BOX: Box = { left: CHEST_X + 10, right: CHEST_RIGHT - 10, top: BODY_TOP - 62, floor: BODY_TOP + 6 }
const RADII = radii(COINS)

const num = (n: number) => Math.round(n * 100) / 100

const motionAllowed = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches === true

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

/** The mark on a coin: the currency's own sign if it is short, otherwise a plain one. */
const signOf = (currency: string) => {
  const s = formatMoney(0, currency).replace(/[\d\s., ]/g, '').trim()
  return s.length > 0 && s.length <= 2 ? s : '¤'
}

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
 * computer) they sway gently by themselves; with reduced motion nothing moves.
 *
 * The chest opens. Tap it (or the button beside it) and the lid lifts back and gold coins pour in and lie in it, as coins do:
 * each has its own weight and size, falls, bounces, rolls and turns as it rolls, and knocks the others about (see coinPhysics).
 * Tip the phone and they slide down the way it tips, push it and they slosh the other way, shake it and they fly about and settle
 * again; on a computer, drag a finger or the mouse through them. With reduced motion the chest simply opens on a settled pile.
 *
 * Under each line, the category's icon, name, amount and share; it opens that category's expenses. More than five categories
 * show the biggest four and fold the rest into one grey "Everything else", which opens a list of everything in it.
 */
export function CategoryFlow({ totals, categoryById, currency, sourceLabel, onPick }: Props) {
  const [watch, seen] = useSeen()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const box = useRef<HTMLDivElement | null>(null)
  const svg = useRef<SVGSVGElement | null>(null)
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

  // The chest: whether it is open, the coins in it, and the pieces of the picture they are drawn with.
  const [open, setOpen] = useState(false)
  const [restOpen, setRestOpen] = useState(false)
  const openRef = useRef(false)
  const opens = useRef(0)
  const world = useRef<CoinWorld | null>(null)
  const coinEls = useRef<(SVGGElement | null)[]>([])
  const stir = useRef<{ x: number; y: number; t: number } | null>(null)
  const sign = useMemo(() => signOf(currency), [currency])

  const paint = useCallback(() => {
    const w = world.current
    if (!w) return
    w.coins.forEach((c, i) => {
      const g = coinEls.current[i]
      if (!g) return
      g.setAttribute('opacity', openRef.current && c.at <= w.time ? '1' : '0')
      g.setAttribute('transform', `translate(${num(c.x)} ${num(c.y)}) rotate(${num((c.a * 180) / Math.PI)})`)
    })
  }, [])

  // The sway: while the chart is on screen, the sensors swing the lines like ropes (the chest and its glow are moved by CSS, from the
  // same readings), and move the coins in the chest when it is open. The lines are looked up once, and again when the categories drawn
  // are not the same ones.
  useSway(box, {
    active: drawn,
    key: lineKeys,
    setup: (el) => {
      const paths = Array.from(el.querySelectorAll<SVGGElement>('[data-ribbon]')).map((g) => Array.from(g.querySelectorAll<SVGPathElement>('path')))
      let last = 0
      return ({ x, y, shake, seconds }) => {
        const lines = geometry.current
        for (let i = 0; i < paths.length && i < lines.length; i++) {
          // The lines swing most in the middle and not at all where they leave the chest or land.
          const d = linePath(lines[i].from, lines[i].to, x * SWAY_X + shake * Math.sin(seconds * 40 + i) * 5, y * SWAY_Y)
          for (const p of paths[i]) p.setAttribute('d', d)
        }
        const w = world.current
        if (openRef.current && w) {
          const dt = last ? seconds - last : 1 / 60
          last = seconds
          // The phone's own pull on the coins: which way is down for them, as it is held, and how hard it is being shaken.
          step(w, dt, { ...pullFrom(tilt), shake })
          paint()
        } else last = 0
      }
    },
  })

  /** Opens or closes the chest. Opening pours a fresh handful of coins; with reduced motion they are simply there, settled. */
  function toggle() {
    const next = !openRef.current
    openRef.current = next
    setOpen(next)
    if (next) {
      const w = pour(COINS, BOX, 7 + opens.current++)
      world.current = w
      if (!motionAllowed()) {
        settle(w, pullFrom(tilt))
        w.time = 99
      }
    }
    paint()
  }

  /** A finger or the mouse dragged through the coins stirs them: each one it passes is carried along a little. */
  function onStir(e: PointerEvent<HTMLDivElement>) {
    const w = world.current
    const el = svg.current
    if (!openRef.current || !w || !el || e.buttons === 0) {
      stir.current = null
      return
    }
    const r = el.getBoundingClientRect()
    if (r.width === 0) return
    const scale = W / r.width
    const x = (e.clientX - r.left) * scale
    const y = (e.clientY - r.top) * scale
    const before = stir.current
    stir.current = { x, y, t: e.timeStamp }
    if (!before || e.timeStamp <= before.t) return
    const seconds = (e.timeStamp - before.t) / 1000
    const vx = Math.max(-900, Math.min(900, (x - before.x) / seconds))
    const vy = Math.max(-900, Math.min(900, (y - before.y) / seconds))
    for (const c of w.coins) {
      if (c.at > w.time) continue
      if (Math.hypot(c.x - x, c.y - y) < c.r + 14) {
        c.vx += vx * 0.3
        c.vy += vy * 0.3
      }
    }
  }

  if (!drawn) return null

  const named = (t: CategoryTotal): Part => {
    const cat = categoryById.get(t.categoryId)
    const name = t.name ?? cat?.name ?? 'No category'
    return { key: t.key ?? String(t.categoryId), categoryId: t.categoryId, name, color: t.color ?? cat?.color ?? 'var(--other)', icon: t.icon ?? categoryIcon(name), minor: t.totalMinor, share: t.totalMinor / grand }
  }
  const folded = nonZero.length > MAX_COLUMNS ? nonZero.slice(MAX_COLUMNS - 1).map(named) : []
  const parts: Part[] = nonZero.length <= MAX_COLUMNS ? nonZero.map(named) : nonZero.slice(0, MAX_COLUMNS - 1).map(named)
  if (folded.length > 0) {
    const restMinor = folded.reduce((a, p) => a + p.minor, 0)
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
  const lidPath = `M${CHEST_X} ${BODY_TOP + 4}V${CHEST_Y + 26}C${CHEST_X} ${CHEST_Y + 6} ${CHEST_X + 26} ${CHEST_Y} ${cx} ${CHEST_Y}C${CHEST_RIGHT - 26} ${CHEST_Y} ${CHEST_RIGHT} ${CHEST_Y + 6} ${CHEST_RIGHT} ${CHEST_Y + 26}V${BODY_TOP + 4}Z`
  const id = (s: string) => `${uid}-${s}`
  const bandXs = [CHEST_X + 14, CHEST_RIGHT - 26]
  const innerTop = BOX.top - 36
  const label = open ? 'Close the chest' : 'Open the chest'

  return (
    <div ref={setBox} data-seen={seen} data-open={open} className="when-seen mx-auto w-full max-w-md" data-flow>
      <div className="relative" onPointerMove={onStir} onPointerLeave={() => (stir.current = null)}>
        <svg ref={svg} role="img" aria-label={`${sourceLabel}, ${total}. Where the money went: ${summary}`} viewBox={`0 0 ${W} ${BOTTOM}`} className="block h-auto w-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id={id('wood')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#a8712f" />
              <stop offset="1" stopColor="#6b431c" />
            </linearGradient>
            <linearGradient id={id('lid')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c28a43" />
              <stop offset="1" stopColor="#855426" />
            </linearGradient>
            <linearGradient id={id('inner')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4a2d12" />
              <stop offset="1" stopColor="#2a1708" />
            </linearGradient>
            <linearGradient id={id('gold')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fbe08a" />
              <stop offset="1" stopColor="#c9971c" />
            </linearGradient>
            <radialGradient id={id('coin')} cx="0.35" cy="0.3" r="0.85">
              <stop offset="0" stopColor="#fff3b0" />
              <stop offset="0.55" stopColor="#f1c232" />
              <stop offset="1" stopColor="#b8820f" />
            </radialGradient>
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
          <g data-chest data-open={open} className="flow-chest">
            {/* The inside of the chest, and the lid stood up behind it: both there only once it is open. */}
            <g className="flow-inside">
              <rect x={CHEST_X + 6} y={BOX.top - 2} width={CHEST_W - 12} height={BODY_TOP + 10 - (BOX.top - 2)} rx={5} fill={`url(#${id('inner')})`} stroke="#3f2610" strokeWidth={1.2} />
              <ellipse cx={cx} cy={BODY_TOP - 8} rx={90} ry={34} fill={`url(#${id('glow')})`} />
            </g>
            <g className="flow-lid-in" style={{ transformOrigin: `${cx}px ${BOX.top - 2}px` }}>
              <rect x={CHEST_X + 10} y={innerTop} width={CHEST_W - 20} height={BOX.top - 2 - innerTop} rx={7} fill={`url(#${id('lid')})`} stroke="#3f2610" strokeWidth={1.5} />
              <rect x={CHEST_X + 22} y={innerTop + 5} width={CHEST_W - 44} height={BOX.top - 2 - innerTop - 9} rx={4} fill={`url(#${id('inner')})`} opacity={0.55} />
              {bandXs.map((x) => (
                <rect key={x} x={x - 4} y={innerTop} width={12} height={BOX.top - 2 - innerTop} rx={2} fill={`url(#${id('gold')})`} stroke="#8a6410" strokeWidth={1} />
              ))}
            </g>

            {/* The coins, between the back of the chest and its front. */}
            <g data-coins className="flow-coins">
              {RADII.map((r, i) => (
                <g key={i} data-coin ref={(el) => void (coinEls.current[i] = el)} opacity={0}>
                  <circle r={r} fill={`url(#${id('coin')})`} stroke="#8a6410" strokeWidth={0.9} />
                  <circle r={r * 0.68} fill="none" stroke="#a87a12" strokeOpacity={0.7} strokeWidth={0.8} />
                  <text y={r * 0.36} textAnchor="middle" fontSize={r * 1.05} fontWeight={800} fill="#9a6a0c" aria-hidden="true">
                    {sign}
                  </text>
                  <path d={`M${-r * 0.62} ${-r * 0.34}A${r * 0.7} ${r * 0.7} 0 0 1 ${-r * 0.1} ${-r * 0.7}`} fill="none" stroke="#fff" strokeOpacity={0.75} strokeWidth={1.1} strokeLinecap="round" />
                </g>
              ))}
            </g>

            {/* The front of the chest. */}
            <rect x={CHEST_X} y={BODY_TOP} width={CHEST_W} height={CHEST_H - LID_H} rx={8} fill={`url(#${id('wood')})`} stroke="#3f2610" strokeWidth={1.5} />
            {/* The planks. */}
            <path d={`M${CHEST_X + 2} ${BODY_TOP + 22}H${CHEST_RIGHT - 2}M${CHEST_X + 2} ${BODY_TOP + 38}H${CHEST_RIGHT - 2}`} stroke="#3f2610" strokeOpacity={0.35} strokeWidth={1} />
            {bandXs.map((x) => (
              <rect key={x} x={x} y={BODY_TOP - 2} width={12} height={CHEST_H - LID_H + 2} rx={2} fill={`url(#${id('gold')})`} stroke="#8a6410" strokeWidth={1} />
            ))}
            <rect x={CHEST_X} y={BODY_TOP - 2} width={CHEST_W} height={7} fill={`url(#${id('gold')})`} stroke="#8a6410" strokeWidth={1} />
            <rect x={cx - 11} y={BODY_TOP - 8} width={22} height={22} rx={5} fill={`url(#${id('gold')})`} stroke="#8a6410" strokeWidth={1.2} />
            <circle cx={cx} cy={BODY_TOP + 1} r={3} fill="#4a2f10" />
            <rect x={cx - 1.2} y={BODY_TOP + 2} width={2.4} height={6} rx={1} fill="#4a2f10" />
            <text x={cx} y={BODY_TOP + 47} textAnchor="middle" fontSize={amountSize} fontWeight={800} fill="#fff4d6" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {total}
            </text>

            {/* The lid, down: lifted away when the chest opens. */}
            <g className="flow-lid" style={{ transformOrigin: `${cx}px ${BODY_TOP}px` }}>
              <path d={lidPath} fill={`url(#${id('lid')})`} stroke="#3f2610" strokeWidth={1.5} strokeLinejoin="round" />
              {bandXs.map((x) => (
                <rect key={x} x={x} y={CHEST_Y + 6} width={12} height={LID_H - 4} rx={2} fill={`url(#${id('gold')})`} stroke="#8a6410" strokeWidth={1} />
              ))}
              <rect x={CHEST_X} y={BODY_TOP - 2} width={CHEST_W} height={7} fill={`url(#${id('gold')})`} stroke="#8a6410" strokeWidth={1} />
              <rect x={cx - 11} y={BODY_TOP - 8} width={22} height={22} rx={5} fill={`url(#${id('gold')})`} stroke="#8a6410" strokeWidth={1.2} />
              <circle cx={cx} cy={BODY_TOP + 1} r={3} fill="#4a2f10" />
              <rect x={cx - 1.2} y={BODY_TOP + 2} width={2.4} height={6} rx={1} fill="#4a2f10" />
            </g>
            {/* What it is, written on the lid, which carries it down to the front of the chest, above the total, as the lid goes. */}
            <text className="flow-label" x={cx} y={CHEST_Y + 26} textAnchor="middle" fontSize={12} fontWeight={600} fill="#fff4d6">
              {sourceLabel}
            </text>
            {[
              { x: 118, y: CHEST_Y - 5, r: 6, d: 0 },
              { x: 240, y: CHEST_Y - 3, r: 5, d: 700 },
              { x: 180, y: CHEST_Y - 10, r: 4, d: 1300 },
            ].map((s) => (
              <path key={s.x} className="flow-twinkle" d={sparkle(s.x, s.y, s.r)} fill="#ffd34d" style={{ '--d': `${s.d}ms` } as CSSProperties} />
            ))}
          </g>
        </svg>

        {/* Tapping the chest opens it too. The button beside it is the one that is named, for a keyboard and a screen reader. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={toggle}
          className="absolute cursor-pointer rounded-3xl"
          style={{ left: `${(CHEST_X / W) * 100}%`, width: `${(CHEST_W / W) * 100}%`, top: `${((CHEST_Y - 8) / BOTTOM) * 100}%`, height: `${((CHEST_H + 8) / BOTTOM) * 100}%` }}
        />
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={label}
          className="absolute left-0 top-0 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-xs font-semibold shadow-[0_0_0_1px_var(--ring)] active:opacity-70"
        >
          <Icon name="spark" size={14} />
          {open ? 'Close' : 'Open'}
        </button>
      </div>

      <ul aria-label="Spending by category, as a flow" className="grid list-none p-0" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {parts.map((p, i) => {
          const row = { '--d': `${300 + i * 90}ms` } as CSSProperties
          const isRest = p.key === 'rest'
          const body = (
            <>
              {isRest ? (
                <span
                  aria-hidden="true"
                  data-more={folded.length}
                  className="num mb-1.5 flex size-11 items-center justify-center rounded-full bg-surface-2 text-sm text-ink-2 shadow-[inset_0_0_0_1.5px_var(--edge)]"
                >
                  {`+${folded.length}`}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  data-icon={p.icon}
                  className="mb-1.5 flex size-11 items-center justify-center rounded-full"
                  style={{ background: `color-mix(in oklab, ${p.color} 26%, var(--surface))`, boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${p.color} 45%, transparent)` }}
                >
                  <Icon name={p.icon} size={22} />
                </span>
              )}
              <span className="line-clamp-2 min-h-[2.4em] text-[0.8125rem] font-semibold leading-tight">{p.name}</span>
              <span className="num mt-1 text-base">{formatMoneyCompact(p.minor, currency)}</span>
              <span className="mt-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium tabular-nums text-ink-2">{formatShare(p.share)}</span>
            </>
          )
          const cls = 'flex min-h-11 w-full flex-col items-center px-0.5 pt-2 text-center'
          return (
            <li key={p.key} className="row-in" style={row}>
              {isRest ? (
                <button type="button" onClick={() => setRestOpen((o) => !o)} aria-expanded={restOpen} aria-label={`${p.name}, ${formatMoney(p.minor, currency)}, ${formatShare(p.share)}`} className={`${cls} active:opacity-70`}>
                  {body}
                </button>
              ) : p.categoryId !== null && onPick ? (
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

      {/* Everything that was folded into "Everything else", each with its own icon, amount and share, opening its expenses like the rest. */}
      {restOpen && folded.length > 0 && (
        <ul aria-label="Everything else, by category" className="mt-3 divide-y divide-line rounded-2xl bg-surface-2 px-3">
          {folded.map((p) => {
            const content = (
              <>
                <span
                  aria-hidden="true"
                  data-icon={p.icon}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `color-mix(in oklab, ${p.color} 26%, var(--surface))` }}
                >
                  <Icon name={p.icon} size={18} />
                </span>
                <span className="min-w-0 flex-1 line-clamp-2 text-left font-semibold leading-tight">{p.name}</span>
                <span className="num shrink-0">{formatMoney(p.minor, currency)}</span>
                <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-ink-2">{formatShare(p.share)}</span>
              </>
            )
            return (
              <li key={p.key}>
                {onPick && p.categoryId !== null ? (
                  <button type="button" onClick={() => onPick(p.categoryId!)} aria-label={`${p.name}, ${formatMoney(p.minor, currency)}, ${formatShare(p.share)}. Show these expenses`} className="flex min-h-12 w-full items-center gap-3 py-2 active:opacity-70">
                    {content}
                  </button>
                ) : (
                  <p aria-label={`${p.name}, ${formatMoney(p.minor, currency)}, ${formatShare(p.share)}`} className="flex min-h-12 w-full items-center gap-3 py-2">
                    {content}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
