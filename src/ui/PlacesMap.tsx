import { useEffect, useRef, useState } from 'react'
import { formatMoney } from '../db/money'
import type { Spot } from '../insights/places'
import { PlacesGlobe } from './PlacesGlobe'

interface Props {
  spots: Spot[]
  currency: string
  /** For the list's name: "Places in October". */
  monthName: string
}

const REMEMBER = 'placesMapShown'

/** Once the map has been asked for, it comes straight back for the rest of the visit. */
function remembered(): boolean {
  try {
    return sessionStorage.getItem(REMEMBER) === '1' && navigator.onLine !== false
  } catch {
    return false
  }
}

/**
 * Where the month's spending was recorded: the biggest places as a list, and an OpenStreetMap to see them on.
 * The map is not loaded until it is asked for, because its pictures come from OpenStreetMap's servers and
 * loading them tells those servers roughly which area is being looked at. Everything else stays on the phone.
 */
export function PlacesMap({ spots, currency, monthName }: Props) {
  const [shown, setShown] = useState(remembered)
  const [offline, setOffline] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  // The place picked in the list, which the globe turns to face.
  const [picked, setPicked] = useState<string | null>(null)
  const pickedKey = spots.some((s) => s.key === picked) ? picked : null

  useEffect(() => {
    if (!shown) return
    let stop: (() => void) | undefined
    let gone = false
    // Leaflet and its styles arrive only now.
    void import('./leafletMap').then(({ drawMap }) => {
      if (!gone && box.current) stop = drawMap(box.current, spots, currency)
    })
    return () => {
      gone = true
      stop?.()
    }
  }, [shown, spots, currency])

  function show() {
    if (navigator.onLine === false) {
      setOffline(true)
      return
    }
    setOffline(false)
    setShown(true)
    try {
      sessionStorage.setItem(REMEMBER, '1')
    } catch {
      // Not remembering is fine: the map is one tap away again.
    }
  }

  return (
    <div className="mt-3">
      <ul aria-label={`Places in ${monthName}`} className="divide-y divide-line rounded-3xl bg-surface px-4 shadow-[0_0_0_1px_var(--ring)]">
        {spots.slice(0, 5).map((s) => (
          <li key={s.key}>
            <button
              type="button"
              aria-pressed={s.key === pickedKey}
              aria-label={`${s.name}, ${s.count} ${s.count === 1 ? 'time' : 'times'}, ${formatMoney(s.totalMinor, currency)}. Show on the globe`}
              onClick={() => setPicked(s.key === pickedKey ? null : s.key)}
              className="flex min-h-14 w-full items-center gap-3 py-3 text-left"
            >
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.name}</span>
                <span className="block text-sm text-ink-2">{`${s.count} ${s.count === 1 ? 'time' : 'times'}`}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{formatMoney(s.totalMinor, currency)}</span>
            </button>
          </li>
        ))}
      </ul>

      <PlacesGlobe spots={spots} currency={currency} focusKey={pickedKey} />

      {shown ? (
        // A stacking context of its own, so the map's panes never climb over the tab bar or a sheet.
        <div ref={box} role="region" aria-label="Map of where you spent" className="relative isolate z-0 mt-3 h-72 overflow-hidden rounded-3xl bg-surface-2 shadow-[0_0_0_1px_var(--ring)]" />
      ) : (
        <>
          <button type="button" onClick={show} className="mt-3 min-h-12 w-full rounded-full bg-btn px-5 font-semibold text-btn-ink">
            Show map
          </button>
          <p className="mt-2 text-sm text-ink-2">
            The map&rsquo;s pictures come from OpenStreetMap, so showing it tells them roughly which area you are looking at. Nothing from your
            transactions is sent.
          </p>
          {offline && (
            <p role="status" className="mt-2 text-sm text-critical">
              The map needs an internet connection.
            </p>
          )}
        </>
      )}
    </div>
  )
}
