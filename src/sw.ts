/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { localDateString } from './db/money'
import { db } from './db/schema'
import { readPrefs, readState, REMINDER_STATE_KEY, REMINDERS_KEY, shouldNotifyLog } from './reminders/logic'

declare const self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// registerType is 'prompt': the page tells a waiting worker when to take over.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
clientsClaim()

/**
 * Where supported (some Android browsers, for installed apps), the browser wakes this worker every
 * so often even with the app closed. If it is past the reminder time and nothing has been logged
 * today, show the nudge. The browser decides how often this runs, so it is a best effort.
 */
async function dailyReminder() {
  const now = new Date()
  const today = localDateString(now)
  const prefs = readPrefs((await db.settings.get(REMINDERS_KEY))?.value)
  const state = readState((await db.settings.get(REMINDER_STATE_KEY))?.value)
  const logged =
    (await db.transactions
      .filter((t) => t.deletedAt === undefined && t.source !== 'recurring' && (t.date === today || localDateString(new Date(t.createdAt)) === today))
      .count()) > 0
  if (!shouldNotifyLog(now, today, prefs, logged, state)) return
  await self.registration.showNotification('Log today’s spending', {
    body: 'Nothing added today yet. It only takes a few seconds.',
    tag: 'daily-reminder',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
  })
  await db.settings.put({ key: REMINDER_STATE_KEY, value: { ...state, lastLogNudge: today } })
}

self.addEventListener('periodicsync', (event) => {
  const e = event as ExtendableEvent & { tag: string }
  if (e.tag === 'daily-reminder') e.waitUntil(dailyReminder())
})

// Tapping a notification focuses the app or opens it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows[0]
      return open ? open.focus() : self.clients.openWindow(self.registration.scope)
    }),
  )
})
