import { useEffect, useState } from 'react'
import type { Here } from '../insights/suggestions'
import { getPlace, isRecordingLocation, permissionState } from './location'

/**
 * Where the user is right now, to rank suggestions, but only while they are entering something: it looks when
 * the add form opens (`active` turns true) and at no other time. Not when the app starts, not when it comes back
 * to the front, not when the form shuts. It asks the device for where it is now, never for an older fix; it never
 * triggers a permission prompt of its own, and it only runs if the user turned location on and the browser
 * already allows it. The position is held in memory while the form is open and dropped when it shuts, so there
 * is no history and a stale position is never shown the next time.
 */
export function useNearby(active: boolean): Here | null {
  const [here, setHere] = useState<Here | null>(null)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    void (async () => {
      if (!(await isRecordingLocation()) || (await permissionState()) !== 'granted') return
      const result = await getPlace(6000)
      if (!cancelled && result.ok) setHere({ lat: result.place.lat, lon: result.place.lon })
    })()
    return () => {
      cancelled = true
      setHere(null)
    }
  }, [active])

  return here
}
