/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { localDateString } from './db/money'
import { db } from './db/schema'
import { readPrefs, readState, REMINDER_STATE_KEY, REMINDERS_KEY, shouldNotifyLog } from './reminders/logic'
import { WIDGET_CACHE, WIDGET_SNAPSHOT } from './widget/snapshot'
import { refreshWidgets, renderWidget, type WidgetDeps, type WidgetHost, type WidgetLike } from './widget/worker'

declare const self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// registerType is 'prompt': the page tells a waiting worker when to take over.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
  // The page has just left new figures for the widget.
  if (event.data?.type === 'WIDGET_REFRESH') event.waitUntil(refreshWidgets(widgetDeps()))
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

/** Brings the app forward if it is open, or opens it. */
const focusOrOpen = () =>
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const open = windows[0]
    return open ? open.focus() : self.clients.openWindow(self.registration.scope)
  })

// Tapping a notification focuses the app or opens it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(focusOrOpen())
})

/**
 * The widget, in the Windows 11 Widgets Board (the only place a web app can have one; a phone cannot). The page leaves its
 * figures in a cache whenever the ledger changes; the worker hands Windows the template and those figures when the widget is
 * added, comes back into view, the worker is updated, or the page says there is something new. In a browser with no widgets
 * none of these events ever arrive.
 */
const widgetDeps = (): WidgetDeps => ({
  widgets: (self as unknown as { widgets?: WidgetHost }).widgets,
  fetchText: async (url) => (await fetch(url)).text(),
  readSnapshot: async () => {
    const hit = await (await caches.open(WIDGET_CACHE)).match(new URL(WIDGET_SNAPSHOT, self.registration.scope).href)
    return hit ? hit.text() : null
  },
})

type WidgetEvent = ExtendableEvent & { widget: WidgetLike; action?: string }
for (const name of ['widgetinstall', 'widgetresume']) {
  self.addEventListener(name, (event) => {
    const e = event as WidgetEvent
    e.waitUntil(renderWidget(e.widget, widgetDeps()))
  })
}
self.addEventListener('widgetclick', (event) => {
  // The one button on the widget: open the app.
  if ((event as WidgetEvent).action === 'open') (event as WidgetEvent).waitUntil(focusOrOpen())
})
self.addEventListener('activate', (event) => event.waitUntil(refreshWidgets(widgetDeps())))
