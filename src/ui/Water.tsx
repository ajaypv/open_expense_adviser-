import { useId } from 'react'

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
