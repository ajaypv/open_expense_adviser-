import { describe, expect, it } from 'vitest'
import { RIVER_HEIGHT, RIVER_WIDTH, riverPath, SWAY, swayAt, widthFor } from './river'

const points = (d: string) =>
  d
    .slice(1, -1)
    .split('L')
    .map((p) => p.split(' ').map(Number) as [number, number])

describe('widthFor', () => {
  it('is narrow for a quiet day and broad for the biggest, between a floor and a ceiling', () => {
    expect(widthFor(0)).toBe(2.5)
    expect(widthFor(1)).toBe(8)
    expect(widthFor(-3)).toBe(2.5)
    expect(widthFor(7)).toBe(8)
  })

  it('grows with the day, quickly at first so a small day is still seen', () => {
    expect(widthFor(0.25)).toBeGreaterThan(widthFor(0))
    expect(widthFor(0.5)).toBeGreaterThan(widthFor(0.25))
    expect(widthFor(0.25)).toBeGreaterThan((widthFor(0) + widthFor(0.5)) / 2)
  })
})

describe('swayAt', () => {
  it('is nothing at either end, so one stretch meets the next running straight down', () => {
    expect(swayAt(0, 1)).toBeCloseTo(0, 10)
    expect(swayAt(1, 1)).toBeCloseTo(0, 10)
    expect(swayAt(0, -1)).toBeCloseTo(0, 10)
  })

  it('is greatest in the middle, to one side or the other', () => {
    expect(swayAt(0.5, 1)).toBeCloseTo(SWAY)
    expect(swayAt(0.5, -1)).toBeCloseTo(-SWAY)
    expect(swayAt(0.25, 1)).toBeLessThan(swayAt(0.5, 1))
  })

  it('leaves its slope at the ends at nothing too, so there is no kink where stretches join', () => {
    const slope = (t: number) => (swayAt(t + 1e-4, 1) - swayAt(t, 1)) / 1e-4
    expect(Math.abs(slope(0))).toBeLessThan(0.01)
    expect(Math.abs(slope(1 - 1e-4))).toBeLessThan(0.01)
  })
})

describe('riverPath', () => {
  it('is one closed outline inside its box', () => {
    const d = riverPath(3, 6, 1)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    for (const [x, y] of points(d)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(RIVER_WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(RIVER_HEIGHT)
    }
  })

  it('starts as wide as the top width and ends as wide as the bottom width, centred on the line', () => {
    const p = points(riverPath(3, 7, 1, 10))
    expect(p[0]).toEqual([12 - 1.5, 0]) // left edge, top
    expect(p[10]).toEqual([12 - 3.5, RIVER_HEIGHT]) // left edge, bottom
    expect(p[11]).toEqual([12 + 3.5, RIVER_HEIGHT]) // right edge, bottom
    expect(p[21]).toEqual([12 + 1.5, 0]) // right edge, top
  })

  it('bows to the side it is told, and the other way for the other', () => {
    const middle = (d: string) => {
      const p = points(d)
      const half = (p.length - 2) / 2
      return (p[half / 2][0] + p[p.length - 1 - half / 2][0]) / 2
    }
    expect(middle(riverPath(4, 4, 1))).toBeGreaterThan(12)
    expect(middle(riverPath(4, 4, -1))).toBeLessThan(12)
  })

  it('is as wide all the way down when both ends are', () => {
    const p = points(riverPath(5, 5, 1, 8))
    const n = p.length / 2
    for (let i = 0; i < n; i++) expect(p[p.length - 1 - i][0] - p[i][0]).toBeCloseTo(5, 1)
  })
})
