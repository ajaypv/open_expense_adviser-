import { describe, expect, it } from 'vitest'
import { packBubbles } from './bubblePack'

// Shares from the reference picture, in percent.
const shares = [
  { key: 'groceries', value: 32.8 },
  { key: 'clothes', value: 16.1 },
  { key: 'cafes', value: 14.8 },
  { key: 'sport', value: 11.3 },
  { key: 'health', value: 8.4 },
  { key: 'travel', value: 6.7 },
]

const distance = (a: { cx: number; cy: number }, b: { cx: number; cy: number }) => Math.hypot(a.cx - b.cx, a.cy - b.cy)

describe('packBubbles: circles sized by share', () => {
  it('is nothing for nothing, and ignores anything with no value', () => {
    expect(packBubbles([])).toEqual({ bubbles: [], height: 0 })
    expect(packBubbles([{ key: 'a', value: 0 }, { key: 'b', value: -5 }])).toEqual({ bubbles: [], height: 0 })
  })

  it('fills the whole width with one circle when there is only one', () => {
    const { bubbles, height } = packBubbles([{ key: 'a', value: 10 }])
    expect(bubbles).toEqual([{ key: 'a', cx: 50, cy: 50, r: 50 }])
    expect(height).toBe(100)
  })

  it('gives every item with a value a circle, under its own key', () => {
    const { bubbles } = packBubbles(shares)
    expect(bubbles.map((b) => b.key).sort()).toEqual(shares.map((s) => s.key).sort())
  })

  it('never lets two circles overlap, and leaves a gap between them', () => {
    const { bubbles } = packBubbles(shares)
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const gap = distance(bubbles[i], bubbles[j]) - bubbles[i].r - bubbles[j].r
        expect(gap, `${bubbles[i].key} and ${bubbles[j].key}`).toBeGreaterThan(0.3)
      }
    }
  })

  it('keeps every circle inside the box, using the full width', () => {
    const { bubbles, height } = packBubbles(shares)
    const left = Math.min(...bubbles.map((b) => b.cx - b.r))
    const right = Math.max(...bubbles.map((b) => b.cx + b.r))
    const top = Math.min(...bubbles.map((b) => b.cy - b.r))
    const bottom = Math.max(...bubbles.map((b) => b.cy + b.r))
    expect(left).toBeCloseTo(0, 6)
    expect(right).toBeCloseTo(100, 6)
    expect(top).toBeCloseTo(0, 6)
    expect(bottom).toBeCloseTo(height, 6)
  })

  it('sizes the area of each circle by its share', () => {
    const { bubbles } = packBubbles([{ key: 'big', value: 40 }, { key: 'small', value: 10 }])
    const [big, small] = [bubbles.find((b) => b.key === 'big')!, bubbles.find((b) => b.key === 'small')!]
    // A quarter of the area is half the radius.
    expect((big.r / small.r) ** 2).toBeCloseTo(4, 6)
  })

  it('never lets a small share shrink away to nothing, so it can still be read and touched', () => {
    const { bubbles } = packBubbles([{ key: 'huge', value: 1000 }, { key: 'tiny', value: 1 }])
    const huge = bubbles.find((b) => b.key === 'huge')!
    const tiny = bubbles.find((b) => b.key === 'tiny')!
    expect(tiny.r / huge.r).toBeGreaterThanOrEqual(0.4 - 1e-9)
  })

  it('keeps even the smallest circle big enough to tap on a phone with nine categories', () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ key: `c${i}`, value: 40 - i * 4 }))
    const { bubbles } = packBubbles(nine)
    // 100 units are the width of the screen, about 360 px: a diameter of 44 px is about 12 units.
    expect(Math.min(...bubbles.map((b) => b.r * 2))).toBeGreaterThanOrEqual(12)
  })

  it('stays compact enough to sit in a card: not much taller than it is wide', () => {
    expect(packBubbles(shares).height).toBeLessThanOrEqual(150)
    const nine = Array.from({ length: 9 }, (_, i) => ({ key: `c${i}`, value: 40 - i * 4 }))
    expect(packBubbles(nine).height).toBeLessThanOrEqual(170)
  })

  it('puts the biggest circle nearest the middle', () => {
    const { bubbles, height } = packBubbles(shares)
    const centre = { cx: 50, cy: height / 2 }
    const nearest = [...bubbles].sort((a, b) => distance(a, centre) - distance(b, centre))[0]
    expect(nearest.key).toBe('groceries')
  })

  it('is the same every time for the same input', () => {
    expect(packBubbles(shares)).toEqual(packBubbles(shares))
  })

  it('copes with two, with equal values and with a lot of items', () => {
    expect(packBubbles([{ key: 'a', value: 1 }, { key: 'b', value: 1 }]).bubbles).toHaveLength(2)
    const equal = packBubbles(Array.from({ length: 5 }, (_, i) => ({ key: `e${i}`, value: 5 })))
    expect(equal.bubbles).toHaveLength(5)
    const many = packBubbles(Array.from({ length: 30 }, (_, i) => ({ key: `m${i}`, value: 30 - i })))
    for (let i = 0; i < many.bubbles.length; i++) {
      for (let j = i + 1; j < many.bubbles.length; j++) {
        expect(distance(many.bubbles[i], many.bubbles[j])).toBeGreaterThan(many.bubbles[i].r + many.bubbles[j].r)
      }
    }
  })
})
