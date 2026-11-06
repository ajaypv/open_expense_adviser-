/**
 * The line between two days is drawn as a small river: it sways a little to one side and back between the dots (the next
 * stretch sways the other way, so the whole thing winds), and it is as wide as the money moving along it, narrow after a quiet
 * day and broad after a big one, easing from one width to the next.
 */

/** How far a stretch sways to the side, in the units of its 24-wide drawing (the line itself is 24 pixels wide). */
export const SWAY = 4.5
/** The drawing is this wide and this tall; it is stretched to the length of the stretch, and not at all across. */
export const RIVER_WIDTH = 24
export const RIVER_HEIGHT = 100

const MIN_WIDTH = 2.5
const MAX_WIDTH = 8

/** How wide the line is where a day of this size (0 to 1, against the biggest) meets it. */
export const widthFor = (share: number) => MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * Math.sqrt(Math.min(Math.max(share, 0), 1))

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1)

/** Sideways at a point a fraction `t` of the way down: nothing at either end (so one stretch meets the next running straight down), most in the middle. */
export function swayAt(t: number, dir: 1 | -1, amount = SWAY): number {
  return dir * amount * Math.sin(Math.PI * clamp01(t)) ** 2
}

/** The width at a point a fraction `t` of the way down, easing from one end's to the other's. */
const easedWidth = (from: number, to: number, t: number) => from + (to - from) * (t * t * (3 - 2 * t))

const round = (n: number) => Math.round(n * 100) / 100

/**
 * The outline of one stretch of the river, top to bottom: a path in a 24 by 100 box, its left edge down and its right edge back
 * up, filled to make the line. `dir` says which way it sways, and `from` and `to` are the widths at the top and the bottom.
 */
export function riverPath(from: number, to: number, dir: 1 | -1, steps = 20): string {
  const mid = RIVER_WIDTH / 2
  const left: string[] = []
  const right: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = mid + swayAt(t, dir)
    const half = easedWidth(from, to, t) / 2
    const y = round(t * RIVER_HEIGHT)
    left.push(`${round(x - half)} ${y}`)
    right.push(`${round(x + half)} ${y}`)
  }
  return `M${left.join('L')}L${right.reverse().join('L')}Z`
}
