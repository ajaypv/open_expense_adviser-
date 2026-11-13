import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useSeen } from './motion'

/**
 * A row of cards that scrolls sideways, made to be pleasant to use: each card settles on the left edge with room before it, the next card
 * always peeks in from the right so it is plain there is more, a soft fade at an edge appears only while there is more that way, and a
 * slim bar underneath shows how far along the row you are. The row is a tab stop, so the arrow keys move it, and it does not pass the
 * swipe on to whatever is behind it. The cards are the children (list items). It runs edge to edge inside the page's 20px gutter.
 */
export function ScrollStrip({ label, children }: { label: string; children: ReactNode }) {
  const [watch, seen] = useSeen()
  const list = useRef<HTMLUListElement | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLSpanElement>(null)
  const setList = useCallback(
    (el: HTMLUListElement | null) => {
      list.current = el
      watch(el)
    },
    [watch],
  )

  // Where the row is, written on the box (which edges have more) and the bar (how long and how far along), without redrawing anything.
  const measure = useCallback(() => {
    const el = list.current
    const outer = box.current
    const bar = thumb.current
    if (!el || !outer || !bar) return
    const room = el.scrollWidth - el.clientWidth
    const scrollable = room > 2
    outer.dataset.scrollable = String(scrollable)
    outer.dataset.start = String(scrollable && el.scrollLeft > 4)
    outer.dataset.end = String(scrollable && el.scrollLeft < room - 4)
    if (scrollable) {
      const share = el.clientWidth / el.scrollWidth
      bar.style.width = `${share * 100}%`
      bar.style.transform = `translateX(${(el.scrollLeft / room) * (1 / share - 1) * 100}%)`
    }
  }, [])

  useEffect(() => {
    const el = list.current
    if (!el) return
    measure()
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const size = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    size?.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('scroll', onScroll)
      size?.disconnect()
    }
  }, [measure])

  // The cards can change (a payment is added or paid), and then the row is longer or shorter.
  useEffect(measure)

  return (
    <div ref={box} data-scrollable="false" data-start="false" data-end="false" className="group relative -mx-5">
      <ul
        ref={setList}
        data-seen={seen}
        aria-label={label}
        tabIndex={0}
        className="when-seen flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-5 px-5 py-1 focus-visible:outline-offset-[-2px]"
      >
        {children}
      </ul>
      {/* The edges: they only show while there is more to see that way. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-bg to-transparent opacity-0 transition-opacity duration-200 group-data-[start=true]:opacity-100 motion-reduce:transition-none" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent opacity-0 transition-opacity duration-200 group-data-[end=true]:opacity-100 motion-reduce:transition-none" />
      <div aria-hidden="true" className="mx-auto mt-2 hidden h-1 w-14 overflow-hidden rounded-full bg-surface-2 group-data-[scrollable=true]:block">
        <span ref={thumb} data-thumb className="block h-full w-1/3 rounded-full bg-ink-2/70 transition-transform duration-100 motion-reduce:transition-none" />
      </div>
    </div>
  )
}
