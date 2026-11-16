import { useEffect, useRef, type RefObject } from 'react'
import { tilt, watchTilt } from './useTilt'

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n))
const motionAllowed = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches === true

/** What the phone is doing, as the picture should answer it. */
export interface SwayState {
  /** Sideways, about -1 to 1: against the way the phone is rolled and against a push, as a thing hanging back would swing. */
  x: number
  /** Up and down, about -1 to 1: with the phone tipped forward or back. */
  y: number
  /** 0 to 1: how hard it is being shaken just now, fading after. */
  shake: number
  /** The clock of the frame, in seconds. */
  seconds: number
}

interface Options {
  /** Whether there is anything to move; the sensors are listened to only while there is. */
  active?: boolean
  /** Something that changes when the picture inside is a different one, so what `setup` looked up is looked up again. */
  key?: string
  /** With no sensor (a computer), sway a little by itself. */
  idle?: boolean
  /** Runs once the box is there, to look up what it moves; the function it returns is called every frame with the sway. */
  setup?: (el: HTMLElement) => ((state: SwayState) => void) | void
}

/**
 * The phone's tilt (the gyroscope) and its pushes and shakes (the accelerometer), read every frame while the box is on screen, and
 * written on the box as four custom properties that CSS can use: --tx and --ty (about -1 to 1), --shake (0 to 1) and --jx (a jitter
 * while shaking). A picture that has to move in more ways than CSS can express passes `setup` and is called every frame as well.
 * Nothing runs with reduced motion, or while the box is off screen; where there is no sensor the sway is gentle and its own, unless
 * `idle` is off. The sensors themselves are shared (see useTilt), so any number of these can listen at once.
 */
export function useSway(box: RefObject<HTMLElement | null>, { active = true, key = '', idle = true, setup }: Options = {}) {
  const setupRef = useRef(setup)
  setupRef.current = setup

  useEffect(() => {
    const el = box.current
    if (!active || !el || !motionAllowed()) return
    const onFrame = setupRef.current?.(el)
    let visible = typeof IntersectionObserver === 'undefined'
    let frame = 0
    let last = 0
    let x = 0
    let y = 0
    let shake = 0
    const unwatch = watchTilt()

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      const seconds = now / 1000
      const dt = last ? Math.min(seconds - last, 0.1) : 1 / 60
      last = seconds
      const aimX = tilt.live ? clamp(-tilt.roll / 0.5 - tilt.push / 14, -1.2, 1.2) : idle ? Math.sin(seconds * 0.7) * 0.35 : 0
      const aimY = tilt.live ? clamp(tilt.pitch / 0.5, -1, 1) : idle ? Math.cos(seconds * 0.5) * 0.2 : 0
      const ease = Math.min(1, dt * 6)
      x += (aimX - x) * ease
      y += (aimY - y) * ease
      // A shake is a jolt well above carrying the phone about; it throws things and fades.
      if (tilt.jolt > 9 && now - tilt.movedAt < 250) shake = Math.max(shake, clamp((tilt.jolt - 9) / 10, 0.3, 1))
      shake *= Math.pow(0.05, dt)
      if (shake < 0.01) shake = 0
      el.style.setProperty('--tx', x.toFixed(3))
      el.style.setProperty('--ty', y.toFixed(3))
      el.style.setProperty('--shake', shake.toFixed(3))
      el.style.setProperty('--jx', (Math.sin(seconds * 70) * shake * 4).toFixed(2))
      onFrame?.({ x, y, shake, seconds })
    }

    const run = () => {
      if (!frame && visible) frame = requestAnimationFrame(draw)
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      frame = 0
      last = 0
    }
    const watcher =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            visible = entries.some((e) => e.isIntersecting)
            if (visible) run()
            else stop()
          })
    watcher?.observe(el)
    run()
    return () => {
      stop()
      watcher?.disconnect()
      unwatch()
    }
  }, [box, active, key, idle])
}
