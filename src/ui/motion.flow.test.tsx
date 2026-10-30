// @vitest-environment jsdom
import '../test/dom'
import { act, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnimatedMoney } from './AnimatedMoney'
import { easeOutQuart, resetMotion, useCountUp, useIntro } from './motion'

// A frame clock the test drives by hand, so nothing here depends on real time.
let queue: Map<number, FrameRequestCallback>
let nextId: number
const tick = (time: number) =>
  act(() => {
    const due = [...queue.values()]
    queue.clear()
    for (const cb of due) cb(time)
  })

const realMatchMedia = window.matchMedia
const motion = (allowed: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: allowed && query.includes('no-preference'),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

beforeEach(() => {
  queue = new Map()
  nextId = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.set(++nextId, cb)
    return nextId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id))
  resetMotion()
})

afterEach(() => {
  window.matchMedia = realMatchMedia
  vi.unstubAllGlobals()
})

describe('easeOutQuart', () => {
  it('starts at 0, ends at 1 and slows down towards the end', () => {
    expect(easeOutQuart(0)).toBe(0)
    expect(easeOutQuart(1)).toBe(1)
    expect(easeOutQuart(0.5)).toBeGreaterThan(0.5)
    expect(easeOutQuart(0.9) - easeOutQuart(0.8)).toBeLessThan(easeOutQuart(0.2) - easeOutQuart(0.1))
  })
})

describe('useCountUp', () => {
  it('counts up from zero and ends exactly on the value', () => {
    motion(true)
    const { result } = renderHook(() => useCountUp(1000, 'a'))
    expect(result.current).toBe(0)
    tick(0)
    tick(300)
    expect(result.current).toBeGreaterThan(0)
    expect(result.current).toBeLessThan(1000)
    tick(5000)
    expect(result.current).toBe(1000)
    expect(queue.size).toBe(0) // and stops asking for frames
  })

  it('carries on from where it is when the value changes', () => {
    motion(true)
    const { result, rerender } = renderHook(({ n }) => useCountUp(n, 'a'), { initialProps: { n: 1000 } })
    tick(0)
    tick(5000)
    rerender({ n: 3000 })
    tick(10_000)
    tick(10_150)
    expect(result.current).toBeGreaterThan(1000)
    expect(result.current).toBeLessThan(3000)
    tick(20_000)
    expect(result.current).toBe(3000)
  })

  it('does not count again when the same figure is shown again', () => {
    motion(true)
    const first = renderHook(() => useCountUp(1000, 'a'))
    tick(0)
    tick(5000)
    first.unmount()
    const again = renderHook(() => useCountUp(1000, 'a'))
    expect(again.result.current).toBe(1000)
    expect(queue.size).toBe(0)
  })

  it('keeps separate figures apart', () => {
    motion(true)
    const a = renderHook(() => useCountUp(1000, 'a'))
    tick(0)
    tick(5000)
    expect(a.result.current).toBe(1000)
    const b = renderHook(() => useCountUp(500, 'b'))
    expect(b.result.current).toBe(0) // its own first time
  })

  it('shows the value at once, with no frames, when motion is reduced', () => {
    motion(false)
    const { result } = renderHook(() => useCountUp(1000, 'a'))
    expect(result.current).toBe(1000)
    expect(queue.size).toBe(0)
  })
})

describe('AnimatedMoney', () => {
  it('shows the amount at once without motion', () => {
    motion(false)
    const { container } = render(<AnimatedMoney minor={1_252_000} currency="INR" id="x" />)
    expect(container).toHaveTextContent('₹12,520')
  })

  it('counts in whole units, never flickering decimals, and lands on the exact amount', () => {
    motion(true)
    const { container } = render(<AnimatedMoney minor={1_252_050} currency="INR" id="x" />)
    tick(0)
    tick(250)
    expect(container.textContent).toMatch(/^₹[\d,]+$/)
    expect(container.textContent).not.toContain('.')
    tick(5000)
    expect(container).toHaveTextContent('₹12,520.50')
  })

  it('can show the short form', () => {
    motion(false)
    const { container } = render(<AnimatedMoney minor={1_252_000} currency="INR" id="x" compact />)
    expect(container).toHaveTextContent('₹12.5K')
  })
})

describe('useIntro', () => {
  it('is true the first time the app shows something, then false', () => {
    const first = renderHook(() => useIntro())
    expect(first.result.current).toBe(true)
    first.unmount()
    expect(renderHook(() => useIntro()).result.current).toBe(false)
  })

  it('is true for everything drawn in the same first moment', () => {
    const both = renderHook(() => [useIntro(), useIntro()])
    expect(both.result.current).toEqual([true, true])
  })

  it('starts over after a reset, as if the app had just been opened', () => {
    renderHook(() => useIntro()).unmount()
    resetMotion()
    expect(renderHook(() => useIntro()).result.current).toBe(true)
  })
})
