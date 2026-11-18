import { useCallback, useEffect, useId, useMemo, useRef, type CSSProperties, type PointerEvent } from 'react'
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
  categoryId: number
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
/** Up to this many categories each have a column of their own under their line; with more, every line still lands and the names are listed below. */
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
 * The chest is open from the start, with no button to close it: the lid is lifted back and gold coins pour in and lie in it, as coins do:
 * each has its own weight and size, falls, bounces, rolls and turns as it rolls, and knocks the others about (see coinPhysics).
 * Tip the phone and they slide down the way it tips, push it and they slosh the other way, shake it and they fly about and settle
 * again; on a computer, drag a finger or the mouse through them. With reduced motion the coins are simply there, on a settled pile.
 *
 * Every category has its line, none folded away. Up to five have a column of their own under their line: the category's icon,
 * name, amount and share, which opens that category's expenses. With more, the lines are thinner and uneven (a bigger spend is
 * a clearly thicker line) and land side by side, and every category is listed under them in the same order with its icon,
 * amount and share, opening its expenses too.
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

  // The chest is always open, with no button to close it: the coins in it, and the pieces of the picture they are drawn with.
  const open = true
  const openRef = useRef(true)
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
      return ({ x, y, shake, seconds, sensors }) => {
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
          step(w, dt, { ...pullFrom(sensors), shake })
          paint()
        } else last = 0
      }
    },
  })

  // The coins are poured in as the chest is first drawn, and fall once the chart is on screen (that is when the clock for them runs);
  // with reduced motion they are simply there, settled.
  useEffect(() => {
    const w = pour(COINS, BOX, 7)
    world.current = w
    if (!motionAllowed()) {
      settle(w, pullFrom(tilt))
      w.time = 99
    }
    paint()
  }, [paint])

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
  const parts: Part[] = nonZero.map(named)
  const many = parts.length > MAX_COLUMNS

  const n = parts.length
  const colW = W / n
  const lines = parts.map((p, i) => {
    // Each leaves the chest at its own place along its base, in the order of the columns, and lands in the middle of its column.
    const sx = (W - SOURCE_W) / 2 + (SOURCE_W / n) * (i + 0.5)
    const ex = colW * (i + 0.5)
    return { part: p, d: linePath(sx, ex, 0, 0), from: sx, ex, width: many ? num(2 + p.share * 18) : num(3.5 + p.share * 8) }
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
  const innerTop = 8
  const hingeY = BODY_TOP - 33
  const openLid = `M${CHEST_X + 9} ${hingeY}L${CHEST_X + 7} ${innerTop + 22}Q${CHEST_X + 5} ${innerTop} ${cx} ${innerTop}Q${CHEST_RIGHT - 5} ${innerTop} ${CHEST_RIGHT - 7} ${innerTop + 22}L${CHEST_RIGHT - 9} ${hingeY}Z`
  const lidPanel = `M${CHEST_X + 28} ${hingeY - 8}L${CHEST_X + 26} ${innerTop + 24}Q${CHEST_X + 25} ${innerTop + 12} ${cx} ${innerTop + 12}Q${CHEST_RIGHT - 25} ${innerTop + 12} ${CHEST_RIGHT - 26} ${innerTop + 24}L${CHEST_RIGHT - 28} ${hingeY - 8}Z`

  return (
    <div ref={setBox} data-seen={seen} data-open={open} className="when-seen mx-auto w-full max-w-md" data-flow>
      <div className="relative" onPointerMove={onStir} onPointerLeave={() => (stir.current = null)}>
        <svg ref={svg} role="img" aria-label={`${sourceLabel}, ${total}. Where the money went: ${summary}`} viewBox={`0 0 ${W} ${BOTTOM}`} className="block h-auto w-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id={id('wood')} x1="0" y1="0" x2="0.15" y2="1">
              <stop offset="0" stopColor="#9c643d" />
              <stop offset="0.18" stopColor="#885232" />
              <stop offset="0.75" stopColor="#653c28" />
              <stop offset="1" stopColor="#422a20" />
            </linearGradient>
            <linearGradient id={id('lid')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d69a56" />
              <stop offset="0.45" stopColor="#a56835" />
              <stop offset="1" stopColor="#693923" />
            </linearGradient>
            <linearGradient id={id('inner')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#201813" />
              <stop offset="0.45" stopColor="#3c281c" />
              <stop offset="1" stopColor="#7e5529" />
            </linearGradient>
            <linearGradient id={id('gold')} x1="0" y1="0" x2="1" y2="0.2">
              <stop offset="0" stopColor="#755020" />
              <stop offset="0.16" stopColor="#c49b50" />
              <stop offset="0.3" stopColor="#f4dfa0" />
              <stop offset="0.43" stopColor="#d9b66a" />
              <stop offset="0.78" stopColor="#a47a36" />
              <stop offset="1" stopColor="#6e4e24" />
            </linearGradient>
            <linearGradient id={id('side')} x1="0" y1="0" x2="1" y2="0.5">
              <stop stopColor="#65412c" />
              <stop offset="1" stopColor="#30231c" />
            </linearGradient>
            <linearGradient id={id('lid-panel')} x1="0" y1="0" x2="0.3" y2="1">
              <stop stopColor="#38261d" />
              <stop offset="0.22" stopColor="#63412b" />
              <stop offset="0.8" stopColor="#805333" />
              <stop offset="1" stopColor="#4a3021" />
            </linearGradient>
            <linearGradient id={id('rim')} x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#f5e1ae" />
              <stop offset="0.18" stopColor="#d7b875" />
              <stop offset="0.55" stopColor="#b28a47" />
              <stop offset="1" stopColor="#5b3e1f" />
            </linearGradient>
            <radialGradient id={id('shadow')}>
              <stop stopColor="#1f150e" stopOpacity="0.4" />
              <stop offset="1" stopColor="#1f150e" stopOpacity="0" />
            </radialGradient>
            <pattern id={id('grain')} width="72" height="22" patternUnits="userSpaceOnUse">
              <path d="M-8 4Q12 0 32 4T80 3M-5 9Q8 5 22 9T53 10T80 8M-6 17Q17 12 40 17T79 16M26 21Q47 17 68 21" fill="none" stroke="#edc08b" strokeWidth="0.7" />
              <path d="M-5 6Q15 2 34 6T80 5M0 19Q23 14 43 19T79 18" fill="none" stroke="#27190f" strokeWidth="0.8" />
              <ellipse cx="49" cy="9" rx="7" ry="1.6" fill="none" stroke="#2b1b13" strokeWidth="0.7" />
              <path d="M46 9H51" stroke="#2b1b13" strokeWidth="0.6" />
            </pattern>
            <clipPath id={id('lid-clip')}><path d={openLid} /></clipPath>
            <linearGradient id={id('coin')} x1="0" y1="0" x2="0.85" y2="1">
              <stop offset="0" stopColor="#fff4bd" />
              <stop offset="0.3" stopColor="#f7d365" />
              <stop offset="0.48" stopColor="#ffe999" />
              <stop offset="0.7" stopColor="#e8ae32" />
              <stop offset="1" stopColor="#a86913" />
            </linearGradient>
            <radialGradient id={id('coin-face')} cx="0.35" cy="0.25" r="0.8">
              <stop stopColor="#ffeaa0" />
              <stop offset="0.6" stopColor="#efbd43" />
              <stop offset="1" stopColor="#cc8c21" />
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
            <ellipse cx={cx + 9} cy={CHEST_Y + CHEST_H + 4} rx={128} ry={12} fill={`url(#${id('shadow')})`} />
            <path d={`M${CHEST_RIGHT - 3} ${BODY_TOP + 1}L${CHEST_RIGHT + 20} ${BODY_TOP - 16}V${CHEST_Y + CHEST_H - 19}Q${CHEST_RIGHT + 20} ${CHEST_Y + CHEST_H - 15} ${CHEST_RIGHT + 16} ${CHEST_Y + CHEST_H - 12}L${CHEST_RIGHT - 7} ${CHEST_Y + CHEST_H}Z`} fill={`url(#${id('side')})`} stroke="#35251b" strokeWidth="1.2" />
            {[22, 40, 57].map((y) => (
              <path key={y} d={`M${CHEST_RIGHT} ${BODY_TOP + y}L${CHEST_RIGHT + 18} ${BODY_TOP + y - 14}`} stroke="#1f1712" strokeOpacity="0.65" strokeWidth="1.2" />
            ))}
            <path d={`M${CHEST_RIGHT + 13} ${BODY_TOP - 8}V${CHEST_Y + CHEST_H - 12}`} stroke="#a17c42" strokeWidth="5" />
            <path d={`M${CHEST_RIGHT + 11} ${BODY_TOP - 7}V${CHEST_Y + CHEST_H - 11}`} stroke="#e6c888" strokeOpacity="0.45" strokeWidth="0.8" />
            <ellipse cx={CHEST_RIGHT + 8} cy={BODY_TOP + 20} rx="3.4" ry="8" fill="none" stroke="#211811" strokeWidth="4" />
            <ellipse cx={CHEST_RIGHT + 8} cy={BODY_TOP + 19} rx="3.4" ry="8" fill="none" stroke="#b79559" strokeWidth="2" />
            {/* The inside of the chest, and the lid stood up behind it: both there only once it is open. */}
            <g className="flow-inside">
              <path d={`M${CHEST_X + 12} ${hingeY - 1}H${CHEST_RIGHT - 8}L${CHEST_RIGHT + 20} ${BODY_TOP - 16}L${CHEST_RIGHT} ${BODY_TOP + 7}H${CHEST_X}Z`} fill={`url(#${id('inner')})`} stroke="#563a24" strokeWidth="2" />
              <path d={`M${CHEST_X + 12} ${hingeY + 2}L${CHEST_X + 2} ${BODY_TOP}M${CHEST_RIGHT - 8} ${hingeY + 2}L${CHEST_RIGHT + 19} ${BODY_TOP - 16}L${CHEST_RIGHT - 2} ${BODY_TOP}`} fill="none" stroke={`url(#${id('rim')})`} strokeWidth="5" strokeLinejoin="round" />
              <ellipse cx={cx} cy={BODY_TOP - 4} rx={86} ry={21} fill={`url(#${id('glow')})`} opacity="0.55" />
            </g>
            <g className="flow-lid-in" style={{ transformOrigin: `${cx}px ${hingeY}px` }}>
              <path d={openLid} transform="translate(5 3)" fill="#493022" stroke="#38261c" strokeWidth="3" />
              <path d={openLid} fill={`url(#${id('lid')})`} stroke={`url(#${id('rim')})`} strokeWidth="4" />
              <path d={lidPanel} fill={`url(#${id('lid-panel')})`} stroke="#3b271b" strokeWidth="2" />
              <path d={lidPanel} fill={`url(#${id('grain')})`} opacity="0.25" />
              <path d={`M${CHEST_X + 28} ${innerTop + 31}Q${cx} ${innerTop + 27} ${CHEST_RIGHT - 28} ${innerTop + 31}M${CHEST_X + 29} ${innerTop + 44}H${CHEST_RIGHT - 29}`} fill="none" stroke="#291b14" strokeOpacity="0.45" strokeWidth="1" />
              <path d={`M${CHEST_X + 30} ${hingeY - 7}H${CHEST_RIGHT - 30}`} stroke="#d5a46a" strokeOpacity="0.55" strokeWidth="1" />
              <g clipPath={`url(#${id('lid-clip')})`}>
                {bandXs.map((x) => (
                  <g key={x}>
                    <path d={`M${x - 1} ${innerTop}Q${x - 4} ${innerTop + 26} ${x + 2} ${hingeY}H${x + 12}Q${x + 6} ${innerTop + 26} ${x + 10} ${innerTop}Z`} fill={`url(#${id('gold')})`} stroke="#7a592d" strokeWidth="0.8" />
                    {[17, 47].map((y) => (
                      <g key={y}>
                        <circle cx={x + 5} cy={innerTop + y} r="1.8" fill="#674922" />
                        <circle cx={x + 4.7} cy={innerTop + y - 0.4} r="1.1" fill="#e4c68a" />
                      </g>
                    ))}
                  </g>
                ))}
              </g>
              <path d={`M${CHEST_X + 13} ${hingeY - 1}H${CHEST_RIGHT - 13}`} stroke="#281c14" strokeWidth="3" />
              {[CHEST_X + 38, CHEST_RIGHT - 55].map((x) => (
                <g key={x}>
                  <rect x={x} y={hingeY - 3} width="17" height="5" rx="2" fill={`url(#${id('rim')})`} stroke="#5f4423" strokeWidth="0.7" />
                  <path d={`M${x + 5} ${hingeY - 3}V${hingeY + 2}M${x + 11} ${hingeY - 3}V${hingeY + 2}`} stroke="#694c2a" strokeWidth="0.7" />
                </g>
              ))}
            </g>

            {/* The coins, between the back of the chest and its front. */}
            <g data-coins className="flow-coins">
              {RADII.map((r, i) => (
                <g key={i} data-coin ref={(el) => void (coinEls.current[i] = el)} opacity={0}>
                  <circle cy={1.3} r={r} fill="#9b6018" stroke="#784711" strokeWidth="0.7" />
                  <circle r={r} fill={`url(#${id('coin')})`} stroke="#c28a27" strokeWidth="0.7" />
                  <circle r={r * 0.84} fill="none" stroke="#9e671b" strokeOpacity="0.65" strokeWidth="0.9" pathLength="80" strokeDasharray="1 3" />
                  <circle r={r * 0.69} fill={`url(#${id('coin-face')})`} stroke="#fff0ab" strokeWidth="0.7" />
                  <circle r={r * 0.61} fill="none" stroke="#b77c20" strokeOpacity="0.65" strokeWidth="0.5" />
                  <text y={r * 0.35} textAnchor="middle" fontSize={r * 1.03} fontWeight={800} fill="#996019" stroke="#ffeaa1" strokeWidth="0.45" paintOrder="stroke" aria-hidden="true">
                    {sign}
                  </text>
                  <path d={`M${-r * 0.84} ${-r * 0.25}A${r * 0.88} ${r * 0.88} 0 0 1 ${r * 0.35} ${-r * 0.8}`} fill="none" stroke="#fff8d5" strokeOpacity="0.9" strokeWidth="1.1" strokeLinecap="round" />
                  <path d={`M${r * 0.8} ${r * 0.3}A${r * 0.86} ${r * 0.86} 0 0 1 ${-r * 0.2} ${r * 0.84}`} fill="none" stroke="#9e6317" strokeWidth="0.8" strokeLinecap="round" />
                </g>
              ))}
            </g>

            {/* The front of the chest. */}
            <rect x={CHEST_X} y={BODY_TOP} width={CHEST_W} height={CHEST_H - LID_H} rx={8} fill={`url(#${id('wood')})`} stroke="#3f2610" strokeWidth={1.5} />
            <rect x={CHEST_X + 2} y={BODY_TOP + 4} width={CHEST_W - 4} height={CHEST_H - LID_H - 7} rx="6" fill={`url(#${id('grain')})`} opacity="0.22" />
            {/* The planks. */}
            <path d={`M${CHEST_X + 2} ${BODY_TOP + 22}H${CHEST_RIGHT - 2}M${CHEST_X + 2} ${BODY_TOP + 38}H${CHEST_RIGHT - 2}`} stroke="#3f2610" strokeOpacity={0.35} strokeWidth={1} />
            {[23, 39].map((y) => (
              <path key={y} d={`M${CHEST_X + 3} ${BODY_TOP + y}H${CHEST_RIGHT - 3}`} stroke="#d5a071" strokeOpacity="0.2" strokeWidth="0.7" />
            ))}
            <rect x={CHEST_X + 35} y={BODY_TOP + 16} width={CHEST_W - 70} height={39} rx="4" fill="#231b16" fillOpacity="0.48" stroke="#c39a62" strokeOpacity="0.45" strokeWidth="0.8" />
            {[CHEST_X + 40, CHEST_RIGHT - 40].map((x) => (
              <circle key={x} cx={x} cy={BODY_TOP + 35} r="1.1" fill="#c5a46d" />
            ))}
            {bandXs.map((x) => (
              <g key={x}>
                <rect x={x} y={BODY_TOP - 2} width={12} height={CHEST_H - LID_H + 2} rx={2} fill={`url(#${id('gold')})`} stroke="#8a6410" strokeWidth={1} />
                <path d={`M${x + 2} ${BODY_TOP + 8}V${CHEST_Y + CHEST_H - 5}`} stroke="#fff0b7" strokeOpacity="0.6" strokeWidth="0.8" />
                {[11, 48].map((y) => (
                  <g key={y}>
                    <circle cx={x + 6} cy={BODY_TOP + y} r="2" fill="#8b591c" />
                    <circle cx={x + 5.6} cy={BODY_TOP + y - 0.5} r="1.2" fill="#ffdf8a" />
                  </g>
                ))}
              </g>
            ))}
            <path d={`M${CHEST_X + 4} ${BODY_TOP + 8}H${CHEST_RIGHT - 4}`} stroke="#281b12" strokeOpacity="0.65" strokeWidth="3" />
            <rect x={CHEST_X - 1} y={BODY_TOP - 3} width={CHEST_W + 2} height={9} rx="2" fill={`url(#${id('rim')})`} stroke="#77572c" strokeWidth="0.8" />
            <path d={`M${CHEST_X + 2} ${BODY_TOP - 2}H${CHEST_RIGHT - 2}`} stroke="#fff0c8" strokeOpacity="0.8" strokeWidth="1" />
            <path d={`M${CHEST_X + 6} ${CHEST_Y + CHEST_H - 4}H${CHEST_RIGHT - 6}`} stroke="#281c14" strokeWidth="4" strokeLinecap="round" />
            <path d={`M${CHEST_X + 7} ${CHEST_Y + CHEST_H - 5}H${CHEST_RIGHT - 7}`} stroke="#c59a56" strokeOpacity="0.6" strokeWidth="1" strokeLinecap="round" />
            {[CHEST_X + 1, CHEST_RIGHT - 17].map((x) => (
              <path key={x} d={`M${x} ${CHEST_Y + CHEST_H - 14}V${CHEST_Y + CHEST_H - 6}Q${x} ${CHEST_Y + CHEST_H} ${x + 6} ${CHEST_Y + CHEST_H}H${x + 16}V${CHEST_Y + CHEST_H - 4}H${x + 6}V${CHEST_Y + CHEST_H - 14}Z`} fill={`url(#${id('gold')})`} stroke="#634821" strokeWidth="0.6" />
            ))}
            <rect x={cx - 11} y={BODY_TOP - 7} width={24} height={23} rx="5" fill="#291d12" opacity="0.45" transform="translate(1 1)" />
            <rect x={cx - 11} y={BODY_TOP - 8} width={22} height={22} rx={5} fill={`url(#${id('gold')})`} stroke="#8a6410" strokeWidth={1.2} />
            <rect x={cx - 8} y={BODY_TOP - 5} width={16} height={16} rx="3" fill="none" stroke="#fff0b0" strokeOpacity="0.65" strokeWidth="0.8" />
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
              { x: 118, y: hingeY + 8, r: 3, d: 0 },
              { x: 240, y: hingeY + 3, r: 2.5, d: 700 },
              { x: 180, y: hingeY - 3, r: 2, d: 1300 },
            ].map((s) => (
              <path key={s.x} className="flow-twinkle" d={sparkle(s.x, s.y, s.r)} fill="#ffd34d" style={{ '--d': `${s.d}ms` } as CSSProperties} />
            ))}
          </g>
        </svg>
      </div>

      {many ? (
        // Too many for a column each: every category in a list, in the order of the lines, each with the colour of its line.
        <ul aria-label="Spending by category, as a flow" className="mt-3 divide-y divide-line rounded-2xl bg-surface-2 px-3">
          {parts.map((p, i) => {
            const label = `${p.name}, ${formatMoney(p.minor, currency)}, ${formatShare(p.share)}`
            const content = (
              <>
                <span
                  aria-hidden="true"
                  data-icon={p.icon}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `color-mix(in oklab, ${p.color} 26%, var(--surface))`, boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${p.color} 45%, transparent)` }}
                >
                  <Icon name={p.icon} size={18} />
                </span>
                <span className="min-w-0 flex-1 line-clamp-2 text-left font-semibold leading-tight">{p.name}</span>
                <span className="num shrink-0">{formatMoney(p.minor, currency)}</span>
                <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-ink-2">{formatShare(p.share)}</span>
              </>
            )
            return (
              <li key={p.key} className="row-in" style={{ '--d': `${300 + i * 60}ms` } as CSSProperties}>
                {onPick ? (
                  <button type="button" onClick={() => onPick(p.categoryId)} aria-label={`${label}. Show these expenses`} className="flex min-h-12 w-full items-center gap-3 py-2 active:opacity-70">
                    {content}
                  </button>
                ) : (
                  <p aria-label={label} className="flex min-h-12 w-full items-center gap-3 py-2">
                    {content}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <ul aria-label="Spending by category, as a flow" className="grid list-none p-0" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {parts.map((p, i) => {
            const row = { '--d': `${300 + i * 90}ms` } as CSSProperties
            const body = (
              <>
                <span
                  aria-hidden="true"
                  data-icon={p.icon}
                  className="mb-1.5 flex size-11 items-center justify-center rounded-full"
                  style={{ background: `color-mix(in oklab, ${p.color} 26%, var(--surface))`, boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${p.color} 45%, transparent)` }}
                >
                  <Icon name={p.icon} size={22} />
                </span>
                <span className="line-clamp-2 min-h-[2.4em] text-[0.8125rem] font-semibold leading-tight">{p.name}</span>
                <span className="num mt-1 text-base">{formatMoneyCompact(p.minor, currency)}</span>
                <span className="mt-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium tabular-nums text-ink-2">{formatShare(p.share)}</span>
              </>
            )
            const cls = 'flex min-h-11 w-full flex-col items-center px-0.5 pt-2 text-center'
            const label = `${p.name}, ${formatMoney(p.minor, currency)}, ${formatShare(p.share)}`
            return (
              <li key={p.key} className="row-in" style={row}>
                {onPick ? (
                  <button type="button" onClick={() => onPick(p.categoryId)} aria-label={`${label}. Show these expenses`} className={`${cls} active:opacity-70`}>
                    {body}
                  </button>
                ) : (
                  <p aria-label={label} className={cls}>
                    {body}
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
