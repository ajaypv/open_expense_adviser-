import { useEffect, useRef, type ReactNode } from 'react'
import { tilt, watchTilt } from './useTilt'
import { COLUMNS, REST_LEVEL, idleLean, leanFor, pour, stepLean, surfaceLine, type Lean } from './waterSurface'

/** Where the surface sits, as a share of the height, before anything has been worked out (and for reduced motion): level, a little under the top. */
const FLAT = `inset(${((1 - REST_LEVEL) * 100).toFixed(1)}% 0 0 0)`

/** The wait before the water is poured, and how long the pouring takes, in seconds. */
const WAIT = 0.35
const POUR = 1.5

const motionAllowed = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches === true

/**
 * A little bottle lying on its side, with water in it: what is inside (the bar's coloured pieces) is shown only where there is water.
 * When it comes into view the water is poured in and rocks; after that its surface rolls with small waves and stays level against the
 * world as the phone is tilted, running to the low end like water in a real bottle, and swings when the phone is pushed or shaken.
 * With no sensor it sways a little on its own. With reduced motion it is still: level, and not moving.
 */
export function Bottle({ children }: { children: ReactNode }) {
  const box = useRef<HTMLSpanElement>(null)
  const water = useRef<HTMLSpanElement>(null)
  const foam = useRef<SVGPolylineElement>(null)
  const ripple = useRef<SVGPolylineElement>(null)

  useEffect(() => {
    const el = box.current
    const inside = water.current
    if (!el || !inside || !motionAllowed()) return
    let width = el.clientWidth
    let height = el.clientHeight || 32
    const size = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => ((width = el.clientWidth), (height = el.clientHeight || 32)))
    size?.observe(el)

    let visible = typeof IntersectionObserver === 'undefined'
    let frame = 0
    let last = 0
    let began = -1
    let lean: Lean = { angle: 0, speed: 0 }
    const unwatch = watchTilt()

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      const seconds = now / 1000
      const dt = last ? Math.min(seconds - last, 0.1) : 1 / 60
      last = seconds
      if (began < 0) {
        began = seconds
        // Poured in with a swirl: the surface is thrown to one side and rocks back.
        lean = { angle: 0, speed: 2.4 }
      }
      const level = REST_LEVEL * height * pour((seconds - began - WAIT) / POUR)
      lean = stepLean(lean, tilt.live ? leanFor(tilt.roll, tilt.push) : idleLean(seconds), dt)
      // Waves ride on the surface: small when calm, taller while the water is rocking hard.
      const swell = 0.9 + Math.min(Math.abs(lean.speed), 2.5) * 0.9
      const line = surfaceLine(width, height, level, lean.angle)
      const wave = (i: number, shift: number, scale: number) => Math.min(height, Math.max(0, line[i] + Math.sin((i / COLUMNS) * Math.PI * 2 * Math.max(1, width / 40) + seconds * 3 + shift) * swell * scale))
      const top: string[] = []
      const foamPoints: string[] = []
      const ripplePoints: string[] = []
      for (let i = 0; i <= COLUMNS; i++) {
        const x = ((i / COLUMNS) * width).toFixed(1)
        const y = wave(i, 0, 1)
        top.push(`${x}px ${y.toFixed(1)}px`)
        foamPoints.push(`${x},${y.toFixed(1)}`)
        ripplePoints.push(`${x},${Math.min(height, wave(i, 2, 0.8) + 3).toFixed(1)}`)
      }
      inside.style.clipPath = `polygon(${top.join(',')},${width}px ${height}px,0px ${height}px)`
      foam.current?.setAttribute('points', foamPoints.join(' '))
      ripple.current?.setAttribute('points', ripplePoints.join(' '))
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
      size?.disconnect()
      unwatch()
    }
  }, [])

  return (
    <span ref={box} data-water className="relative block h-full w-full">
      <span ref={water} className="block h-full" style={{ clipPath: FLAT }}>
        {children}
      </span>
      {/* A thin light line along the surface, and a fainter one just under it, so it reads as water and not as a cut edge. */}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible">
        <polyline ref={ripple} fill="none" stroke="white" strokeOpacity="0.18" strokeWidth="1" strokeLinejoin="round" />
        <polyline ref={foam} fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </span>
  )
}
