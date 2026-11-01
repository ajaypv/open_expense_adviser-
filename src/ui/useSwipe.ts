import { useRef, type PointerEvent } from 'react'

interface Options {
  /** A swipe to the left: the finger moved from right to left. */
  onLeft?: () => void
  /** A swipe to the right: the finger moved from left to right. */
  onRight?: () => void
  /** How far the finger must go sideways, in pixels. */
  distance?: number
}

/** Far enough that a slip of the finger or a tap is not taken for a swipe. */
const DISTANCE = 56
/** How much further sideways than up or down a movement must go to count as sideways. */
const SLOPE = 1.5
/** The movement before it is clear which way the finger is going. */
const DECIDE = 10

interface Track {
  x: number
  y: number
  mode: 'unsure' | 'sideways' | 'scrolling'
}

/**
 * Swipe left and right on a touch screen. Give the handlers it returns to the element, along with the \`touch-pan-y\`
 * class so the page can still scroll up and down from there. A movement that turns out to be up or down is left to the
 * page; a mouse is ignored, so dragging to select text still works; and a gesture the browser takes over is dropped.
 */
export function useSwipe({ onLeft, onRight, distance = DISTANCE }: Options) {
  const track = useRef<Track | null>(null)

  return {
    onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'mouse') return
      track.current = { x: e.clientX, y: e.clientY, mode: 'unsure' }
    },
    onPointerMove(e: PointerEvent) {
      const t = track.current
      if (!t || t.mode !== 'unsure') return
      const dx = Math.abs(e.clientX - t.x)
      const dy = Math.abs(e.clientY - t.y)
      if (dx > DECIDE && dx > dy * SLOPE) t.mode = 'sideways'
      else if (dy > DECIDE && dy >= dx) t.mode = 'scrolling'
    },
    onPointerUp(e: PointerEvent) {
      const t = track.current
      track.current = null
      if (!t || t.mode !== 'sideways') return
      const dx = e.clientX - t.x
      const dy = Math.abs(e.clientY - t.y)
      if (Math.abs(dx) < distance || Math.abs(dx) <= dy * SLOPE) return
      if (dx > 0) onRight?.()
      else onLeft?.()
    },
    onPointerCancel() {
      track.current = null
    },
  }
}
