import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

/** Each drop: where along the number it forms (a share of its width), how long its cycle is, when it first starts, and how big it is. Different cycles, so they do not fall in step. */
export const DROPS = [
  { at: 0.1, dur: 4.6, delay: 0.5, size: 12 },
  { at: 0.36, dur: 5.4, delay: 2.2, size: 9 },
  { at: 0.62, dur: 4.2, delay: 1.2, size: 13 },
  { at: 0.88, dur: 5.8, delay: 3.4, size: 10 },
]

interface Geometry {
  /** The card's size. */
  w: number
  h: number
  /** Where the number is, from the card's top left: its left edge, its bottom edge, and how wide it is. */
  x: number
  y: number
  across: number
}

/** Until the real sizes are known (and where there is no layout at all), a plausible card. */
const GUESS: Geometry = { w: 320, h: 520, x: 20, y: 90, across: 170 }

/** How far `el` is from the top left of `root`, by layout (so a slide or a scale in between does not matter); null when `root` is not above it. */
function offsetWithin(el: HTMLElement, root: HTMLElement): { x: number; y: number } | null {
  let x = 0
  let y = 0
  let node: HTMLElement | null = el
  while (node && node !== root) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return node === root ? { x, y } : null
}

/**
 * Keeps the card's size and the number's place up to date, as the screen is resized or the figures change. It looks again after every
 * draw, because the number can be a new element (a new month is drawn afresh) and may not exist yet when this first runs; it is
 * watched for size changes (the figure counts up, and grows as it does) once it does.
 */
function useGeometry(box: RefObject<HTMLElement | null>, anchor: RefObject<HTMLElement | null>): Geometry {
  const [geo, setGeo] = useState(GUESS)
  const watch = useRef<ResizeObserver | null>(null)

  const read = useCallback(() => {
    const card = box.current?.parentElement
    const target = anchor.current
    if (!card || !target) return
    watch.current?.observe(target)
    const at = offsetWithin(target, card)
    if (!at || card.offsetWidth === 0) return
    const next = { w: card.offsetWidth, h: card.offsetHeight, x: at.x, y: at.y + target.offsetHeight, across: target.offsetWidth }
    setGeo((g) => (g.w === next.w && g.h === next.h && g.x === next.x && g.y === next.y && g.across === next.across ? g : next))
  }, [box, anchor])

  useLayoutEffect(() => {
    read()
  })

  useLayoutEffect(() => {
    const card = box.current?.parentElement
    if (!card || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    watch.current = observer
    observer.observe(card)
    if (anchor.current) observer.observe(anchor.current)
    return () => {
      observer.disconnect()
      watch.current = null
    }
  }, [box, anchor, read])

  return geo
}

interface Props {
  /** The element the drops hang from: the big number. It must be inside the card, which must be positioned. */
  anchor: RefObject<HTMLElement | null>
  /** The water's colour. */
  color?: string
  /** Drip faster, for when the budget is passed. */
  fast?: boolean
}

/**
 * Drops of water that form under the spent figure, hang there swelling, let go and fall (slowly at first, then faster, stretching
 * as they speed up) to the bottom of the card, where each one splashes: a ring opens where it landed, two small drops are thrown
 * up and fall back, and a film of water runs out from that spot to both edges of the card. Four of them, on cycles of different
 * lengths, so there is always something happening but never in step.
 *
 * Everything is a transform or an opacity on a CSS animation, so it costs the page nothing to keep running (and it stops with the
 * page that is not in view), and it is not drawn at all when motion is reduced.
 */
export function WaterDrops({ anchor, color = 'var(--accent)', fast = false }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const { w, h, x, y, across } = useGeometry(box, anchor)
  // It lands just above the card's own border: the biggest drop is about 22px long once it is stretched, so it stops that far short.
  const fall = Math.max(0, h - y - 34)

  return (
    <div ref={box} aria-hidden="true" data-water-drops className="water-drops pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[24px]" style={{ '--water': color } as CSSProperties}>
      {fall > 40 &&
        DROPS.map((d, i) => {
          const left = x + d.at * across
          const style = {
            left,
            top: y,
            '--fall': `${fall}px`,
            '--dur': `${fast ? d.dur * 0.65 : d.dur}s`,
            '--delay': `${d.delay}s`,
            '--size': `${d.size}px`,
          } as CSSProperties
          return (
            <div key={i} data-drop={i} className="absolute" style={style}>
              <span className="water-drop" />
              {/* Where it lands: everything below is placed at the foot of its fall. */}
              <span className="water-ring" />
              <span className="water-spray water-spray-left" />
              <span className="water-spray water-spray-right" />
              {/* The film runs the whole width of the card from where the drop landed, so its origin is that spot. */}
              <span className="water-film" style={{ left: -left, width: w, transformOrigin: `${left}px 50%` }} />
            </div>
          )
        })}
    </div>
  )
}
