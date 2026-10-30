import { useEffect, useRef, useState } from 'react'

const DURATION_MS = 850

/** Fast at the start and settling gently, so a number seems to land rather than stop. */
export const easeOutQuart = (t: number) => 1 - (1 - t) ** 4

/** Motion only plays when the person hasn't asked for less of it. */
function motionAllowed(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches === true
}

// What each figure last showed. A figure counts up the first time it appears and whenever it changes,
// but not every time its screen is opened again.
const lastShown = new Map<string, number>()

// Things that slide or wipe in do it once per time the app is opened, not on every tab change.
let introPlayed = false

/** For tests: forget everything, as if the app had just been opened. */
export function resetMotion() {
  lastShown.clear()
  introPlayed = false
}

/**
 * The number to show for `target`: it counts up from what that figure last showed (zero the first
 * time), and ends exactly on `target`. With reduced motion it is `target` straight away.
 */
export function useCountUp(target: number, key: string): number {
  const allowed = motionAllowed()
  const [shown, setShown] = useState(() => lastShown.get(key) ?? 0)
  const current = useRef(shown)

  useEffect(() => {
    if (!allowed) {
      lastShown.set(key, target)
      return
    }
    const from = current.current
    if (from === target) return
    let start: number | undefined
    let frame = 0
    const step = (now: number) => {
      start ??= now
      const t = Math.min(1, (now - start) / DURATION_MS)
      const value = t === 1 ? target : from + (target - from) * easeOutQuart(t)
      current.current = value
      lastShown.set(key, value)
      setShown(value)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, key, allowed])

  return allowed ? shown : target
}

/**
 * True for whatever is drawn the first time the app shows something, so bars can wipe in once.
 * Read before the first paint and marked as played after it, so a redraw can't restart it.
 */
export function useIntro(): boolean {
  const [intro] = useState(() => !introPlayed)
  useEffect(() => {
    introPlayed = true
  }, [])
  return intro
}
