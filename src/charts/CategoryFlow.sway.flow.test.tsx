// @vitest-environment jsdom
import '../test/dom'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '../db/schema'
import type { CategoryTotal } from '../insights/aggregates'
import { tilt } from '../ui/useTilt'
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

/** Lets the sway run: motion allowed, and animation frames that go only when the test says so. */
function allowMotion(allowed = true) {
  window.matchMedia = ((query: string) => ({ matches: allowed && query.includes('no-preference'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  frames = []
  clock = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  // The page clock the sensor readings are stamped with is the same one the frames are timed by.
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
}
/** Plays frames, a sixtieth of a second apart, `n` of them. */
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
const mount = () => render(<CategoryFlow totals={totals} categoryById={categoryById} currency="INR" sourceLabel="Spent in October" />)
const root = () => document.querySelector<HTMLElement>('[data-flow]')!
const lines = () => Array.from(document.querySelectorAll('[data-line]')).map((l) => l.getAttribute('d')!)
const vars = () => ({ tx: Number(root().style.getPropertyValue('--tx')), ty: Number(root().style.getPropertyValue('--ty')), shake: Number(root().style.getPropertyValue('--shake')) })

beforeEach(() => allowMotion())
afterEach(() => {
  window.matchMedia = realMatchMedia
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CategoryFlow: the lines hang from the chest and sway with the phone', () => {
  it('swings the lines against the way the phone is rolled (the gyroscope)', () => {
    mount()
    play(40)
    orient(0)
    play(60)
    const level = lines()
    orient(30)
    play(60)
    expect(vars().tx).toBeLessThan(-0.5)
    expect(lines()).not.toEqual(level)
    orient(-30)
    play(60)
    expect(vars().tx).toBeGreaterThan(0.5)
  })

  it('swings them up and down as the phone is tipped forward and back', () => {
    mount()
    orient(0, 55)
    play(60)
    expect(vars().ty).toBeCloseTo(0, 1)
    orient(0, 85)
    play(60)
    expect(vars().ty).toBeGreaterThan(0.4)
    orient(0, 25)
    play(60)
    expect(vars().ty).toBeLessThan(-0.4)
  })

  it('lets a push (the accelerometer) swing them back, the way a rope lags', () => {
    mount()
    orient(0)
    play(60)
    const before = vars().tx
    for (let i = 0; i < 10; i++) motion(8)
    play(60)
    expect(vars().tx).toBeLessThan(before - 0.2)
  })

  it('keeps where the lines leave the chest and where they land, and swings only the middle', () => {
    mount()
    orient(0)
    play(60)
    const ends = (d: string) => [d.split('C')[0], d.trim().split(' ').slice(-2).join(' ')]
    const level = lines().map(ends)
    orient(30)
    play(60)
    const tilted = lines()
    expect(tilted.map(ends).map(([from]) => from)).toEqual(level.map(([from]) => from))
    // They land at the same height, and at the same place for the middle one's column.
    expect(tilted.map((d) => ends(d)[1].split(' ')[1])).toEqual(level.map((e) => e[1].split(' ')[1]))
  })

  it('throws the chest about when the phone is shaken, and settles it afterwards', () => {
    mount()
    orient(0)
    play(10)
    for (let i = 0; i < 6; i++) {
      motion(i % 2 ? 22 : -22, 8, 4)
      play(2)
    }
    expect(vars().shake).toBeGreaterThan(0.3)
    // Nothing more is sent, so the reading goes stale and the shake dies down.
    play(180)
    expect(vars().shake).toBe(0)
  })

  it('does not take carrying the phone about for a shake', () => {
    mount()
    orient(0)
    for (let i = 0; i < 20; i++) {
      motion(3, 2, 1)
      play(1)
    }
    expect(vars().shake).toBe(0)
  })

  it('sways a little on its own where there is no sensor', () => {
    mount()
    play(5)
    const early = lines()
    play(90)
    expect(tilt.live).toBe(false)
    expect(lines()).not.toEqual(early)
    expect(Math.abs(vars().tx)).toBeLessThanOrEqual(0.4)
  })

  it('holds still, and does not listen, when the person has asked for less motion', () => {
    allowMotion(false)
    mount()
    const first = lines()
    play(30)
    orient(30)
    expect(tilt.live).toBe(false)
    expect(lines()).toEqual(first)
    expect(root().style.getPropertyValue('--tx')).toBe('')
  })

  it('lets go of the sensors when it goes away', () => {
    const { unmount } = mount()
    orient(10)
    expect(tilt.live).toBe(true)
    unmount()
    expect(tilt.live).toBe(false)
  })

  it('draws the chest and its glow as layers that the sway can move', () => {
    mount()
    expect(document.querySelector('.flow-chest')).not.toBeNull()
    expect(document.querySelector('.flow-back')).not.toBeNull()
  })
})
