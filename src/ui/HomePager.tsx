import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { onHomeViewRequest, takeWaitingHomeView } from './homeView'

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
/** How long after the first screen is up, at most, the timeline waits to be built behind the scenes. */
const WARM_UP_MS = 2500

interface Gesture {
  x: number
  y: number
  at: number
  width: number
  mode: 'unsure' | 'sideways' | 'scrolling'
}

/**
 * Where the pages are, as a transform written onto the element itself. It is not a custom property on purpose: those are inherited,
 * so changing one on the track would make the browser work out the style of everything inside both pages again, at every move of the
 * finger. A transform is not inherited, and moves on the graphics card without touching the pages at all.
 */
const trackTransform = (index: number, px = 0) => `translate3d(calc(${-index * 100}% + ${px}px), 0, 0)`
const pillTransform = (progress: number) => `translate3d(${progress * 100}%, 0, 0)`

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

/** Runs `work` when the browser has nothing better to do, or after `within` milliseconds at the latest; returns how to cancel it. */
function whenIdle(work: () => void, within: number): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(work, { timeout: within })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(work, Math.min(within, 1200))
  return () => window.clearTimeout(id)
}

interface Props {
  overview: ReactNode
  /** Built behind the scenes shortly after the first screen is up (or at once if it is asked for), so opening it does not stall the slide. */
  timeline: ReactNode
}

/**
 * Home as two pages side by side: the overview, and the timeline of the days behind you. A pair of tabs at the top moves
 * between them, and so does dragging the page sideways: the page follows the finger, and lets go to the nearer one (or the
 * way a quick flick was going). The tab's marker slides along with it. Only the page in view takes up room, so the screen is
 * as long as that page, and the other is not laid out or drawn at all; reduced motion swaps them without sliding.
 *
 * It stays smooth because a drag never goes through React: the position is written straight onto the track and the marker, and the
 * component only redraws when a drag starts and when it ends, not at every move of the finger.
 */
export function HomePager({ overview, timeline }: Props) {
  // Home opens on the overview, unless the bottom bar was just swiped from another screen towards the timeline.
  const [view, setView] = useState<HomeView>(() => takeWaitingHomeView() ?? 'overview')
  const [built, setBuilt] = useState(view === 'timeline')
  const [dragging, setDragging] = useState(false)
  // True while the slide plays, when both pages must keep their height.
  const [moving, setMoving] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const trackEl = useRef<HTMLDivElement>(null)
  const pillEl = useRef<HTMLSpanElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const swallow = useRef(false)
  const timer = useRef(0)
  const index = view === 'overview' ? 0 : 1

  useEffect(() => () => window.clearTimeout(timer.current), [])
  // The timeline is made while nothing else is happening, so the first time it is opened it is already there.
  useEffect(() => whenIdle(() => setBuilt(true), WARM_UP_MS), [])

  function go(next: HomeView) {
    if (next === view) return
    if (next === 'timeline') setBuilt(true)
    setMoving(true)
    setView(next)
    // The screen scrolls inside the main area, not the window: the other page starts at its top.
    const scroller = box.current?.closest('main')
    if (scroller && scroller.scrollTop > 0) scroller.scrollTo({ top: 0 })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMoving(false), MOVE_MS + 60)
  }

  // Swiping the bottom bar asks for a page from outside; the latest `go` is kept in a ref so the listener is set up once.
  const goLatest = useRef(go)
  useEffect(() => {
    goLatest.current = go
  })
  useEffect(() => onHomeViewRequest((next) => goLatest.current(next)), [])

  /** Puts the pages and the marker where a drag of `dx` pixels has them, with no redraw. */
  function follow(width: number, dx: number) {
    const beyond = (index === 0 && dx > 0) || (index === 1 && dx < 0)
    const px = beyond ? dx * 0.25 : dx
    if (trackEl.current) trackEl.current.style.transform = trackTransform(index, px)
    if (pillEl.current) pillEl.current.style.transform = pillTransform(Math.min(1, Math.max(0, index - px / Math.max(width, 1))))
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' || !box.current || ownsGesture(e.target, box.current)) return
    gesture.current = { x: e.clientX, y: e.clientY, at: e.timeStamp, width: box.current.clientWidth, mode: 'unsure' }
  }

  function onPointerMove(e: PointerEvent) {
    const g = gesture.current
    if (!g || g.mode === 'scrolling') return
    const dx = e.clientX - g.x
    if (g.mode === 'unsure') {
      const ax = Math.abs(dx)
      const ay = Math.abs(e.clientY - g.y)
      if (ax > DECIDE && ax > ay * SLOPE) {
        g.mode = 'sideways'
        // The easing is switched off by the attribute straight away, in the same frame as the first movement.
        if (trackEl.current) trackEl.current.dataset.dragging = 'true'
        if (pillEl.current) pillEl.current.dataset.dragging = 'true'
        // The other page is drawn and in place before the finger brings it in.
        if (index === 0) setBuilt(true)
        setDragging(true)
      } else if (ay > DECIDE && ay >= ax) g.mode = 'scrolling'
      else return
    }
    follow(g.width, dx)
  }

  function finish(e: PointerEvent | null) {
    const g = gesture.current
    gesture.current = null
    if (!g || g.mode !== 'sideways') return
    // The click that follows letting go of a drag must not press the button the finger ended on.
    swallow.current = true
    window.setTimeout(() => (swallow.current = false), 120)

    let next: HomeView = view
    if (e) {
      const dx = e.clientX - g.x
      const speed = Math.abs(dx) / Math.max(e.timeStamp - g.at, 1)
      const far = Math.abs(dx) > Math.max(56, g.width * 0.22) || (speed > FLICK && Math.abs(dx) > 24)
      if (far && index === 0 && dx < 0) next = 'timeline'
      else if (far && index === 1 && dx > 0) next = 'overview'
    }
    // Easing comes back and the pages are sent to where they belong, in the same frame, so they glide there from where the finger left them.
    const to = next === 'overview' ? 0 : 1
    if (trackEl.current) {
      trackEl.current.dataset.dragging = 'false'
      trackEl.current.style.transform = trackTransform(to)
    }
    if (pillEl.current) {
      pillEl.current.dataset.dragging = 'false'
      pillEl.current.style.transform = pillTransform(to)
    }
    setDragging(false)
    if (next !== view) go(next)
  }

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
      <div role="group" aria-label="Home view" className="relative mt-3 grid grid-cols-2 rounded-full bg-surface-2 p-1">
        <span ref={pillEl} aria-hidden="true" data-dragging={dragging} className="pager-pill absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-btn" style={{ transform: pillTransform(index) }} />
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

      {/* The pages are cut off at the sides as they slide, but not at the edge of the content: it is widened by the page's own
          margin and padded back, so a ring or a shadow reaching past the first column is not cut short on the left. */}
      <div className="-mx-5 overflow-x-clip px-5">
        <div ref={trackEl} className="pager-track" data-dragging={dragging} data-moving={moving} style={{ transform: trackTransform(index) }}>
          <div data-page="overview" data-rest={rest && index !== 0} inert={rest && index !== 0} className="pager-panel">
            {overview}
          </div>
          <div data-page="timeline" data-rest={rest && index !== 1} inert={rest && index !== 1} className="pager-panel">
            {built && timeline}
          </div>
        </div>
      </div>
    </div>
  )
}
