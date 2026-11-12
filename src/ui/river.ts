/**
 * The line between two days runs straight down from one date to the next, as wide as the money moving along it: narrow after a
 * quiet day and broad after a big one, easing from one width to the next.
 */

/** The drawing is this wide and this tall; it is stretched to the length of the stretch, and not at all across. */
export const RIVER_WIDTH = 24
export const RIVER_HEIGHT = 100

const MIN_WIDTH = 4
const MAX_WIDTH = 9

/** How wide the line is where a day of this size (0 to 1, against the biggest) meets it. */
export const widthFor = (share: number) => MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * Math.sqrt(Math.min(Math.max(share, 0), 1))

/** The width at a point a fraction `t` of the way down, easing from one end's to the other's. */
const easedWidth = (from: number, to: number, t: number) => from + (to - from) * (t * t * (3 - 2 * t))

const round = (n: number) => Math.round(n * 100) / 100

/**
 * The outline of one stretch of the line, top to bottom: a path in a 24 by 100 box, its left edge down and its right edge back
 * up, filled to make the line. `from` and `to` are the widths at the top and the bottom.
 */
export function riverPath(from: number, to: number, steps = 20): string {
  const mid = RIVER_WIDTH / 2
  const left: string[] = []
  const right: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const half = easedWidth(from, to, t) / 2
    const y = round(t * RIVER_HEIGHT)
    left.push(`${round(mid - half)} ${y}`)
    right.push(`${round(mid + half)} ${y}`)
  }
  return `M${left.join('L')}L${right.reverse().join('L')}Z`
}
