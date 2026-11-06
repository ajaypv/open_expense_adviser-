export interface BubbleIn {
  key: string
  value: number
}

export interface Bubble {
  key: string
  /** Centre and radius, in units where the whole width is 100. */
  cx: number
  cy: number
  r: number
}

export interface Packed {
  bubbles: Bubble[]
  /** How tall the box is, in the same units; its width is 100. 0 when there is nothing to draw. */
  height: number
}

/** The smallest circle is never less than this share of the biggest one's radius, so it can still be read and touched. */
const MIN_RELATIVE_RADIUS = 0.4
/** The gap left between circles, as a share of the biggest circle's radius. */
const GAP = 0.07
/** Spreading sideways costs more than spreading down, so the cluster comes out tall, as a phone screen is. */
const SIDEWAYS_COST = 1.4

interface Placed {
  x: number
  y: number
  r: number
}

/** The two points where a circle of radius `rc` touches both `a` and `b`, each with `gap` left between them. */
function touchingBoth(a: Placed, b: Placed, rc: number, gap: number): { x: number; y: number }[] {
  const da = a.r + rc + gap
  const db = b.r + rc + gap
  const d = Math.hypot(b.x - a.x, b.y - a.y)
  if (d === 0 || d > da + db || d < Math.abs(da - db)) return []
  const along = (da * da - db * db + d * d) / (2 * d)
  const off = Math.sqrt(Math.max(0, da * da - along * along))
  const ux = (b.x - a.x) / d
  const uy = (b.y - a.y) / d
  const mx = a.x + ux * along
  const my = a.y + uy * along
  return [
    { x: mx - uy * off, y: my + ux * off },
    { x: mx + uy * off, y: my - ux * off },
  ]
}

/**
 * Packs circles into a box 100 wide, each with an area in proportion to its value, as close together as they
 * will go and without touching. The biggest goes in first, in the middle; each next one goes where it touches
 * two that are already there (or one, for the second) and is nearest the middle of the group, a little taller
 * than wide. The result is then scaled so the group exactly fills the width. The same input always gives the
 * same picture. Items with no value are left out, and a small one is never smaller than about a third of the
 * biggest circle's width, so its label and its tap target survive.
 */
export function packBubbles(items: BubbleIn[]): Packed {
  const live = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
  if (live.length === 0) return { bubbles: [], height: 0 }

  const biggest = live[0].value
  const radii = live.map((i) => Math.max(Math.sqrt(i.value / biggest), MIN_RELATIVE_RADIUS))
  const gap = GAP

  const placed: Placed[] = [{ x: 0, y: 0, r: radii[0] }]
  for (let n = 1; n < live.length; n++) {
    const r = radii[n]
    const candidates: { x: number; y: number }[] = []
    if (placed.length === 1) {
      const a = placed[0]
      candidates.push({ x: a.x + a.r + r + gap, y: a.y })
    } else {
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) candidates.push(...touchingBoth(placed[i], placed[j], r, gap))
      }
    }

    // The middle of what is placed so far, weighted by area.
    let weight = 0
    let cx = 0
    let cy = 0
    for (const p of placed) {
      weight += p.r * p.r
      cx += p.x * p.r * p.r
      cy += p.y * p.r * p.r
    }
    cx /= weight
    cy /= weight

    const free = candidates.filter((c) => placed.every((p) => Math.hypot(c.x - p.x, c.y - p.y) >= p.r + r + gap - 1e-9))
    free.sort((a, b) => {
      const sa = (SIDEWAYS_COST * (a.x - cx)) ** 2 + (a.y - cy) ** 2
      const sb = (SIDEWAYS_COST * (b.x - cx)) ** 2 + (b.y - cy) ** 2
      return sa - sb || a.y - b.y || a.x - b.x
    })
    const spot = free[0] ?? { x: placed[placed.length - 1].x + 2 * r + gap, y: placed[placed.length - 1].y }
    placed.push({ x: spot.x, y: spot.y, r })
  }

  const left = Math.min(...placed.map((p) => p.x - p.r))
  const right = Math.max(...placed.map((p) => p.x + p.r))
  const top = Math.min(...placed.map((p) => p.y - p.r))
  const bottom = Math.max(...placed.map((p) => p.y + p.r))
  const scale = 100 / (right - left)

  return {
    bubbles: placed.map((p, i) => ({ key: live[i].key, cx: (p.x - left) * scale, cy: (p.y - top) * scale, r: p.r * scale })),
    height: (bottom - top) * scale,
  }
}
