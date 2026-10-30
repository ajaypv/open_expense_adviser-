import { useEffect, useState } from 'react'
import type { Here } from '../insights/suggestions'
import { getPlace, isRecordingLocation, permissionState } from './location'

/**
 * Where the user is right now, only if they have turned location on and the browser already
 * allows it. It never triggers a permission prompt of its own, and it never keeps a history:
 * the position is held in memory just to rank suggestions. Re-checked whenever the app comes
 * back to the front, or `refreshKey` changes (for example when the add form opens).
 */
export function useNearby(refreshKey: unknown): Here | null {
  const [here, setHere] = useState<Here | null>(null)
  const [visible, setVisible] = useState(0)

  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && setVisible((v) => v + 1)
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!(await isRecordingLocation()) || (await permissionState()) !== 'granted') {
        if (!cancelled) setHere(null)
        return
      }
      const result = await getPlace(6000) // a cached fix up to five minutes old is fine
      if (!cancelled) setHere(result.ok ? { lat: result.place.lat, lon: result.place.lon } : null)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshKey, visible])

  return here
}
