// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tilt, watchTilt } from './useTilt'

const orient = (gamma: number | null) => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { gamma, beta: 0, alpha: 0 }))
const motion = (x: number | null) => window.dispatchEvent(Object.assign(new Event('devicemotion'), { acceleration: { x, y: 0, z: 0 } }))

afterEach(() => {
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

  it('does not count a reading with no angle (a computer) as a sensor', () => {
    const stop = watchTilt()
    orient(null)
    expect(tilt.live).toBe(false)
    stop()
  })

  it('smooths how hard the phone is pushed along its width, and leaves it alone when it cannot tell', () => {
    const stop = watchTilt()
    motion(10)
    expect(tilt.push).toBeCloseTo(4, 5)
    motion(10)
    expect(tilt.push).toBeGreaterThan(4)
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
    expect(tilt.roll).toBeCloseTo((40 * Math.PI) / 180, 5)
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
})
