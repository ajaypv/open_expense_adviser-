// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLaunchSplash } from './launchSplash'

let element: HTMLDialogElement
let reduced = false
let hidden = false
let motionChanged: () => void
let splash: ReturnType<typeof createLaunchSplash> | undefined

beforeEach(() => {
  vi.useFakeTimers()
  reduced = false
  hidden = false
  sessionStorage.clear()
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    get matches() { return reduced },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn((_name, listener) => { motionChanged = listener as () => void }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false
  })
  element = document.createElement('dialog')
  element.id = 'launch-splash'
  element.open = true
  element.dataset.startedAt = String(performance.now())
  element.style.cssText = '--launch-intro:1100ms; --launch-expand:950ms; --launch-dissolve:450ms; --launch-short:180ms'
  element.innerHTML = '<div class="launch-bloom"></div>'
  document.body.append(element)
  Object.defineProperties(element, { clientWidth: { value: 390, configurable: true }, clientHeight: { value: 844 } })
  Object.defineProperty(element.firstElementChild, 'offsetWidth', { value: 160 })
})

afterEach(() => {
  splash?.dismiss()
  splash = undefined
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Launch sequence', () => {
  it('reveals, expands to cover every corner, and dissolves in 2.5 seconds', () => {
    splash = createLaunchSplash(element)
    splash.ready()
    vi.advanceTimersByTime(1099)
    expect(element.dataset.phase).toBe('reveal')
    vi.advanceTimersByTime(1)
    expect(element.dataset.phase).toBe('expand')
    expect(Number(element.style.getPropertyValue('--launch-cover')) * 160).toBeGreaterThan(Math.hypot(390, 844))
    vi.advanceTimersByTime(950)
    expect(element.dataset.phase).toBe('fade')
    expect(element).toBeInTheDocument()
    vi.advanceTimersByTime(450)
    expect(element).not.toBeInTheDocument()
    expect(sessionStorage.getItem('launch-complete')).toBe('1')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('counts time already spent in the HTML splash, but waits for the real first screen', () => {
    vi.advanceTimersByTime(1500)
    splash = createLaunchSplash(element)
    vi.advanceTimersByTime(2000)
    expect(element.dataset.phase).toBe('reveal')
    splash.ready()
    expect(element.dataset.phase).toBe('expand')
    vi.advanceTimersByTime(1400)
    expect(element).not.toBeInTheDocument()
  })

  it.each(['warm', 'reduced'] as const)('uses only a short fade for a %s launch', (mode) => {
    if (mode === 'warm') sessionStorage.setItem('launch-complete', '1')
    else reduced = true
    splash = createLaunchSplash(element)
    splash.ready()
    expect(element.dataset.mode).toBe('short')
    expect(element.dataset.phase).toBe('fade')
    vi.advanceTimersByTime(180)
    expect(element).not.toBeInTheDocument()
  })

  it('honors reduced motion if enabled during the expansion', () => {
    splash = createLaunchSplash(element)
    splash.ready()
    vi.advanceTimersByTime(1300)
    reduced = true
    motionChanged()
    expect(element.dataset.mode).toBe('short')
    vi.advanceTimersByTime(180)
    expect(element).not.toBeInTheDocument()
  })

  it('does not replay or restart when React signals readiness twice', () => {
    splash = createLaunchSplash(element)
    splash.ready()
    vi.advanceTimersByTime(1200)
    splash.ready()
    vi.advanceTimersByTime(1300)
    expect(element).not.toBeInTheDocument()
    splash.ready()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('raises the splash above the first-run dialog and recalculates coverage on resize', () => {
    splash = createLaunchSplash(element)
    const opens = vi.mocked(element.showModal).mock.calls.length
    splash.ready()
    expect(element.showModal).toHaveBeenCalledTimes(opens + 1)
    Object.defineProperty(element, 'clientWidth', { value: 1440 })
    window.dispatchEvent(new Event('resize'))
    expect(Number(element.style.getPropertyValue('--launch-cover')) * 160).toBeGreaterThan(Math.hypot(1440, 844))
  })

  it('removes a ready splash when backgrounded instead of replaying on return', () => {
    splash = createLaunchSplash(element)
    splash.ready()
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(element).not.toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not animate when readiness arrives in the background', () => {
    splash = createLaunchSplash(element)
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    splash.ready()
    expect(element).not.toBeInTheDocument()
  })

  it('lets Escape shorten the animation, but not expose an unready app', () => {
    splash = createLaunchSplash(element)
    const cancel = new Event('cancel', { cancelable: true })
    element.dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(element.dataset.phase).toBe('reveal')
    splash.ready()
    element.dispatchEvent(new Event('cancel', { cancelable: true }))
    vi.advanceTimersByTime(180)
    expect(element).not.toBeInTheDocument()
  })

  it('cleans up immediately on errors and does not mark a failed launch as loaded', () => {
    splash = createLaunchSplash(element)
    splash.ready()
    splash.dismiss()
    splash.dismiss()
    expect(element).not.toBeInTheDocument()
    expect(sessionStorage.getItem('launch-complete')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports a stalled startup and exposes the app rather than covering it forever', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    splash = createLaunchSplash(element)
    vi.advanceTimersByTime(12_000)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('longer than expected'))
    expect(element).not.toBeInTheDocument()
    expect(sessionStorage.getItem('launch-complete')).toBeNull()
  })

  it('still opens when session storage is unavailable, with an explicit warning', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError') })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    splash = createLaunchSplash(element)
    splash.ready()
    vi.advanceTimersByTime(2500)
    expect(element).not.toBeInTheDocument()
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it.each(['0.5s', '.5s'])('accepts timing overrides and minified seconds (%s), and rejects invalid timings', (seconds) => {
    element.style.setProperty('--launch-intro', seconds)
    splash = createLaunchSplash(element)
    splash.ready()
    vi.advanceTimersByTime(500)
    expect(element.dataset.phase).toBe('expand')
    splash.dismiss()
    element.style.setProperty('--launch-expand', 'invalid')
    expect(() => createLaunchSplash(element)).toThrow(/launch-expand/)
  })
})
