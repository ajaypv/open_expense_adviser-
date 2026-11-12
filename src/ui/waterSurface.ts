/**
 * The physics of the water in today's bar, kept apart from the drawing so it can be tested. The bar is a small bottle lying on its
 * side: water of a fixed amount sits in a box, its surface stays level against the world, so as the box tilts the surface leans against
 * the box and the water runs to the low end, never more or less of it.
 */

/** How many columns the surface is worked out in. */
export const COLUMNS = 24

/** How full the bar is at rest, as a share of its height: the rest is air, so the water has room to move. */
export const REST_LEVEL = 0.72

/** Never lean further than this (radians): past it the surface is as good as the end of the bottle. */
export const MAX_LEAN = 1.1

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * The height of the surface, measured down from the top of the box, at each of COLUMNS + 1 points across it. `depth` is how much
 * water there is (its depth when level) and `lean` how far the surface is tilted against the box, in radians, positive when its right
 * side is the lower one. The amount of water is kept: where the surface meets the floor or the lid, the rest is made up where there
 * is room.
 */
export function surfaceLine(width: number, height: number, depth: number, lean: number): number[] {
  const n = COLUMNS
  if (depth <= 0) return Array.from({ length: n + 1 }, () => height)
  if (depth >= height) return Array.from({ length: n + 1 }, () => 0)
  const slope = Math.tan(clamp(lean, -MAX_LEAN, MAX_LEAN))
  const at = (mid: number, i: number) => clamp(mid + slope * ((i / n) * width - width / 2), 0, height)
  // The water under a line through the middle of the box at height `mid`, in columns: it only falls as `mid` goes down the box.
  const held = (mid: number) => {
    let sum = 0
    for (let i = 0; i < n; i++) sum += height - (at(mid, i) + at(mid, i + 1)) / 2
    return sum / n
  }
  const reach = Math.abs(slope) * width + height
  let lo = -reach
  let hi = height + reach
  for (let k = 0; k < 28; k++) {
    const mid = (lo + hi) / 2
    if (held(mid) > depth) lo = mid
    else hi = mid
  }
  const mid = (lo + hi) / 2
  return Array.from({ length: n + 1 }, (_, i) => at(mid, i))
}

/** A spring that is let go loosely, so it overshoots and rocks a few times before it settles: the water's lean. */
export interface Lean {
  angle: number
  speed: number
}

const STIFFNESS = 64
const DAMPING = 3.1

/** Moves the lean towards where the water wants to be, by `dt` seconds, in steps small enough to stay steady. */
export function stepLean(lean: Lean, target: number, dt: number): Lean {
  let { angle, speed } = lean
  let left = Math.min(dt, 0.1)
  while (left > 0) {
    const h = Math.min(left, 1 / 120)
    speed += (STIFFNESS * (target - angle) - DAMPING * speed) * h
    angle += speed * h
    left -= h
  }
  return { angle: clamp(angle, -MAX_LEAN, MAX_LEAN), speed }
}

/** The lean the water wants: level against the world whatever way the bar is rolled, and thrown back when the phone is pushed along. */
export function leanFor(roll: number, push: number): number {
  return clamp(-roll + Math.atan(push / 9.81), -MAX_LEAN, MAX_LEAN)
}

/** 0 to 1 in, 0 to a little over 1 and back to 1 out: the level coming up as if poured, and settling. */
export function pour(progress: number): number {
  const p = clamp(progress, 0, 1)
  const c1 = 1.9
  const c3 = c1 + 1
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2
}

/** A gentle sway for a device with no sensor (or one that has not been allowed), so the water is never quite still. */
export function idleLean(seconds: number): number {
  return 0.05 * Math.sin(seconds * 1.05) + 0.02 * Math.sin(seconds * 2.3 + 1)
}
