import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'

export type HomeView = 'overview' | 'timeline'

const TABS: { id: HomeView; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
]

/** How long the slide takes, and a little more for the page underneath to settle before the other is folded away. */
const MOVE_MS = 380
/** The movement before it is clear which way the finger is going, and how much more sideways than up or down it must be. */
const DECIDE = 10
const SLOPE = 1.5
/** A flick faster than this (pixels a millisecond) goes over whatever the distance. */
const FLICK = 0.45

interface Track {
  x: number
  y: number
  at: number
  width: number
  mode: 'unsure' | 'sideways' | 'scrolling'
}

/**
 * Whether something between the touch and the pager has its own use for a sideways drag: a chart you drag across, the card that
 * changes month, a row that scrolls along. Those keep their gesture, and the page is not moved from them.
 */
function ownsGesture(from: EventTarget | null, pager: Element): boolean {
  for (let el = from as Element | null; el && el !== pager; el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue
    if (el.classList.contains('touch-pan-y') || el.dataset.noPager !== undefined) return true
    const overflow = getComputedStyle(el).overflowX
    if ((overflow === 'auto' || overflow === 'scroll') && el.scrollWidth > el.clientWidth) return true
  }
  return false
}

interface Props {
  overview: ReactNode
  /** Built only once it has been opened, so a day-by-day history is not worked out for someone who never looks. */
  timeline: ReactNode
}

/**
 * Home as two pages side by side: the overview, and the timeline of the days behind you. A pair of tabs at the top moves
 * between them, and so does dragging the page sideways: the page follows the finger, and lets go to the nearer one (or the
 * way a quick flick was going). The tab's marker slides along with it. Only the page in view takes up room, so the screen is
 * as long as that page; reduced motion swaps them without sliding.
 */
export function HomePager({ overview, timeline }: Props) {
  const [view, setView] = useState<HomeView>('overview')
  const [visited, setVisited] = useState(false)
  const [drag, setDrag] = useState(0)
  const [dragging, setDragging] = useState(false)
  // How wide the page is while it is being dragged, to turn the distance into how far along the tabs the marker is.
  const [width, setWidth] = useState(1)
  // True while the slide plays, when both pages must keep their height.
  const [moving, setMoving] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const track = useRef<Track | null>(null)
  const swallow = useRef(false)
  const timer = useRef(0)
  const index = view === 'overview' ? 0 : 1

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function go(next: HomeView) {
    if (next === view) return
    if (next === 'timeline') setVisited(true)
    setMoving(true)
    setView(next)
    if (window.scrollY > 0) window.scrollTo({ top: 0 })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMoving(false), MOVE_MS + 60)
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' || !box.current || ownsGesture(e.target, box.current)) return
    track.current = { x: e.clientX, y: e.clientY, at: e.timeStamp, width: box.current.clientWidth, mode: 'unsure' }
  }

  function onPointerMove(e: PointerEvent) {
    const t = track.current
    if (!t || t.mode === 'scrolling') return
    const dx = e.clientX - t.x
    if (t.mode === 'unsure') {
      const ax = Math.abs(dx)
      const ay = Math.abs(e.clientY - t.y)
      if (ax > DECIDE && ax > ay * SLOPE) {
        t.mode = 'sideways'
        if (index === 0) setVisited(true)
        setWidth(t.width)
        setDragging(true)
      } else if (ay > DECIDE && ay >= ax) t.mode = 'scrolling'
      else return
    }
    // Past the first or the last page it gives only a little, and springs back.
    const beyond = (index === 0 && dx > 0) || (index === 1 && dx < 0)
    setDrag(beyond ? dx * 0.25 : dx)
  }

  function finish(e: PointerEvent | null) {
    const t = track.current
    track.current = null
    if (!t || t.mode !== 'sideways') return
    setDragging(false)
    setDrag(0)
    // The click that follows letting go of a drag must not press the button the finger ended on.
    swallow.current = true
    window.setTimeout(() => (swallow.current = false), 120)
    if (!e) return
    const dx = e.clientX - t.x
    const speed = Math.abs(dx) / Math.max(e.timeStamp - t.at, 1)
    const far = Math.abs(dx) > Math.max(56, t.width * 0.22) || (speed > FLICK && Math.abs(dx) > 24)
    if (!far) return
    if (index === 0 && dx < 0) go('timeline')
    else if (index === 1 && dx > 0) go('overview')
  }

  const progress = Math.min(1, Math.max(0, index - (dragging ? drag / Math.max(width, 1) : 0)))
  // Folded away once at rest, so the page is as long as the one you are on.
  const rest = !moving && !dragging

  return (
    <div
      ref={box}
      className="touch-pan-y"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={() => finish(null)}
      onClickCapture={(e) => {
        if (!swallow.current) return
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <div role="group" aria-label="Home view" className="relative mt-3 grid grid-cols-2 rounded-full bg-surface-2 p-1" style={{ '--p': progress } as CSSProperties}>
        <span aria-hidden="true" data-dragging={dragging} className="pager-pill absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-btn" />
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={view === tab.id}
            onClick={() => go(tab.id)}
            className={`relative min-h-11 rounded-full px-3 text-sm font-semibold transition-colors motion-reduce:transition-none ${view === tab.id ? 'text-btn-ink' : 'text-ink-2'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-clip">
        <div className="pager-track" data-dragging={dragging} style={{ '--i': index, '--drag': `${drag}px` } as CSSProperties}>
          <div data-page="overview" data-rest={rest && index !== 0} inert={rest && index !== 0} className="pager-panel">
            {overview}
          </div>
          <div data-page="timeline" data-rest={rest && index !== 1} inert={rest && index !== 1} className="pager-panel">
            {visited && timeline}
          </div>
        </div>
      </div>
    </div>
  )
}
