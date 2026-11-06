import { useLayoutEffect, type RefObject } from 'react'

/** How far down the screen the line has reached when it is drawn: a little below the middle, where the eye is. */
const READ_AT = 0.62
/** How much of the distance to where the line should be it covers each frame, so it trails the scroll and settles softly. */
const EASE = 0.16

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1)

/**
 * Draws the timeline's line as the page scrolls. Each stretch of it (marked data-seg) is revealed from the top as far as the line has
 * got, and a bead of light rides its leading edge; each date (marked data-dot) lights up as the line reaches it. The line trails
 * the scroll a little, so it flows rather than jumping with every notch. It follows the scrolling parent (the main area), and
 * measures again whenever the list changes size, as when a day is opened. With reduced motion all of it is drawn at once.
 *
 * It is made to cost almost nothing while it is not wanted or not changing:
 *  - Where things are is measured when the list is made or changes size, not at every frame; a frame reads only how far the area
 *    has been scrolled, which costs no layout.
 *  - It does nothing at all while the list is out of sight (the other page of Home, or scrolled off), though the area it sits in is
 *    scrolling all the time.
 *  - It stops asking for frames once the line has settled, and writes only the stretches and dates that changed.
 * Everything is written straight onto the elements, a custom property and two attributes, so a scroll never redraws React.
 */
export function useLineScroll(list: RefObject<HTMLElement | null>, layoutKey: string | number) {
  useLayoutEffect(() => {
    const root = list.current
    if (!root) return
    const scroller = root.closest('main')
    const segs = [...root.querySelectorAll<HTMLElement>('[data-seg]')]
    const dots = [...root.querySelectorAll<HTMLElement>('[data-dot]')]

    const light = (dot: HTMLElement, on: boolean) => {
      dot.dataset.lit = String(on)
    }
    const draw = (seg: HTMLElement, p: number) => {
      seg.style.setProperty('--p', String(p))
      seg.dataset.live = String(p > 0 && p < 1)
    }

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      for (const s of segs) draw(s, 1)
      for (const d of dots) light(d, true)
      return
    }

    let tops: { top: number; height: number }[] = []
    let centres: number[] = []
    /** Where the list starts, in the scrolling area's own coordinates (so it does not change as the area is scrolled). */
    let listTop = 0
    const lastP: number[] = []
    const lastLit: boolean[] = []
    let visible = true

    const scrolled = () => (scroller ? scroller.scrollTop : window.scrollY)
    const viewHeight = () => (scroller ? scroller.clientHeight : window.innerHeight)

    const measure = () => {
      const rootBox = root.getBoundingClientRect()
      const areaTop = scroller ? scroller.getBoundingClientRect().top : 0
      listTop = rootBox.top - areaTop + scrolled()
      tops = segs.map((s) => {
        const r = s.getBoundingClientRect()
        return { top: r.top - rootBox.top, height: r.height }
      })
      centres = dots.map((d) => {
        const r = d.getBoundingClientRect()
        return r.top - rootBox.top + r.height / 2
      })
      lastP.length = 0
      lastLit.length = 0
    }

    /** Where the line should have got to, in pixels down the list. */
    const target = () => scrolled() + viewHeight() * READ_AT - listTop

    let reach = 0
    const paint = () => {
      segs.forEach((seg, i) => {
        const { top, height } = tops[i]
        const p = Math.round(clamp01(height > 0 ? (reach - top) / height : reach >= top ? 1 : 0) * 1000) / 1000
        if (p === lastP[i]) return
        lastP[i] = p
        draw(seg, p)
      })
      dots.forEach((dot, i) => {
        const on = reach >= centres[i]
        if (on === lastLit[i]) return
        lastLit[i] = on
        light(dot, on)
      })
    }

    measure()
    reach = target()
    paint()

    let frame = 0
    const step = () => {
      frame = 0
      if (!visible) return
      const goal = target()
      reach += (goal - reach) * EASE
      if (Math.abs(goal - reach) < 0.4) reach = goal
      paint()
      if (reach !== goal) frame = requestAnimationFrame(step)
    }
    const kick = () => {
      if (visible && !frame) frame = requestAnimationFrame(step)
    }
    const remeasure = () => {
      if (!visible) return
      measure()
      kick()
    }

    const watching: EventTarget = scroller ?? window
    watching.addEventListener('scroll', kick, { passive: true })
    window.addEventListener('resize', remeasure)
    const sizes = new ResizeObserver(remeasure)
    sizes.observe(root)

    // Out of sight (the other page, or scrolled well away) it neither measures nor draws; on coming back it looks again at once.
    const sight =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            const now = entries.some((e) => e.isIntersecting)
            if (now === visible) return
            visible = now
            if (now) {
              measure()
              reach = target()
              paint()
            }
          })
    sight?.observe(root)

    return () => {
      watching.removeEventListener('scroll', kick)
      window.removeEventListener('resize', remeasure)
      sizes.disconnect()
      sight?.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [list, layoutKey])
}
