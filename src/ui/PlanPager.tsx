import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'

export type PlanView = 'overview' | 'calendar'

/** The pages left to right: the Overview, where the page opens, and the Calendar on its right. */
const TABS: { id: PlanView; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'calendar', label: 'Calendar' },
]
const ORDER: PlanView[] = TABS.map((t) => t.id)
const LAST = ORDER.length - 1

/** The space between the pages, in pixels, as in the pager on Home (the same 3px, in the style sheet too). */
const GAP = 3
/** How long the slide takes, and a little more for it to settle. */
const MOVE_MS = 380
/** The movement before it is clear which way the finger is going, and how much more sideways than up or down it must be. */
const DECIDE = 10
const SLOPE = 1.5
/** A flick faster than this (pixels a millisecond) goes over whatever the distance. */
const FLICK = 0.45

interface Gesture {
  x: number
  y: number
  at: number
  width: number
  mode: 'unsure' | 'sideways' | 'scrolling'
}

/** Where the pages are, as a transform written onto the element itself (not a custom property, which every child would inherit). */
const trackTransform = (index: number, px = 0) => `translate3d(calc(${-index * 100}% + ${px - index * GAP}px), 0, 0)`
const pillTransform = (progress: number) => `translate3d(${progress * 100}%, 0, 0)`

/** Whether something between the touch and the pager has its own use for a sideways drag (a chart, a row that scrolls along). */
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
  calendar: ReactNode
}

/**
 * The Plan ahead page as two pages side by side: the overview (the month, the days ahead, the balance, what is due) where it opens, and the
 * calendar of the regular payments on its right. Two tabs at the top move between them, and so does dragging the page sideways (to the left
 * for the calendar, to the right to come back): the page follows the finger, lets go to the nearer one, and settles with a little spring. The
 * page that is not in view is cut to the height of the one that is, with a slice of its edge in the margin to say there is more that way.
 * Reduced motion swaps them without sliding.
 *
 * Like the pager on Home it stays smooth because a drag never goes through React: the position is written straight onto the track and the
 * marker, and the component redraws only when a drag starts and when it ends.
 */
export function PlanPager({ overview, calendar }: Props) {
  const [view, setView] = useState<PlanView>('overview')
  const [dragging, setDragging] = useState(false)
  const [moving, setMoving] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const trackEl = useRef<HTMLDivElement>(null)
  const pillEl = useRef<HTMLSpanElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const swallow = useRef(false)
  const timer = useRef(0)
  const index = ORDER.indexOf(view)
  const panels = useRef<Record<PlanView, HTMLDivElement | null>>({ overview: null, calendar: null })

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function go(next: PlanView) {
    if (next === view) return
    setMoving(true)
    setView(next)
    // The page scrolls inside its dialog: the other page starts at its top.
    const scroller = box.current?.closest('dialog')
    if (scroller && scroller.scrollTop > 0) scroller.scrollTo({ top: 0 })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMoving(false), MOVE_MS + 60)
  }

  /** Puts the pages and the marker where a drag of `dx` pixels has them, with no redraw. */
  function follow(width: number, dx: number) {
    const beyond = (index === 0 && dx > 0) || (index === LAST && dx < 0)
    const px = beyond ? dx * 0.25 : dx
    if (trackEl.current) trackEl.current.style.transform = trackTransform(index, px)
    if (pillEl.current) pillEl.current.style.transform = pillTransform(Math.min(LAST, Math.max(0, index - px / Math.max(width + GAP, 1))))
  }

  function onPointerDown(e: PointerEvent) {
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
        if (e.pointerType === 'mouse') {
          window.getSelection?.()?.removeAllRanges()
          if (box.current) box.current.style.userSelect = 'none'
          box.current?.setPointerCapture?.(e.pointerId)
        }
        if (trackEl.current) trackEl.current.dataset.dragging = 'true'
        if (pillEl.current) pillEl.current.dataset.dragging = 'true'
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

    let next: PlanView = view
    if (e) {
      const dx = e.clientX - g.x
      const speed = Math.abs(dx) / Math.max(e.timeStamp - g.at, 1)
      const far = Math.abs(dx) > Math.max(56, g.width * 0.22) || (speed > FLICK && Math.abs(dx) > 24)
      // One page along, the way the finger went (to the left brings the page on the right), and no further than the ends.
      if (far) next = ORDER[Math.min(LAST, Math.max(0, index + (dx < 0 ? 1 : -1)))]
    }
    const to = ORDER.indexOf(next)
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

  // At rest the page that is not in view is cut to the height of the one that is, so the page is as long as the one you are on.
  const rest = !moving && !dragging
  useLayoutEffect(() => {
    const active = panels.current[view]
    const other = panels.current[view === 'overview' ? 'calendar' : 'overview']
    if (!active || !other) return
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
  }, [view, rest])

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
      <div role="group" aria-label="Plan ahead view" className="relative grid grid-cols-2 rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--ring)]">
        <span ref={pillEl} aria-hidden="true" data-dragging={dragging} className="pager-pill absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-full bg-btn" style={{ transform: pillTransform(index) }} />
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

      {/* The pages are cut off at the sides as they slide, but not at the edge of the content: it is widened by the page's own margin and
          padded back, so a ring or a shadow reaching past the first column is not cut short. */}
      <div className="-mx-5 mt-3 overflow-x-clip px-5">
        <div ref={trackEl} className="pager-track" data-dragging={dragging} data-moving={moving} style={{ transform: trackTransform(index) }}>
          {ORDER.map((id) => (
            <div
              key={id}
              ref={(el) => void (panels.current[id] = el)}
              data-page={`plan-${id}`}
              data-rest={rest && view !== id}
              inert={rest && view !== id}
              className="pager-panel"
            >
              {id === 'overview' ? overview : calendar}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
