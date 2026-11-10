import { useEffect, useRef } from 'react'
import { isAndroidApp, takeLaunchView } from './native'

/**
 * Where a touch on the Timeline widget goes: the app opens on its Timeline. The phone leaves a note when the app is opened from the
 * widget; this reads it when the app starts and each time it comes back to the front (a running app is brought forward, not started
 * again), and calls `onTimeline` for it. Nothing happens outside the Android app.
 */
export function useWidgetLaunch(onTimeline: () => void): void {
  const latest = useRef(onTimeline)
  useEffect(() => {
    latest.current = onTimeline
  })

  useEffect(() => {
    if (!isAndroidApp()) return
    let alive = true
    const look = async () => {
      if (document.visibilityState === 'hidden') return
      if ((await takeLaunchView()) === 'timeline' && alive) latest.current()
    }
    void look()
    document.addEventListener('visibilitychange', look)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', look)
    }
  }, [])
}
