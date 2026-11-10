import type { WidgetData } from './data'
import { isAndroidApp, publishToAndroid } from './native'
import { snapshotUrl, WIDGET_CACHE } from './snapshot'

/**
 * Leaves the widget's data where the widget can read it: in the Android app, with the app's own widget; otherwise where the service
 * worker can read it, and tells the worker to redraw. Quiet where there is no
 * cache or no worker (an ordinary tab, a browser without them). Returns whether it was left. This is the page's half; the
 * worker's is in sw.ts, which is why the shared names are in snapshot.ts and not here: the worker has no use for the page's types.
 */
export async function publishWidgetData(data: WidgetData): Promise<boolean> {
  // Inside the Android app the widget is on the home screen and is handed its figures directly.
  if (isAndroidApp()) return publishToAndroid(data)
  if (typeof caches === 'undefined') return false
  try {
    const cache = await caches.open(WIDGET_CACHE)
    await cache.put(snapshotUrl(import.meta.env.BASE_URL, location.origin), new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }))
    const registration = await navigator.serviceWorker?.ready
    registration?.active?.postMessage({ type: 'WIDGET_REFRESH' })
    return true
  } catch {
    return false
  }
}
