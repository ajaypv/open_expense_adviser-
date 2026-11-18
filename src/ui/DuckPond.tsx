import { useId, useRef } from 'react'
import { DEPTH, H, POND_LEAN, W, duckTarget, lineAt, newDuck, slopeAt, splash, stepDrops, stepDuck, type Drop } from './duckPhysics'
import { useSway } from './useSway'
import { COLUMNS, idleLean, leanFor, stepLean, surfaceLine, waveLine, type Lean } from './waterSurface'

const DROPS = 8
const num = (n: number) => n.toFixed(1)
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** The water level at rest, measured down from the top of the picture. */
const REST = H - DEPTH

/** The duck itself, a yellow one looking right, drawn about its waterline: the middle of its belly is at 0,0 and its head is about 34 above. */
export function DuckShape() {
  const id = useId().replace(/:/g, '')
  return (
    <>
      <defs>
        <radialGradient id={`${id}-down`} cx="0.32" cy="0.18" r="0.85">
          <stop offset="0" stopColor="#fff6aa" />
          <stop offset="0.45" stopColor="#ffda45" />
          <stop offset="1" stopColor="#eda916" />
        </radialGradient>
        <linearGradient id={`${id}-wing`} x1="0" y1="0" x2="0.5" y2="1">
          <stop stopColor="#ffe977" />
          <stop offset="1" stopColor="#e9a516" />
        </linearGradient>
        <linearGradient id={`${id}-bill`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#ffbe59" />
          <stop offset="1" stopColor="#ed751c" />
        </linearGradient>
      </defs>
      <path d="M-15 -8Q-27 -12 -28 -23Q-21 -18 -12 -18Z" fill={`url(#${id}-wing)`} stroke="#d99418" strokeWidth="0.6" />
      <path d="M-22 -11C-21 -23 -7 -22 3 -18Q7 -18 7 -25L20 -22Q17 -15 21 -9C25 5 -11 11 -21 -3Q-23 -7 -22 -11Z" fill={`url(#${id}-down)`} />
      <path d="M-14 -11Q-5 -19 8 -10Q4 0 -7 -3Q-13 -4 -14 -11Z" fill={`url(#${id}-wing)`} stroke="#df9b17" strokeWidth="0.6" />
      <path d="M-11 -11Q-4 -15 2 -11M-10 -8Q-5 -10 0 -8" fill="none" stroke="#fff0a2" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
      <path d="M7 -31Q3 -37 9 -35Q10 -39 14 -34" fill="#ffdf54" />
      <circle cx="13" cy="-25" r="10.5" fill={`url(#${id}-down)`} />
      <path d="M6 -29Q8 -33 13 -32" fill="none" stroke="#fffbd0" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <path d="M21 -26Q28 -27 32 -23Q30 -19 21 -21Z" fill={`url(#${id}-bill)`} stroke="#da711d" strokeWidth="0.6" />
      <path d="M23 -22.5Q27 -21.5 30 -23" fill="none" stroke="#b85a15" strokeWidth="0.7" strokeLinecap="round" />
      <circle cx="25" cy="-24" r="0.65" fill="#b85a15" />
      <g data-duck-eye>
        <ellipse cx="17" cy="-27.5" rx="2.1" ry="2.5" fill="#292524" />
        <circle cx="17.6" cy="-28.4" r="0.8" fill="#fff" />
      </g>
      <ellipse cx="12.5" cy="-22" rx="3" ry="1.8" fill="#f69638" opacity="0.4" />
      <path d="M-17 -15Q-13 -18 -8 -17" fill="none" stroke="#fff9bf" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
    </>
  )
}

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
  const wake = useRef<SVGGElement>(null)
  const landing = useRef<SVGEllipseElement>(null)
  const light = useRef<SVGGElement>(null)
  const drops = useRef<(SVGCircleElement | null)[]>([])
  const poke = useRef(false)
  const id = useId().replace(/:/g, '')

  useSway(box, {
    idle: false,
    setup: (el) => {
      const duck = newDuck()
      const eye = el.querySelector<SVGGElement>('[data-duck-eye]')
      let lean: Lean = { angle: 0, speed: 0 }
      let flying: Drop[] = []
      let began = false
      let last = 0
      // Extra swell from a landing, which dies away.
      let kick = 0
      let landedAt = -10
      let landedX = W / 2
      return ({ shake, seconds, sensors }) => {
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
        const target = (sensors.live ? leanFor(sensors.roll, sensors.push) : idleLean(seconds)) + Math.sin(seconds * 17) * 0.22 * shake
        lean = stepLean(lean, target, dt)
        kick *= Math.pow(0.12, dt)
        const swell = 1.3 + Math.min(Math.abs(lean.speed), 2.5) * 1.4 + shake * 3 + kick

        // The pond is shallow, so the surface leans less than the water in a bottle would, and stays in the picture.
        const line = surfaceLine(W, H, DEPTH, clamp(lean.angle * 0.45, -POND_LEAN, POND_LEAN))
        const ys = waveLine(line, H, seconds, swell)

        const hit = stepDuck(duck, dt, { target: duckTarget(lean.angle, seconds, sensors.live), shake, poke: poke.current, rand: Math.random })
        poke.current = false
        const surface = lineAt(ys, duck.x)
        if (hit > 60) {
          flying.push(...splash(duck.x, surface, hit, Math.random))
          flying = flying.slice(-DROPS)
          // The water is thrown the way the duck was going, and the surface rocks harder.
          lean = { angle: lean.angle, speed: lean.speed + duck.dir * Math.min(hit / 260, 1.8) }
          kick = Math.min(kick + hit / 130, 5)
          landedAt = seconds
          landedX = duck.x
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
        wake.current?.setAttribute('transform', `translate(${num(duck.x)} ${num(surface + 1)}) rotate(${num(slopeAt(ys, duck.x))})`)
        wake.current?.setAttribute('opacity', num(clamp(1 - duck.hy / 22, 0, 1)))
        const age = seconds - landedAt
        landing.current?.setAttribute('transform', `translate(${num(landedX)} ${num(lineAt(ys, landedX) + 2)}) rotate(${num(slopeAt(ys, landedX))})`)
        landing.current?.setAttribute('rx', num(18 + Math.min(age, 1.2) * 42))
        landing.current?.setAttribute('ry', num(2 + Math.min(age, 1.2) * 7))
        landing.current?.setAttribute('opacity', (Math.max(0, 1 - age / 1.2) * 0.65).toFixed(2))
        light.current?.setAttribute('transform', `translate(${num(Math.sin(seconds * 0.45) * 9)} ${num(Math.cos(seconds * 0.6) * 2)})`)
        const blink = seconds % 4.7
        eye?.setAttribute('transform', `translate(0 -27.5) scale(1 ${blink > 4.52 ? 0.15 : 1}) translate(0 27.5)`)

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
            <stop offset="0" style={{ stopColor: 'color-mix(in oklab, #8edcd8 18%, var(--surface-2))' }} />
            <stop offset="1" style={{ stopColor: 'var(--surface-2)' }} />
          </linearGradient>
          <linearGradient id={`${id}-deep`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#62d9dc" />
            <stop offset="0.35" stopColor="#30aaca" />
            <stop offset="1" style={{ stopColor: 'color-mix(in oklab, var(--heat-low) 25%, #176b9b)' }} />
          </linearGradient>
          <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#b6f6ec" stopOpacity="0.5" />
            <stop offset="0.2" stopColor="#55c9d5" stopOpacity="0.25" />
            <stop offset="1" stopColor="#146491" stopOpacity="0.5" />
          </linearGradient>
          <clipPath id={`${id}-water`}>
            <polygon ref={back} points={`0,${REST} ${W},${REST} ${W},${H} 0,${H}`} />
          </clipPath>
        </defs>
        <rect width={W} height={H} fill={`url(#${id}-sky)`} />
        <path d="M24 27H48M29 31H39M263 41H290M277 45H298" stroke="#97d8d9" strokeOpacity="0.2" strokeWidth="1.5" strokeLinecap="round" />
        {/* The duck, then the front of the water over its belly. */}
        <g clipPath={`url(#${id}-water)`}>
          <rect width={W} height={H} fill={`url(#${id}-deep)`} />
          <g ref={light} fill="none" stroke="#d6fff4" strokeLinecap="round">
            <path d="M-15 83Q28 73 68 84T148 84T228 84T338 84" strokeWidth="7" opacity="0.09" />
            <path d="M12 98Q50 86 94 96T178 96T267 96T340 96" strokeWidth="3" opacity="0.14" />
            <path d="M35 106Q56 99 81 105M189 109Q213 101 246 107" strokeWidth="1.4" opacity="0.22" />
          </g>
        </g>
        <g ref={duckEl} data-duck transform={`translate(${W / 2} ${REST}) rotate(0) scale(1 1)`}>
          <DuckShape />
        </g>
        <polygon ref={front} fill={`url(#${id}-front)`} points={`0,${REST + 2.5} ${W},${REST + 2.5} ${W},${H} 0,${H}`} />
        {/* A thin light line along the surface, and a fainter one under it, so it reads as water and not as a cut edge. */}
        <polyline ref={ripple} fill="none" stroke="white" strokeOpacity="0.2" strokeWidth="1" strokeLinejoin="round" />
        <polyline ref={foam} fill="none" stroke="#e5fffa" strokeOpacity="0.7" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
        <g ref={wake} data-wake transform={`translate(${W / 2} ${REST + 1}) rotate(0)`} fill="none" strokeLinecap="round">
          <ellipse cy="3" rx="23" ry="3.5" fill="#125e83" fillOpacity="0.12" />
          <path d="M-25 0C-39 5 -20 9 -9 8M23 0C36 3 27 7 18 7" stroke="#dcfff7" strokeOpacity="0.7" strokeWidth="1.2" />
          <path d="M-34 3Q-45 9 -24 12M32 4Q42 8 30 10" stroke="#d3fff5" strokeOpacity="0.3" strokeWidth="0.9" />
        </g>
        <ellipse ref={landing} data-landing-ripple cx="0" cy="0" rx="18" ry="2" fill="none" stroke="#e5fffa" strokeWidth="1.3" opacity="0" />
        {Array.from({ length: DROPS }, (_, i) => (
          <circle key={i} ref={(el) => void (drops.current[i] = el)} data-drop r="2" cx="0" cy="0" fill="white" fillOpacity="0.85" opacity="0" />
        ))}
      </svg>
    </div>
  )
}
