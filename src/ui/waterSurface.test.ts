import { describe, expect, it } from 'vitest'
import { COLUMNS, MAX_LEAN, REST_LEVEL, idleLean, leanFor, pour, stepLean, surfaceLine } from './waterSurface'

const W = 100
const H = 32
/** The water in the box, as a depth: the area under the line over the width. */
const depthOf = (line: number[]) => {
  let sum = 0
  for (let i = 0; i < COLUMNS; i++) sum += H - (line[i] + line[i + 1]) / 2
  return sum / COLUMNS
}

describe('surfaceLine', () => {
  it('is level, at the depth of the water, when the bottle is not tilted', () => {
    const line = surfaceLine(W, H, 20, 0)
    expect(line).toHaveLength(COLUMNS + 1)
    for (const y of line) expect(y).toBeCloseTo(12, 3)
  })

  it('keeps the same amount of water however far it is tilted, until it runs out of room', () => {
    for (const lean of [-0.9, -0.4, -0.1, 0.1, 0.4, 0.9]) expect(depthOf(surfaceLine(W, H, 20, lean))).toBeCloseTo(20, 1)
  })

  it('runs to the low end: with the surface leaning to the right (higher on the left) the water is deeper on the left', () => {
    const line = surfaceLine(W, H, 20, 0.5)
    expect(line[COLUMNS]).toBeGreaterThan(line[0])
  })

  it('has the water deeper on the right when the phone is rolled to the right, as it runs to the side that is down', () => {
    const line = surfaceLine(W, H, 20, leanFor(0.5, 0))
    expect(line[COLUMNS]).toBeLessThan(line[0])
  })

  it('leans the other way for the other tilt, mirror for mirror', () => {
    const right = surfaceLine(W, H, 20, 0.5)
    const left = surfaceLine(W, H, 20, -0.5)
    for (let i = 0; i <= COLUMNS; i++) expect(left[i]).toBeCloseTo(right[COLUMNS - i], 3)
  })

  it('stays inside the box: never above the lid or under the floor', () => {
    for (const lean of [-1.5, -0.7, 0.7, 1.5]) for (const y of surfaceLine(W, H, 10, lean)) expect(y >= 0 && y <= H).toBe(true)
  })

  it('has nothing in it with no water, and no air with a full bottle', () => {
    expect(surfaceLine(W, H, 0, 0.3).every((y) => y === H)).toBe(true)
    expect(surfaceLine(W, H, H, 0.3).every((y) => y === 0)).toBe(true)
  })

  it('does not lean further than the limit', () => {
    expect(surfaceLine(W, H, 20, 3)).toEqual(surfaceLine(W, H, 20, MAX_LEAN))
  })
})

describe('the lean spring', () => {
  const settle = (from: { angle: number; speed: number }, target: number, seconds: number) => {
    let lean = from
    const path: number[] = []
    for (let t = 0; t < seconds; t += 1 / 60) {
      lean = stepLean(lean, target, 1 / 60)
      path.push(lean.angle)
    }
    return { lean, path }
  }

  it('comes to rest on the target', () => {
    const { lean } = settle({ angle: 0, speed: 0 }, 0.5, 6)
    expect(lean.angle).toBeCloseTo(0.5, 2)
    expect(Math.abs(lean.speed)).toBeLessThan(0.01)
  })

  it('overshoots and rocks back, like water, and does not creep up to it like a slider', () => {
    const { path } = settle({ angle: 0, speed: 0 }, 0.5, 3)
    expect(Math.max(...path)).toBeGreaterThan(0.55)
    expect(path.some((a, i) => i > 0 && a < path[i - 1])).toBe(true)
  })

  it('stays steady when a frame is very late', () => {
    const lean = stepLean({ angle: 0, speed: 0 }, 1, 5)
    expect(Number.isFinite(lean.angle)).toBe(true)
    expect(Math.abs(lean.angle)).toBeLessThanOrEqual(MAX_LEAN)
  })
})

describe('what the water wants', () => {
  it('stays level against the world: rolled to the right, the surface leans the other way against the bottle', () => {
    expect(leanFor(0.4, 0)).toBeCloseTo(-0.4, 5)
    expect(leanFor(-0.4, 0)).toBeCloseTo(0.4, 5)
    expect(leanFor(0, 0)).toBe(0)
  })

  it('is thrown back when the phone is pushed to the right, as it would be when tipped to the left', () => {
    expect(leanFor(0, 5)).toBeGreaterThan(0)
    expect(leanFor(0, -5)).toBeLessThan(0)
  })

  it('is never past the limit', () => {
    expect(Math.abs(leanFor(3, 0))).toBeLessThanOrEqual(MAX_LEAN)
  })
})

describe('pouring in', () => {
  it('starts empty, goes a little past full, and ends exactly full', () => {
    expect(pour(0)).toBe(0)
    expect(pour(1)).toBe(1)
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => pour(i / 100)))).toBeGreaterThan(1.05)
    expect(pour(-1)).toBe(0)
    expect(pour(2)).toBe(1)
  })

  it('does not fill the bottle to the lid even at its highest', () => {
    expect(REST_LEVEL * Math.max(...Array.from({ length: 101 }, (_, i) => pour(i / 100)))).toBeLessThan(1)
  })
})

describe('the sway with no sensor', () => {
  it('is small and never still', () => {
    const values = Array.from({ length: 200 }, (_, i) => idleLean(i / 10))
    expect(Math.max(...values.map(Math.abs))).toBeLessThan(0.1)
    expect(new Set(values.map((v) => v.toFixed(3))).size).toBeGreaterThan(50)
  })
})
