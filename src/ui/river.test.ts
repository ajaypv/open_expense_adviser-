import { describe, expect, it } from 'vitest'
import { RIVER_HEIGHT, RIVER_WIDTH, riverPath, widthFor } from './river'

const points = (d: string) =>
  d
    .slice(1, -1)
    .split('L')
    .map((p) => p.split(' ').map(Number) as [number, number])

describe('widthFor', () => {
  it('is narrow for a quiet day and broad for the biggest, between a floor and a ceiling', () => {
    expect(widthFor(0)).toBe(4)
    expect(widthFor(1)).toBe(9)
    expect(widthFor(-3)).toBe(4)
    expect(widthFor(7)).toBe(9)
  })

  it('grows with the day, quickly at first so a small day is still seen', () => {
    expect(widthFor(0.25)).toBeGreaterThan(widthFor(0))
    expect(widthFor(0.5)).toBeGreaterThan(widthFor(0.25))
    expect(widthFor(0.25)).toBeGreaterThan((widthFor(0) + widthFor(0.5)) / 2)
  })
})

describe('riverPath', () => {
  it('is one closed outline inside its box', () => {
    const d = riverPath(3, 6)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    for (const [x, y] of points(d)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(RIVER_WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(RIVER_HEIGHT)
    }
  })

  it('starts as wide as the top width and ends as wide as the bottom width, centred', () => {
    const p = points(riverPath(3, 7, 10))
    expect(p[0]).toEqual([12 - 1.5, 0]) // left edge, top
    expect(p[10]).toEqual([12 - 3.5, RIVER_HEIGHT]) // left edge, bottom
    expect(p[11]).toEqual([12 + 3.5, RIVER_HEIGHT]) // right edge, bottom
    expect(p[21]).toEqual([12 + 1.5, 0]) // right edge, top
  })

  it('runs straight down: both edges are the same distance either side of the middle at every height, so it never bends or crosses itself', () => {
    const p = points(riverPath(2.5, 8, 12))
    const n = p.length / 2
    for (let i = 0; i < n; i++) {
      const [lx, ly] = p[i]
      const [rx, ry] = p[p.length - 1 - i]
      expect(ry).toBe(ly)
      expect(12 - lx).toBeCloseTo(rx - 12, 1)
    }
  })

  it('goes steadily down, never back up', () => {
    const ys = points(riverPath(3, 6)).slice(0, 21).map(([, y]) => y)
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1])
  })

  it('is as wide all the way down when both ends are', () => {
    const p = points(riverPath(5, 5, 8))
    const n = p.length / 2
    for (let i = 0; i < n; i++) expect(p[p.length - 1 - i][0] - p[i][0]).toBeCloseTo(5, 1)
  })
})
