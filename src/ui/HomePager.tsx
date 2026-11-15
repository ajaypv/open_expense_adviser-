import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { onHomeViewRequest, takeWaitingHomeView } from './homeView'

export type HomeView = 'overview' | 'timeline'

/** The pages left to right, as they sit: the Timeline is on the left of the Overview, which is where Home opens. */
const TABS: { id: HomeView; label: string }[] = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'overview', label: 'Overview' },
]

/**
 * The space between the two pages, in pixels. The page next to the one in view shows a slice of its edge in the margin beside it (the
 * margin is 20px, so the slice is 17px: about 5% of the width of a phone), on whichever side it is: the timeline's on the left of the
 * overview, and the overview's on the right of the timeline, as if the overview had been pushed aside with the timeline under it.
 */
const GAP = 3

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
const trackTransform = (index: number, px = 0) => `translate3d(calc(${-index * 100}% + ${px - index * GAP}px), 0, 0)`
const pillTransform = (progress: number) => `translate3d(${progress * 100}%, 0, 0)`

/**
 * How much of its way the timeline travels while the overview slides off it. The overview is the sheet on top and moves with the
 * finger, all the way; the timeline is under it, and only moves this share as far, so it seems to be uncovered rather than to arrive
 * beside it (the way the page behind moves in a stack). The rest of the way it is just under the overview.
 */
const UNDER = 0.3

/**
 * Where the timeline is, written onto it as the pages move: `q` is how far across they are, 0 with the overview in view and 1 with the
 * timeline. Under the overview it sits a little shrunken and dimmed, and as the overview slides away it comes up to full size and
 * brightness and settles into its place, where it stays. Like the track, it is a transform and an opacity written straight onto the
 * element, never a custom property.
 */
