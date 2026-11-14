// @vitest-environment jsdom
import '../test/dom'
import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DuckPond } from './DuckPond'
import { tilt } from './useTilt'

const realMatchMedia = window.matchMedia
let frames: FrameRequestCallback[] = []
let clock = 0

/** Lets the pond run: motion allowed, and animation frames that go only when the test says so. */
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

const duck = () => document.querySelector<SVGGElement>('[data-duck]')!
/** Where the duck is: across, and up from the top of the picture, and which way it faces. */
function where() {
  const m = /translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\) scale\(([-\d.]+) 1\)/.exec(duck().getAttribute('transform')!)!
  return { x: Number(m[1]), y: Number(m[2]), turn: Number(m[3]), face: Number(m[4]) }
}
const surface = () => document.querySelector('polyline')!.getAttribute('points')
const visibleDrops = () => [...document.querySelectorAll('[data-drop]')].filter((d) => Number(d.getAttribute('opacity')) > 0).length

beforeEach(() => allowMotion())
afterEach(() => {
  window.matchMedia = realMatchMedia
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DuckPond', () => {
  it('is a yellow duck in water, drawn as a picture a screen reader skips', () => {
    render(<DuckPond />)
    const pond = document.querySelector('[data-duck-pond]')!
    expect(pond).toHaveAttribute('aria-hidden', 'true')
    expect(duck()).not.toBeNull()
    expect(pond.querySelector('polygon')).not.toBeNull()
    expect(pond.textContent).toBe('')
  })

  it('drops in when it first comes into view, and lands on the water with a splash', () => {
    render(<DuckPond />)
    play(2)
    const start = where().y
    let splashed = false
    for (let i = 0; i < 60; i++) {
      play(1)
      if (visibleDrops() > 0) splashed = true
    }
    expect(splashed).toBe(true)
    expect(where().y).toBeGreaterThan(start)
    expect(where().y).toBeLessThan(80) // floating at the water (rest is 72), not sunk
  })

  it('floats on a surface that moves, with waves', () => {
    render(<DuckPond />)
    play(120)
    const a = surface()
    play(30)
    expect(surface()).not.toBe(a)
  })

  it('slides to the low end when the phone is rolled, and to the other end when it is rolled the other way (the gyroscope)', () => {
    render(<DuckPond />)
    play(60)
    orient(30)
    play(240)
    const right = where()
    expect(right.x).toBeGreaterThan(220)
    expect(right.face).toBeGreaterThan(0.5) // facing the way it went
    orient(-30)
    play(240)
    const left = where()
    expect(left.x).toBeLessThan(100)
    expect(left.face).toBeLessThan(-0.5)
  })

  it('sits along the water as it leans', () => {
    render(<DuckPond />)
    orient(0)
    play(120)
    const level = Math.abs(where().turn)
    orient(35)
    play(240)
    expect(Math.abs(where().turn)).toBeGreaterThan(level)
  })

  it('hops when the phone is shaken (the accelerometer), then comes down with a splash', () => {
    render(<DuckPond />)
    orient(0)
    play(240)
    const resting = where().y
    expect(visibleDrops()).toBe(0)
    // A hard shake: well above carrying the phone about.
    let top = resting
    let splashed = false
    for (let i = 0; i < 40; i++) {
      motion(25, 25, 25)
      play(1)
      top = Math.min(top, where().y)
      if (visibleDrops() > 0) splashed = true
    }
    expect(top).toBeLessThan(resting - 8)
    expect(splashed).toBe(true)
  })

  it('is pushed along by a push of the phone', () => {
    render(<DuckPond />)
    orient(0)
    play(240)
    const before = where().x
    for (let i = 0; i < 60; i++) {
      motion(-9)
      play(1)
    }
    // Pushed to the left, the water is thrown to the right, and the duck with it.
    expect(where().x).toBeGreaterThan(before)
  })

  it('hops when the pond is tapped', () => {
    const { container } = render(<DuckPond />)
    orient(0)
    play(240)
    const resting = where().y
    fireEvent.pointerDown(container.querySelector('[data-duck-pond]')!)
    let top = resting
    for (let i = 0; i < 20; i++) {
      play(1)
      top = Math.min(top, where().y)
    }
    expect(top).toBeLessThan(resting - 8)
  })

  it('paddles about by itself when there is no sensor', () => {
    render(<DuckPond />)
    play(120)
    const a = where().x
    play(300)
    expect(where().x).not.toBeCloseTo(a, 0)
    expect(tilt.live).toBe(false)
  })

  it('listens to the sensors only while it is on the page', () => {
    const { unmount } = render(<DuckPond />)
    play(5)
    orient(10)
    expect(tilt.live).toBe(true)
    unmount()
    expect(tilt.live).toBe(false)
  })

  it('sits still with reduced motion: level water, the duck where it floats, and no sensor read', () => {
    allowMotion(false)
    render(<DuckPond />)
    play(60)
    expect(frames).toHaveLength(0)
    orient(30)
    expect(tilt.live).toBe(false)
    expect(where().x).toBe(160)
    expect(visibleDrops()).toBe(0)
  })
})
