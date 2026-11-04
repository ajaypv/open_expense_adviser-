/** Where the page leaves the widget's data for the service worker to read: a cache both can reach. */
export const WIDGET_CACHE = 'widget-data'
export const WIDGET_SNAPSHOT = 'widget-snapshot.json'

/** The address the snapshot is kept under, the same from the page and from the worker (the app's own folder). */
export const snapshotUrl = (base: string, origin: string) => new URL(`${base}${WIDGET_SNAPSHOT}`.replace(/\/{2,}/g, '/'), origin).href
