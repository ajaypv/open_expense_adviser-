import { db, type Place } from '../db/schema'

const SETTING = 'recordLocation'

export type PlaceResult = { ok: true; place: Place } | { ok: false; reason: 'denied' | 'unavailable' | 'timeout' | 'unsupported' }

/** About 11 metres: enough to tell which shop, not enough to be a precise trail. */
const round = (n: number) => Math.round(n * 1e4) / 1e4

/**
 * One position fix. Never throws. Calling it from a tap is what makes the browser show its
 * permission prompt; a cached fix up to five minutes old is fine for "where was this added".
 */
export function getPlace(timeoutMs = 8000): Promise<PlaceResult> {
  if (!('geolocation' in navigator)) return Promise.resolve({ ok: false, reason: 'unsupported' })
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          ok: true,
          place: { lat: round(p.coords.latitude), lon: round(p.coords.longitude), accuracyM: Math.round(p.coords.accuracy) },
        }),
      (e) => resolve({ ok: false, reason: e.code === e.PERMISSION_DENIED ? 'denied' : e.code === e.TIMEOUT ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60_000 },
    )
  })
}

/** 'unsupported' where the Permissions API can't answer (older Safari); then only a real request tells. */
export async function permissionState(): Promise<PermissionState | 'unsupported'> {
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state
  } catch {
    return 'unsupported'
  }
}

export async function isRecordingLocation(): Promise<boolean> {
  return (await db.settings.get(SETTING))?.value === true
}

export async function setRecordLocation(on: boolean): Promise<void> {
  if (on) await db.settings.put({ key: SETTING, value: true })
  else await db.settings.delete(SETTING)
}

/**
 * Called right after a transaction is saved. The save never waits for the position fix: if the
 * fix arrives, it is added to the row (and quietly dropped if the row was undone meanwhile).
 */
export async function attachLocation(id: number): Promise<void> {
  if (!(await isRecordingLocation())) return
  const result = await getPlace()
  if (result.ok) await db.transactions.update(id, { location: result.place })
}

export async function clearLocation(id: number): Promise<void> {
  await db.transactions.where('id').equals(id).modify((t) => {
    delete t.location
  })
}

/** Remove every saved location. Returns how many transactions were changed. */
export async function clearAllLocations(): Promise<number> {
  return db.transactions.filter((t) => t.location !== undefined).modify((t) => {
    delete t.location
  })
}
