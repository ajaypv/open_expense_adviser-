import { useId, useRef } from 'react'
import { DEPTH, H, POND_LEAN, W, duckTarget, lineAt, newDuck, slopeAt, splash, stepDrops, stepDuck, type Drop } from './duckPhysics'
import { tilt } from './useTilt'
import { useSway } from './useSway'
import { COLUMNS, idleLean, leanFor, stepLean, surfaceLine, type Lean } from './waterSurface'

const DROPS = 8
const num = (n: number) => n.toFixed(1)
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** The water level at rest, measured down from the top of the picture. */
const REST = H - DEPTH

/**
 * A duck floating in a little pond, for a day with nothing spent yet. The water is today's bar's water: its surface stays level against
 * the world as the phone is tilted and runs to the low end, swings when the phone is pushed, and is shaken into bigger waves. The duck
 * rides the surface, slides to the low end, turns to face the way it is going, hops when the phone is shaken or the pond is tapped, and
 * lands with a splash. It drops in when it first comes into view. With no sensor it paddles about by itself; with reduced motion it
 * sits still. It is a picture: hidden from a screen reader, which is read the words beside it.
 */
export function DuckPond() {
  const box = useRef<HTMLDivElement>(null)
  const back = useRef<SVGPolygonElement>(null)
  const front = useRef<SVGPolygonElement>(null)
  const foam = useRef<SVGPolylineElement>(null)
  const ripple = useRef<SVGPolylineElement>(null)
  const duckEl = useRef<SVGGElement>(null)
  const drops = useRef<(SVGCircleElement | null)[]>([])
  const poke = useRef(false)
  const id = useId().replace(/:/g, '')

  useSway(box, {
    idle: false,
    setup: () => {
      const duck = newDuck()
      let lean: Lean = { angle: 0, speed: 0 }
      let flying: Drop[] = []
      let began = false
      let last = 0
      // Extra swell from a landing, which dies away.
      let kick = 0
      return ({ shake, seconds }) => {
        const dt = last ? Math.min(seconds - last, 0.1) : 1 / 60
        last = seconds
        if (!began) {
          began = true
          // It drops in from above, and the water is thrown to one side.
          duck.hy = 52
          duck.hv = 0
          lean = { angle: 0, speed: 1.6 }
        }
        // The water leans as the phone is held; shaken, it is thrown about.
        const target = (tilt.live ? leanFor(tilt.roll, tilt.push) : idleLean(seconds)) + Math.sin(seconds * 17) * 0.22 * shake
        lean = stepLean(lean, target, dt)
        kick *= Math.pow(0.12, dt)
        const swell = 1.3 + Math.min(Math.abs(lean.speed), 2.5) * 1.4 + shake * 3 + kick

        // The pond is shallow, so the surface leans less than the water in a bottle would, and stays in the picture.
        const line = surfaceLine(W, H, DEPTH, clamp(lean.angle * 0.45, -POND_LEAN, POND_LEAN))
        const ys = line.map((y, i) => clamp(y + Math.sin((i / COLUMNS) * Math.PI * 2 * 2.2 + seconds * 2.4) * swell, 0, H))

        const hit = stepDuck(duck, dt, { target: duckTarget(lean.angle, seconds, tilt.live), shake, poke: poke.current, rand: Math.random })
        poke.current = false
        const surface = lineAt(ys, duck.x)
        if (hit > 60) {
          flying.push(...splash(duck.x, surface, hit, Math.random))
          flying = flying.slice(-DROPS)
          // The water is thrown the way the duck was going, and the surface rocks harder.
          lean = { angle: lean.angle, speed: lean.speed + duck.dir * Math.min(hit / 260, 1.8) }
          kick = Math.min(kick + hit / 130, 5)
        }
        flying = stepDrops(flying, dt)

        const top = ys.map((y, i) => `${num((i / COLUMNS) * W)},${num(y)}`)
        const points = `${top.join(' ')} ${W},${H} 0,${H}`
        back.current?.setAttribute('points', points)
        // The front of the water is a little lower than the back, over the duck's belly, so it floats in the water, not on it.
        front.current?.setAttribute('points', `${ys.map((y, i) => `${num((i / COLUMNS) * W)},${num(Math.min(H, y + 2.5))}`).join(' ')} ${W},${H} 0,${H}`)
        foam.current?.setAttribute('points', top.join(' '))
        ripple.current?.setAttribute('points', ys.map((y, i) => `${num((i / COLUMNS) * W)},${num(Math.min(H, y + 4.5))}`).join(' '))

        // It sits along the water, bobs on it, and leans into a hop; the water covers the foot of it.
        const bob = Math.sin(seconds * 2.6) * 0.9
        const angle = slopeAt(ys, duck.x) * 0.7 + Math.sin(seconds * 1.7) * 1.6 + clamp(duck.vx / 18, -9, 9) * (duck.hy > 0 ? 1.5 : 1)
        duckEl.current?.setAttribute('transform', `translate(${num(duck.x)} ${num(surface + bob - duck.hy)}) rotate(${num(angle)}) scale(${duck.face.toFixed(2)} 1)`)

        for (let i = 0; i < DROPS; i++) {
          const el = drops.current[i]
          const p = flying[i]
          if (!el) continue
          if (p) {
            el.setAttribute('cx', num(p.x))
            el.setAttribute('cy', num(p.y))
            el.setAttribute('opacity', p.life.toFixed(2))
          } else el.setAttribute('opacity', '0')
        }
      }
    },
  })

  return (
    <div
      ref={box}
      aria-hidden="true"
      data-duck-pond
      onPointerDown={() => (poke.current = true)}
      className="relative mx-auto mt-3 aspect-[20/7] w-full max-w-md select-none overflow-hidden rounded-2xl bg-surface-2"
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
        <defs>
          <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'color-mix(in oklab, var(--heat-low) 14%, var(--surface-2))' }} />
            <stop offset="1" style={{ stopColor: 'var(--surface-2)' }} />
          </linearGradient>
          <linearGradient id={`${id}-deep`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'color-mix(in oklab, var(--heat-low) 62%, #5ec4ff)' }} />
            <stop offset="1" style={{ stopColor: 'color-mix(in oklab, var(--heat-low) 70%, #0b4f8a)' }} />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill={`url(#${id}-sky)`} />
        {/* The duck, then the front of the water over its belly. */}
        <polygon ref={back} fill={`url(#${id}-deep)`} points={`0,${REST} ${W},${REST} ${W},${H} 0,${H}`} />
        <g ref={duckEl} data-duck transform={`translate(${W / 2} ${REST}) rotate(0) scale(1 1)`}>
          {/* Tail, body, wing, head, beak and eye: a yellow duck looking right. */}
          <path d="M-17 -9 L-27 -20 Q-21 -21 -13 -17 Z" fill="#F2B705" />
          <ellipse cx="0" cy="-8" rx="20" ry="12.5" fill="#FFD23F" />
          <path d="M-12 -9 Q-3 -19 9 -9 Q1 -2 -12 -9 Z" fill="#F2B705" />
          <circle cx="13" cy="-24" r="10" fill="#FFD23F" />
          <path d="M21 -26 Q31 -26 31 -22.5 Q31 -19.5 21 -20 Z" fill="#FF8A1F" />
          <circle cx="16.5" cy="-27" r="2" fill="#1c1c1e" />
          <circle cx="17.2" cy="-27.8" r="0.7" fill="#fff" />
          <ellipse cx="11" cy="-21" rx="2.6" ry="1.6" fill="#FF8A1F" opacity="0.28" />
        </g>
        <polygon ref={front} fill={`url(#${id}-deep)`} opacity="0.6" points={`0,${REST + 2.5} ${W},${REST + 2.5} ${W},${H} 0,${H}`} />
        {/* A thin light line along the surface, and a fainter one under it, so it reads as water and not as a cut edge. */}
        <polyline ref={ripple} fill="none" stroke="white" strokeOpacity="0.2" strokeWidth="1" strokeLinejoin="round" />
        <polyline ref={foam} fill="none" stroke="white" strokeOpacity="0.55" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        {Array.from({ length: DROPS }, (_, i) => (
          <circle key={i} ref={(el) => void (drops.current[i] = el)} data-drop r="2" cx="0" cy="0" fill="white" fillOpacity="0.85" opacity="0" />
        ))}
      </svg>
    </div>
  )
}
