// @vitest-environment jsdom
import '../test/dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '../db/schema'
import type { CategoryTotal } from '../insights/aggregates'
import { CategoryFlow } from './CategoryFlow'

const categoryById = new Map<number, Category>([1, 2, 3].map((id) => [id, { id, name: `Cat ${id}`, color: `var(--s${id})` }]))
const totals: CategoryTotal[] = [
  { categoryId: 1, totalMinor: 500_00 },
  { categoryId: 2, totalMinor: 300_00 },
  { categoryId: 3, totalMinor: 200_00 },
]

const realMatchMedia = window.matchMedia
let frames: FrameRequestCallback[] = []
let clock = 0

/** Lets the coins move: motion allowed, and animation frames that go only when the test says so. */
function allowMotion(allowed = true) {
  window.matchMedia = ((query: string) => ({ matches: allowed && query.includes('no-preference'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  frames = []
  clock = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
}
function play(n: number) {
  act(() => {
    for (let i = 0; i < n; i++) {
      clock += 1000 / 60
      const due = frames
      frames = []
      for (const cb of due) cb(clock)
    }
  })
}
const orient = (gamma: number, beta = 55) => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { gamma, beta, alpha: 0 }))
const motion = (x: number, y = 0, z = 0) => window.dispatchEvent(Object.assign(new Event('devicemotion'), { acceleration: { x, y, z } }))
const mount = (over: Record<string, unknown> = {}) => render(<CategoryFlow totals={totals} categoryById={categoryById} currency="INR" sourceLabel="Spent in October" {...over} />)
const root = () => document.querySelector<HTMLElement>('[data-flow]')!

/** Where each coin is drawn: "translate(x y) rotate(deg)", and whether it is showing. */
const coins = () =>
  Array.from(document.querySelectorAll('[data-coin]')).map((g) => {
    const [, x, y, a] = /translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\)/.exec(g.getAttribute('transform') ?? '') ?? []
    return { x: Number(x), y: Number(y), a: Number(a), on: g.getAttribute('opacity') === '1' }
  })
const shown = () => coins().filter((c) => c.on)
const meanX = () => shown().reduce((a, c) => a + c.x, 0) / shown().length

beforeEach(() => allowMotion())
afterEach(() => {
  window.matchMedia = realMatchMedia
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CategoryFlow: the chest is open', () => {
  it('is open from the start, with no button to close it and no coin out of place', () => {
    mount()
    expect(screen.queryByRole('button', { name: /the chest$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^(Open|Close)$/ })).toBeNull()
    expect(document.querySelector('button[aria-hidden="true"]')).toBeNull()
    expect(root().dataset.open).toBe('true')
    expect(document.querySelector('[data-chest]')).toHaveAttribute('data-open', 'true')
    expect(document.querySelectorAll('[data-coin]')).toHaveLength(26)
  })

  it('has a lid, the inside of a lid, an inside and a layer of coins, for the opening to move', () => {
    mount()
    for (const part of ['.flow-lid', '.flow-lid-in', '.flow-inside', '.flow-coins']) expect(document.querySelector(part), part).not.toBeNull()
  })

  it('still has the total and what it is on the chest, wherever the lid is', () => {
    mount()
    const chest = document.querySelector('[data-chest]')!
    expect(chest.textContent).toContain('Spent in October')
    expect(chest.textContent).toContain('₹1,000')
    expect(screen.getByRole('img', { name: /Spent in October, ₹1,000/ })).toBeInTheDocument()
  })
})

describe('CategoryFlow: gold coins with real physics', () => {
  it('pours the coins in one after another, and they fall into the chest and lie there', () => {
    mount()
    play(20)
    const early = shown().length
    expect(early).toBeLessThan(26)
    play(300)
    expect(shown()).toHaveLength(26)
    // Every one has come to rest inside the chest: between its sides, and not below its floor.
    for (const c of shown()) {
      expect(c.x).toBeGreaterThan(85)
      expect(c.x).toBeLessThan(275)
      expect(c.y).toBeLessThan(105)
    }
    // And they are a heap: the lowest are on the floor.
    expect(Math.max(...shown().map((c) => c.y))).toBeGreaterThan(90)
  })

  it('turns each coin as it rolls, so the faces do not stay as they were poured', () => {
    mount()
    play(20)
    const poured = coins().map((c) => c.a)
    play(120)
    const later = coins().map((c) => c.a)
    expect(later.some((a, i) => Math.abs(a - poured[i]) > 20)).toBe(true)
  })

  it('slides them down the way the phone is tipped (the gyroscope)', () => {
    mount()
    orient(0)
    play(360)
    const level = meanX()
    orient(45)
    play(240)
    const right = meanX()
    expect(right).toBeGreaterThan(level + 12)
    orient(-45)
    play(300)
    expect(meanX()).toBeLessThan(right - 25)
  })

  it('throws them about when the phone is shaken, and they settle after', () => {
    mount()
    orient(0)
    play(360)
    const rest = coins()
    for (let i = 0; i < 10; i++) {
      motion(i % 2 ? 24 : -24, 9, 5)
      play(2)
    }
    const thrown = coins()
    const moved = thrown.reduce((a, c, i) => a + Math.hypot(c.x - rest[i].x, c.y - rest[i].y), 0)
    expect(moved).toBeGreaterThan(60)
    play(480)
    // Nothing more is sent, so the shake dies away and the coins are back in the chest.
    for (const c of shown()) {
      expect(c.x).toBeGreaterThan(84)
      expect(c.x).toBeLessThan(276)
      expect(c.y).toBeLessThan(106)
    }
  })

  it('shows the coins at once, already in a pile, with reduced motion, and moves nothing', () => {
    allowMotion(false)
    mount()
    expect(shown()).toHaveLength(26)
    const pile = coins()
    play(60)
    expect(coins()).toEqual(pile)
    for (const c of pile) {
      expect(c.x).toBeGreaterThan(84)
      expect(c.x).toBeLessThan(276)
      expect(c.y).toBeLessThan(106)
    }
    // A pile, not a row: they have settled one on another.
    expect(Math.min(...pile.map((c) => c.y))).toBeLessThan(Math.max(...pile.map((c) => c.y)) - 15)
  })

  it('draws each coin with the currency sign, so a face turns as it rolls', () => {
    mount()
    const faces = Array.from(document.querySelectorAll('[data-coin] text')).map((t) => t.textContent)
    expect(new Set(faces)).toEqual(new Set(['₹']))
  })
})
