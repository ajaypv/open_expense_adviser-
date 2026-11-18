// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readTilt, tilt, watchTilt as subscribe } from './useTilt'

const orient = (gamma: number | null) => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { gamma, beta: 0, alpha: 0 }))
const motion = (x: number | null) => window.dispatchEvent(Object.assign(new Event('devicemotion'), { acceleration: { x, y: 0, z: 0 } }))
let clock = 1000
let stops: (() => void)[] = []
const watchTilt = () => {
  const stop = subscribe()
  stops.push(stop)
  return stop
}
const advance = (ms: number) => {
  for (let t = 0; t < ms; t += 10) {
    clock += 10
    readTilt(clock)
  }
}
const rotateScreen = (angle: number) => vi.stubGlobal('screen', { orientation: { angle } })

beforeEach(() => {
  clock = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
})
afterEach(() => {
  stops.forEach((stop) => stop())
  stops = []
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('watchTilt', () => {
  it('ignores the sensors until something is watching', () => {
    orient(30)
    expect(tilt.live).toBe(false)
    expect(tilt.roll).toBe(0)
  })

  it('reads how far the phone is rolled, in radians, once watched', () => {
    const stop = watchTilt()
    orient(30)
    expect(tilt.live).toBe(true)
    expect(tilt.roll).toBeCloseTo((30 * Math.PI) / 180, 5)
    stop()
  })

  it('reads how far the phone is tipped forward or back from the way it is held to read', () => {
    const stop = watchTilt()
    window.dispatchEvent(Object.assign(new Event('deviceorientation'), { gamma: 0, beta: 55, alpha: 0 }))
    expect(tilt.pitch).toBeCloseTo(0, 5)
    window.dispatchEvent(Object.assign(new Event('deviceorientation'), { gamma: 0, beta: 85, alpha: 0 }))
    advance(1000)
    expect(tilt.pitch).toBeCloseTo((30 * Math.PI) / 180, 3)
    window.dispatchEvent(Object.assign(new Event('deviceorientation'), { gamma: 0, beta: 25, alpha: 0 }))
    advance(1000)
    expect(tilt.pitch).toBeCloseTo((-30 * Math.PI) / 180, 3)
    stop()
    expect(tilt.pitch).toBe(0)
  })

  it('smooths how hard the phone is moved in any direction, and says when it last was', () => {
    const stop = watchTilt()
    expect(tilt.jolt).toBe(0)
    window.dispatchEvent(Object.assign(new Event('devicemotion'), { acceleration: { x: 0, y: 0, z: 10 } }))
    expect(tilt.jolt).toBeGreaterThan(0)
    expect(tilt.jolt).toBeLessThan(10)
    const first = tilt.jolt
    expect(tilt.movedAt).toBeGreaterThan(0)
    clock += 20
    window.dispatchEvent(Object.assign(new Event('devicemotion'), { acceleration: { x: 0, y: 0, z: 10 } }))
    expect(tilt.jolt).toBeGreaterThan(first)
    stop()
    expect(tilt.jolt).toBe(0)
    expect(tilt.movedAt).toBe(0)
  })

  it('does not count a reading with no angle (a computer) as a sensor', () => {
    const stop = watchTilt()
    orient(null)
    expect(tilt.live).toBe(false)
    stop()
  })

  it('smooths how hard the phone is pushed along its width, and leaves it alone when it cannot tell', () => {
    const stop = watchTilt()
    motion(10)
    expect(tilt.push).toBeGreaterThan(0)
    expect(tilt.push).toBeLessThan(10)
    const first = tilt.push
    clock += 20
    motion(10)
    expect(tilt.push).toBeGreaterThan(first)
    const before = tilt.push
    motion(null)
    expect(tilt.push).toBe(before)
    stop()
  })

  it('lets go of the sensors, and forgets the reading, when the last watcher is done, however many there were', () => {
    const a = watchTilt()
    const b = watchTilt()
    orient(20)
    a()
    a() // a second call changes nothing
    orient(40)
    advance(1000)
    expect(tilt.roll).toBeCloseTo((40 * Math.PI) / 180, 3)
    b()
    expect(tilt.live).toBe(false)
    expect(tilt.roll).toBe(0)
    orient(10)
    expect(tilt.live).toBe(false)
  })

  it('asks an iPhone for the sensors on the first tap, once, and not before', () => {
    const ask = vi.fn(() => Promise.resolve('granted' as const))
    vi.stubGlobal('DeviceOrientationEvent', Object.assign(function DeviceOrientationEvent() {}, { requestPermission: ask }))
    const stop = watchTilt()
    expect(ask).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('pointerup'))
    expect(ask).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('pointerup'))
    expect(ask).toHaveBeenCalledTimes(1)
    stop()
  })

  it('does not ask where there is no such thing to ask (Android, computers)', () => {
    const stop = watchTilt()
    expect(() => window.dispatchEvent(new Event('pointerup'))).not.toThrow()
    stop()
  })

  it('smooths a tilt change instead of jumping, independent of how often a frame reads it', () => {
    const sample = (hz: number) => {
      const stop = watchTilt()
      orient(0)
      readTilt(clock)
      orient(45)
      for (let i = 0; i < hz / 10; i++) {
        clock += 1000 / hz
        readTilt(clock)
      }
      const roll = tilt.roll
      stop()
      return roll
    }
    const slow = sample(30)
    expect(slow).toBeGreaterThan(0.2)
    expect(slow).toBeLessThan(Math.PI / 4)
    expect(sample(120)).toBeCloseTo(slow, 5)
  })

  it.each([90, 270])('uses both tilt and acceleration in landscape at %s degrees', (angle) => {
    rotateScreen(angle)
    watchTilt()
    window.dispatchEvent(Object.assign(new Event('deviceorientation'), { gamma: 0, beta: 25 }))
    window.dispatchEvent(Object.assign(new Event('devicemotion'), { acceleration: { x: 0, y: 8, z: 0 } }))
    const reading = readTilt(clock)
    const direction = angle === 90 ? 1 : -1
    expect(reading.roll * direction).toBeGreaterThan(0.3)
    expect(reading.push * direction).toBeLessThan(-1)
  })

  it('reverses both motion axes when the screen is upside down', () => {
    rotateScreen(180)
    watchTilt()
    window.dispatchEvent(Object.assign(new Event('deviceorientation'), { gamma: 20, beta: 55 }))
    window.dispatchEvent(Object.assign(new Event('devicemotion'), { acceleration: { x: 8, y: -6, z: 0 } }))
    const reading = readTilt(clock)
    expect(reading.roll).toBeLessThan(-0.3)
    expect(reading.push).toBeLessThan(-1)
    expect(reading.heave).toBeLessThan(-1)
  })

  it('returns the same physics input when two illustrations read the same frame', () => {
    watchTilt()
    orient(0)
    readTilt(clock)
    orient(45)
    motion(8)
    clock += 20
    const first = readTilt(clock)
    expect(readTilt(clock)).toEqual(first)
    expect(first.roll).toBeGreaterThan(0)
    expect(first.roll).toBeLessThan(Math.PI / 4)
  })

  it('lets a motion-only device push on both screen axes, then releases stale acceleration', () => {
    watchTilt()
    window.dispatchEvent(Object.assign(new Event('devicemotion'), { acceleration: { x: 8, y: -6, z: 0 } }))
    const moving = readTilt(clock)
    expect(moving.live).toBe(true)
    expect(moving.push).toBeGreaterThan(1)
    expect(moving.heave).toBeGreaterThan(1)
    advance(2000)
    const resting = readTilt(clock)
    expect(Math.abs(resting.push)).toBeLessThan(0.01)
    expect(Math.abs(resting.heave)).toBeLessThan(0.01)
    expect(resting.jolt).toBeLessThan(0.01)
  })

  it('smooths the same acceleration equally at different sensor sample rates', () => {
    const sample = (hz: number) => {
      const stop = watchTilt()
      motion(0)
      for (let i = 0; i < hz / 10; i++) {
        clock += 1000 / hz
        motion(8)
      }
      const push = readTilt(clock).push
      stop()
      return push
    }
    expect(sample(30)).toBeCloseTo(sample(120), 5)
  })

  it('removes gravity when only accelerationIncludingGravity is available', () => {
    watchTilt()
    const gravity = (x: number) => {
      clock += 20
      window.dispatchEvent(Object.assign(new Event('devicemotion'), { acceleration: null, accelerationIncludingGravity: { x, y: 0, z: 9.81 } }))
    }
    for (let i = 0; i < 50; i++) gravity(0)
    expect(readTilt(clock).live).toBe(true)
    expect(readTilt(clock).jolt).toBeLessThan(0.01)
    for (let i = 0; i < 6; i++) gravity(8)
    expect(readTilt(clock).push).toBeGreaterThan(2)
    for (let i = 0; i < 150; i++) gravity(0)
    expect(Math.abs(readTilt(clock).push)).toBeLessThan(0.1)
    expect(readTilt(clock).jolt).toBeLessThan(0.1)
  })

  it('does not reuse a portrait push after the screen rotates or the page is hidden', () => {
    watchTilt()
    motion(12)
    expect(readTilt(clock).push).toBeGreaterThan(1)
    rotateScreen(90)
    expect(readTilt(clock).push).toBe(0)
    motion(12)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(readTilt(clock).push).toBe(0)
    expect(readTilt(clock).jolt).toBe(0)
  })

  it('ignores non-finite readings rather than poisoning the physics', () => {
    watchTilt()
    orient(Number.NaN)
    motion(Number.POSITIVE_INFINITY)
    const reading = readTilt(clock)
    expect(reading.live).toBe(false)
    expect([reading.roll, reading.pitch, reading.push, reading.heave, reading.jolt].every(Number.isFinite)).toBe(true)
  })

  it('asks for motion permission even if orientation does not require permission, and reports rejection', async () => {
    const error = new Error('Not allowed')
    const ask = vi.fn().mockRejectedValue(error)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('DeviceMotionEvent', Object.assign(function DeviceMotionEvent() {}, { requestPermission: ask }))
    watchTilt()
    window.dispatchEvent(new Event('pointerup'))
    await Promise.resolve()
    await Promise.resolve()
    expect(ask).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalled()
  })
})
