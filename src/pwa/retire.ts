/**
 * In the Android app the pages are part of the app itself, so a service worker has nothing to keep and can only get in the way: a
 * copy of the old pages kept by an earlier version could be shown instead of the new ones. This removes any worker and the copies it
 * kept. Quiet where there are none. Returns whether it got as far as asking.
 */
export async function retireServiceWorker(): Promise<boolean> {
  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? []
    await Promise.all(registrations.map((r) => r.unregister()))
    if (typeof caches !== 'undefined') await Promise.all((await caches.keys()).map((key) => caches.delete(key)))
    return true
  } catch {
    return false
  }
}
