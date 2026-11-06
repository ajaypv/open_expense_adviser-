import { useId, type CSSProperties } from 'react'

/** One wave as a tile that repeats: the surface rises and falls once in 28 pixels, and meets itself at both ends. */
const WAVE = 'M0 4C7 -0.5 7 -0.5 14 4C21 8.5 21 8.5 28 4V0H0Z'

/** A strip of wave. It is drawn in the colour of what is above the water (`--wave-sky`), so what shows below it is the water's own wavy surface. */
function Wave({ id, className }: { id: string; className: string }) {
  return (
    <svg aria-hidden="true" className={`water-wave ${className}`} height="8" width="100%" style={{ width: 'calc(100% + 28px)' }}>
      <defs>
        <pattern id={id} width="28" height="8" patternUnits="userSpaceOnUse">
          <path d={WAVE} />
        </pattern>
      </defs>
      <rect width="100%" height="8" fill={`url(#${id})`} />
    </svg>
  )
}

/**
 * The rolling surface: two waves, one behind the other, sliding along in opposite ways, and sloshing up and settling when they
 * come into view, like a bottle just filled and shaken. Put it at the top edge of the water, inside something that clips it, and
 * set `--wave-sky` on a parent to the colour above the water.
 */
export function WaveCover() {
  const id = useId().replace(/:/g, '')
  return (
    <span aria-hidden="true" className="water-slosh absolute inset-x-0 top-0">
      <Wave id={`${id}-b`} className="water-wave-back" />
      <Wave id={`${id}-f`} className="water-wave-front" />
    </span>
  )
}

/** Where the little bubbles rise, as a share of the width, and when they start. */
const BUBBLES = [
  { left: '14%', delay: '0s', size: 5 },
  { left: '41%', delay: '1.3s', size: 4 },
  { left: '68%', delay: '0.6s', size: 6 },
  { left: '86%', delay: '2s', size: 4 },
]

interface TankProps {
  /** How full it is, from 0 to 1. */
  level: number
  /** The water's colour. */
  color: string
  /** The colour of the empty part, which the waves are cut out of. */
  sky: string
  /** Rises from empty when first drawn (the first time the screen is shown), rather than starting at its level. */
  rise?: boolean
  className?: string
}

/**
 * A tank of water that fills to `level`: the water rises to it, rolls along its surface, and keeps a few bubbles drifting up.
 * A change of level rises or falls to the new one. Only transforms move, so it is cheap to keep running.
 */
export function WaterTank({ level, color, sky, rise = false, className = '' }: TankProps) {
  // Never quite empty, so a little spent still looks like water, and never past the brim.
  const shown = Math.min(1, Math.max(0.1, level))
  return (
    <div
      data-water
      data-level={Math.round(level * 100)}
      className={`water-tank relative overflow-hidden ${className}`}
      style={{ background: sky, '--wave-sky': sky } as CSSProperties}
    >
      <div className={`water-level absolute inset-0${rise ? ' water-rise' : ''}`} style={{ transform: `translateY(${(1 - shown) * 100}%)` }}>
        <span className="absolute inset-0" style={{ background: color }} />
        <WaveCover />
        {BUBBLES.map((b) => (
          <span key={b.left} aria-hidden="true" className="water-bubble absolute bottom-1 rounded-full" style={{ left: b.left, width: b.size, height: b.size, animationDelay: b.delay }} />
        ))}
      </div>
    </div>
  )
}
