import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Globe, Marker } from 'cobe'
import { formatMoney } from '../db/money'
import type { Spot } from '../insights/places'

type Rgb = [number, number, number]

interface Props {
  spots: Spot[]
  currency: string
  /** The place to turn to face, by its key; none lets the globe turn by itself. */
  focusKey: string | null
}

const TAU = Math.PI * 2
const TILT = 0.3
const FALLBACK: Rgb = [0.2, 0.5, 1]

/** The angles that bring a place to the middle of the globe: cobe turns west as `phi` grows, and `theta` is the latitude. */
export function facing(lat: number, lon: number): { phi: number; theta: number } {
  return { phi: -(lon * Math.PI) / 180 - Math.PI / 2, theta: (lat * Math.PI) / 180 }
}

/** How big a place's dot is on the globe: by what was spent there, so the biggest stands out and a small one is still seen. */
export function dotSize(totalMinor: number, mostMinor: number, focused: boolean): number {
  const size = 0.035 + 0.055 * Math.sqrt(Math.max(0, totalMinor) / Math.max(1, mostMinor))
  return focused ? size * 1.45 : size
}

/** Any CSS colour, the app's own variables too, as red, green and blue between 0 and 1. */
function rgbOf(css: string, at: HTMLElement): Rgb {
  try {
    const probe = document.createElement('span')
    probe.style.color = css
    at.appendChild(probe)
    const resolved = getComputedStyle(probe).color
    probe.remove()
    const pixel = document.createElement('canvas')
    pixel.width = pixel.height = 1
    const ctx = pixel.getContext('2d', { willReadFrequently: true })
    if (!ctx || !resolved) return FALLBACK
    ctx.fillStyle = resolved
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return [r / 255, g / 255, b / 255]
  } catch {
    return FALLBACK
  }
}

/** Whether the page is dark right now, read from what is actually painted so it follows the theme however it was set. */
function pageIsDark(): boolean {
  try {
    const [r, g, b] = rgbOf(getComputedStyle(document.body).backgroundColor || '#fff', document.body)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5
  } catch {
    return false
  }
}

const reducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * The places as dots on a turning globe. It is drawn on the phone (WebGL, with cobe's own tiny world map), so nothing is loaded
 * from a server and nothing about where you spend is sent anywhere. Drag sideways to turn it; pick a place in the list and the
 * globe swings round to it. A page that scrolls with one finger keeps doing so, since only sideways drags turn the globe.
 * Where WebGL is missing the globe is simply not shown, and the list beside it still works.
 */
export function PlacesGlobe({ spots, currency, focusKey }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const globe = useRef<Globe | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  const latest = useRef({ spots, focusKey })
  latest.current = { spots, focusKey }
  // Where the globe is facing now, where it is heading, and whether a finger is turning it.
  const view = useRef({ phi: 0, theta: TILT, target: null as { phi: number; theta: number } | null, drag: null as number | null, dirty: 30 })

  const markers = (): Marker[] => {
    const { spots: list, focusKey: key } = latest.current
    const most = Math.max(1, ...list.map((s) => s.totalMinor))
    const at = wrap.current ?? document.body
    return list.map((s) => ({ location: [s.lat, s.lon], size: dotSize(s.totalMinor, most, s.key === key), color: rgbOf(s.color, at), id: s.key }))
  }

  // The globe itself: made once the canvas is there, and taken down again with it.
  useEffect(() => {
    const el = canvas.current
    const box = wrap.current
    if (!el || !box) return
    let gone = false
    let raf = 0
    let visible = true
    const cleanups: (() => void)[] = []

    void import('cobe')
      .then(({ default: createGlobe }) => {
        if (gone) return
        const side = () => Math.max(1, Math.round(box.clientWidth || 320))
        const px = () => Math.round(side() * Math.min(2, window.devicePixelRatio || 1))
        let dark = pageIsDark()
        const paint = (isDark: boolean) =>
          isDark
            ? { dark: 1, baseColor: [0.4, 0.42, 0.52] as Rgb, glowColor: [0.1, 0.12, 0.2] as Rgb, mapBrightness: 6 }
            : { dark: 0, baseColor: [0.95, 0.95, 0.97] as Rgb, glowColor: [1, 1, 1] as Rgb, mapBrightness: 6 }

        const first = latest.current.spots.find((s) => s.key === latest.current.focusKey) ?? latest.current.spots[0]
        if (first) Object.assign(view.current, facing(first.lat, first.lon), { target: null })
        const g = createGlobe(el, {
          width: px(),
          height: px(),
          devicePixelRatio: 1,
          phi: view.current.phi,
          theta: view.current.theta,
          diffuse: 1.2,
          scale: 1.15,
          mapSamples: 16000,
          markerColor: FALLBACK,
          markers: markers(),
          ...paint(dark),
        })
        globe.current = g

        const resize = new ResizeObserver(() => {
          g.update({ width: px(), height: px() })
          view.current.dirty = 2
        })
        resize.observe(box)
        cleanups.push(() => resize.disconnect())

        // Only drawn while it can be seen.
        if (typeof IntersectionObserver !== 'undefined') {
          const seen = new IntersectionObserver((entries) => {
            visible = entries.some((e) => e.isIntersecting)
          })
          seen.observe(box)
          cleanups.push(() => seen.disconnect())
        }

        const retheme = () => {
          const now = pageIsDark()
          if (now === dark) return
          dark = now
          g.update(paint(now))
          view.current.dirty = 2
        }
        const media = window.matchMedia?.('(prefers-color-scheme: dark)')
        media?.addEventListener?.('change', retheme)
        const watch = new MutationObserver(retheme)
        watch.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] })
        cleanups.push(() => {
          media?.removeEventListener?.('change', retheme)
          watch.disconnect()
        })

        const still = reducedMotion()
        const frame = () => {
          raf = requestAnimationFrame(frame)
          const v = view.current
          if (!visible || document.hidden) return
          let moved = v.dirty > 0
          if (v.dirty > 0) v.dirty -= 1
          if (v.drag === null) {
            if (v.target) {
              // Swing round the short way and settle.
              const dPhi = ((v.target.phi - v.phi + Math.PI) % TAU + TAU) % TAU - Math.PI
              const dTheta = v.target.theta - v.theta
              v.phi += dPhi * 0.12
              v.theta += dTheta * 0.12
              if (Math.abs(dPhi) < 0.001 && Math.abs(dTheta) < 0.001) v.target = null
              moved = true
            } else if (!still && latest.current.focusKey === null) {
              v.phi += 0.003
              moved = true
            }
          }
          if (moved) g.update({ phi: v.phi, theta: v.theta })
        }
        raf = requestAnimationFrame(frame)
      })
      .catch(() => {
        // No WebGL (or it would not start): leave the globe out.
        if (!gone) setUnsupported(true)
      })

    return () => {
      gone = true
      cancelAnimationFrame(raf)
      cleanups.forEach((c) => c())
      globe.current?.destroy()
      globe.current = null
    }
  }, [])

  // The dots follow the spots, and the place picked is made bigger and turned to.
  useEffect(() => {
    globe.current?.update({ markers: markers() })
    view.current.dirty = 2
    const spot = spots.find((s) => s.key === focusKey)
    if (spot) view.current.target = facing(spot.lat, spot.lon)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots, focusKey])

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    view.current.drag = e.clientX
    view.current.target = null
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const v = view.current
    if (v.drag === null) return
    const width = e.currentTarget.clientWidth || 320
    v.phi += ((e.clientX - v.drag) / width) * Math.PI
    v.drag = e.clientX
    globe.current?.update({ phi: v.phi, theta: v.theta })
  }
  const up = () => {
    view.current.drag = null
  }

  if (unsupported) return null
  const picked = spots.find((s) => s.key === focusKey)

  return (
    <div className="mt-3 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]">
      <div ref={wrap} className="mx-auto aspect-square w-full max-w-[22rem]">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Globe with ${spots.length} ${spots.length === 1 ? 'place' : 'places'} where you spent`}
          data-places-globe
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="size-full cursor-grab touch-pan-y active:cursor-grabbing"
        />
      </div>
      <p aria-live="polite" className="mt-2 min-h-[2.75rem] text-center text-sm text-ink-2">
        {picked ? (
          <>
            <span className="font-semibold text-ink">{picked.name}</span>
            {`: ${picked.count} ${picked.count === 1 ? 'time' : 'times'}, ${formatMoney(picked.totalMinor, currency)}`}
          </>
        ) : (
          'Drag to turn the globe. Tap a place in the list to find it.'
        )}
      </p>
    </div>
  )
}