function placeTimeline(el: HTMLElement | null, q: number, width: number) {
  if (!el) return
  const c = Math.min(1, Math.max(0, q))
  // In full view it has no transform and no opacity at all, rather than ones that change nothing: a transform, even an empty one, keeps
  // a page this long on a layer of its own, and the page is then scrolled as a picture, which can sit a hair off from the rest of the screen.
  if (c === 1) {
    el.style.transform = 'none'
    el.style.opacity = ''
    return
  }
  const shift = (1 - c) * (width + GAP) * (1 - UNDER)
  el.style.transform = `translate3d(${shift}px, 0, 0) scale(${0.94 + 0.06 * c})`
  el.style.opacity = String(0.55 + 0.45 * c)
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
 * Home as two pages side by side, like the pages of a phone's home screen: the timeline of the days behind you on the left, and the
 * overview, where Home opens, on the right. A pair of tabs at the top moves between them, and so does dragging the page sideways
 * (to the right for the timeline): the page follows the finger, and lets go to the nearer one (or the way a quick flick was
 * going), and it settles with a little spring, going just past its place and back, as if it were on one. The tab's marker slides along with it. The page that is not in view is not drawn in full: it is cut to the height of
 * the page that is, so the screen is as long as that one, and only a slice of its edge (about 5% of the width) shows in the margin
 * beside it, on either page, to say there is more that way. Reduced motion swaps them without sliding.
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
  // Where the page in view is, from the left: the timeline is 0 and the overview 1.
  const index = view === 'timeline' ? 0 : 1
  const panels = useRef<Record<HomeView, HTMLDivElement | null>>({ overview: null, timeline: null })

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
    if (pillEl.current) pillEl.current.style.transform = pillTransform(Math.min(1, Math.max(0, index - px / Math.max(width + GAP, 1))))
    placeTimeline(panels.current.timeline, 1 - index + px / Math.max(width + GAP, 1), width)
  }

  function onPointerDown(e: PointerEvent) {
    // A touch, a pen, or the left button of a mouse (so the pages can be tried with a mouse on a computer too).
    if ((e.pointerType === 'mouse' && e.button !== 0) || !box.current || ownsGesture(e.target, box.current)) return
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
        // With a mouse, dragging sideways must not also select the text it crosses, and must go on being followed outside the page.
        if (e.pointerType === 'mouse') {
          window.getSelection?.()?.removeAllRanges()
          if (box.current) box.current.style.userSelect = 'none'
          box.current?.setPointerCapture?.(e.pointerId)
        }
        // The easing is switched off by the attribute straight away, in the same frame as the first movement.
        if (trackEl.current) trackEl.current.dataset.dragging = 'true'
        if (pillEl.current) pillEl.current.dataset.dragging = 'true'
        // The other page is drawn and in place before the finger brings it in.
        if (view === 'overview') setBuilt(true)
        setDragging(true)
      } else if (ay > DECIDE && ay >= ax) g.mode = 'scrolling'
      else return
    }
    follow(g.width, dx)
  }

  function finish(e: PointerEvent | null) {
    const g = gesture.current
    gesture.current = null
    if (box.current) box.current.style.userSelect = ''
    if (!g || g.mode !== 'sideways') return
    // The click that follows letting go of a drag must not press the button the finger ended on.
    swallow.current = true
    window.setTimeout(() => (swallow.current = false), 120)

    let next: HomeView = view
    if (e) {
      const dx = e.clientX - g.x
      const speed = Math.abs(dx) / Math.max(e.timeStamp - g.at, 1)
      const far = Math.abs(dx) > Math.max(56, g.width * 0.22) || (speed > FLICK && Math.abs(dx) > 24)
      if (far && index === 1 && dx > 0) next = 'timeline'
      else if (far && index === 0 && dx < 0) next = 'overview'
    }
    // Easing comes back and the pages are sent to where they belong, in the same frame, so they glide there from where the finger left them.
    const to = next === 'timeline' ? 0 : 1
    placeTimeline(panels.current.timeline, to === 0 ? 1 : 0, g.width)
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

  // At rest the page that is not in view is cut to the height of the one that is, so the screen is as long as the page you are on.
  const rest = !moving && !dragging
  // Wherever the page ends up (a tab pressed, the bottom bar swiped, a drag let go), the timeline is put where it belongs: under the
  // overview, or up in full view; it is carried there by its transition.
  useLayoutEffect(() => {
    placeTimeline(panels.current.timeline, view === 'timeline' ? 1 : 0, box.current?.clientWidth ?? 0)
  }, [view])

  useLayoutEffect(() => {
    const active = panels.current[view]
    const other = panels.current[view === 'overview' ? 'timeline' : 'overview']
    if (!active || !other) return
    // The page in view is as tall as what is in it (it may have been cut to size while it was the other one), and so is the other
    // while the pages move.
    active.style.height = ''
    if (!rest) {
      other.style.height = ''
      return
    }
    const fit = () => {
      other.style.height = `${active.offsetHeight}px`
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(fit)
    watch.observe(active)
    return () => watch.disconnect()
  }, [view, rest, built])

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
      <div role="group" aria-label="Home view" className="relative mt-4 grid grid-cols-2 rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--ring)]">
        <span ref={pillEl} aria-hidden="true" data-dragging={dragging} className="pager-pill absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-btn" style={{ transform: pillTransform(index) }} />
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={view === tab.id}
            onClick={() => go(tab.id)}
            className={`relative min-h-10 rounded-full px-3 text-sm font-semibold transition-colors motion-reduce:transition-none ${view === tab.id ? 'text-btn-ink' : 'text-ink-2'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* The pages are cut off at the sides as they slide, but not at the edge of the content: it is widened by the page's own
          margin and padded back, so a ring or a shadow reaching past the first column is not cut short on the left. */}
      <div className="-mx-5 overflow-x-clip px-5">
        <div ref={trackEl} className="pager-track" data-dragging={dragging} data-moving={moving} style={{ transform: trackTransform(index) }}>
          <div ref={(el) => void (panels.current.timeline = el)} data-page="timeline" data-rest={rest && view !== 'timeline'} inert={rest && view !== 'timeline'} className="pager-panel">
            {built && timeline}
          </div>
          <div ref={(el) => void (panels.current.overview = el)} data-page="overview" data-rest={rest && view !== 'overview'} inert={rest && view !== 'overview'} className="pager-panel">
            {overview}
          </div>
        </div>
      </div>
    </div>
  )
}
