import { useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { BUDGET_SKY, budgetTone } from '../charts/budgetTone'
import { useIntro } from './motion'

/** One wave as a tile that repeats: the surface rises and falls once in 28 pixels, and meets itself at both ends. */
const WAVE = 'M0 4C7 -0.5 7 -0.5 14 4C21 8.5 21 8.5 28 4V0H0Z'

/** A strip of wave. It is drawn in the colour of what is above the water (`--wave-sky`), so what shows below it is the water's own wavy surface. */
function Wave({ id, className }: { id: string; className: string }) {
  return (
    <svg aria-hidden="true" className={`water-wave ${className}`} height="8" width="100%" style={{ width: 'calc(100% + 28px)' }}>
      <defs>
        <pattern id={id} width="28" height="8" patternUnits="userSpaceOnUse">
          <path d={WAVE} />
        </pattern>
      </defs>
      <rect width="100%" height="8" fill={`url(#${id})`} />
    </svg>
  )
}

/**
 * The rolling surface: two waves, one behind the other, sliding along in opposite ways, and sloshing up and settling when they
 * come into view, like a bottle just filled and shaken. Put it at the top edge of the water, inside something that clips it, and
 * set `--wave-sky` on a parent to the colour above the water.
 */
export function WaveCover() {
  const id = useId().replace(/:/g, '')
  return (
    <span aria-hidden="true" className="water-slosh absolute inset-x-0 top-0">
      <Wave id={`${id}-b`} className="water-wave-back" />
      <Wave id={`${id}-f`} className="water-wave-front" />
    </span>
  )
}

/** How thick the line is, and the corner radius of the card it goes around (the card's own corners are set to this, in pixels, so they match). */
const LINE = 3
export const CARD_RADIUS = 24

/** The path of a rounded rectangle from its top left corner, clockwise, which is the way the line grows. */
export function roundedRect(w: number, h: number, r: number): string {
  const k = Math.max(0, Math.min(r, w / 2, h / 2))
  const arc = `A${k} ${k} 0 0 1`
  return `M${k} 0H${w - k}${arc} ${w} ${k}V${h - k}${arc} ${w - k} ${h}H${k}${arc} 0 ${h - k}V${k}${arc} ${k} 0Z`
}

/** The size an element has, kept up to date as it changes. Until it is known (and where there is no layout at all) a plain square. */
function useBox(ref: RefObject<Element | null>): { w: number; h: number } {
  const [box, setBox] = useState({ w: 320, h: 320 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setBox((b) => (b.w === r.width && b.h === r.height ? b : { w: r.width, h: r.height }))
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(read)
    watch.observe(el)
    return () => watch.disconnect()
  }, [ref])
  return box
}

/**
 * The outline of a card as a gauge, drawn right on its border: a line in the budget's colour grows around the card (from the top
 * left, clockwise) as far as the share of the budget that is spent, and goes all the way round, in red, once it is passed. Water
 * runs along the filled part: ripples travelling one way and a fainter set the other. The first time the app shows it the line fills
 * from nothing; later it moves to a new share. Put it inside the card, which must be positioned; it takes no clicks.
 *
 * It is a path of the card's measured size, with its length given as 1, so every dash below is a share of the way round.
 */
export function WaterBorder({ ratio }: { ratio: number }) {
  const id = useId().replace(/:/g, '')
  const rise = useIntro()
  const svg = useRef<SVGSVGElement>(null)
  const { w, h } = useBox(svg)
  const { over, fill } = budgetTone(ratio)
  // Never quite empty, so a little spent still shows, and never past the full round.
  const share = Math.min(1, Math.max(0.03, ratio))
  const dash = `${share} 1`
  const edge = { d: roundedRect(w, h, CARD_RADIUS - LINE / 2), pathLength: 1, fill: 'none', strokeWidth: LINE } as const

  return (
    <svg
      ref={svg}
      aria-hidden="true"
      data-water-border
      data-level={Math.round(ratio * 100)}
      data-over={over || undefined}
      className="pointer-events-none absolute overflow-visible"
      style={{ left: LINE / 2, top: LINE / 2, width: `calc(100% - ${LINE}px)`, height: `calc(100% - ${LINE}px)` }}
    >
      <defs>
        {/* The ripples are only shown where the line is filled. */}
        <mask id={id}>
          <path {...edge} stroke="#fff" strokeLinecap="round" strokeDasharray={dash} className="water-border-fill" />
        </mask>
      </defs>
      <path {...edge} stroke={BUDGET_SKY} />
      <path {...edge} stroke={fill} strokeLinecap="round" strokeDasharray={dash} className="water-border-fill" data-rise={rise || undefined} />
      <g mask={`url(#${id})`}>
        <path {...edge} stroke="#fff" strokeOpacity="0.5" strokeDasharray="0.014 0.046" className="water-border-flow" />
        <path {...edge} stroke="#fff" strokeOpacity="0.3" strokeWidth={LINE / 2} strokeDasharray="0.02 0.08" className="water-border-flow-back" />
      </g>
    </svg>
  )
}
