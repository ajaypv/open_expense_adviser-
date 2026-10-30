/** Thin wrappers over the Notifications, Badging and Periodic Sync APIs, each safe to call anywhere. */

export const DAILY_TAG = 'daily-reminder'
const PERIODIC_MIN_MS = 12 * 60 * 60 * 1000

export type Permission = NotificationPermission | 'unsupported'

export const notificationPermission = (): Permission =>
  typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'

/**
 * Ask for permission. This must be called from a tap: iPhones only show the prompt for a direct
 * user action, and browsers increasingly ignore prompts at page load.
 */
export async function requestNotificationPermission(): Promise<Permission> {
  if (!('Notification' in window)) return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/**
 * Show a system notification through the service worker (the only way that works on installed
 * phone apps). Returns false when it could not be shown.
 */
export async function notify(title: string, body: string, tag: string): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' })
      return true
    }
    new Notification(title, { body, tag })
    return true
  } catch {
    return false
  }
}

/** A number on the app icon, where supported. Zero clears it. */
export async function setBadge(count: number): Promise<void> {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  try {
    if (count > 0) await nav.setAppBadge?.(count)
    else await nav.clearAppBadge?.()
  } catch {
    /* not supported or not allowed */
  }
}

type PeriodicRegistration = ServiceWorkerRegistration & {
  periodicSync?: { register: (tag: string, o: { minInterval: number }) => Promise<void>; unregister: (tag: string) => Promise<void> }
}

/**
 * Ask the browser to wake the app now and then, so the reminder can fire even when the app is closed.
 * Only some Android browsers allow this, and they choose how often. Returns whether it was registered.
 */
export async function schedulePeriodicReminder(enabled: boolean): Promise<boolean> {
  try {
    const reg = (await navigator.serviceWorker?.ready) as PeriodicRegistration | undefined
    if (!reg?.periodicSync) return false
    if (!enabled) {
      await reg.periodicSync.unregister(DAILY_TAG)
      return false
    }
    await reg.periodicSync.register(DAILY_TAG, { minInterval: PERIODIC_MIN_MS })
    return true
  } catch {
    return false
  }
}
