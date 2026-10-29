import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const position = (lat: number, lon: number, accuracy: number) => ({ coords: { latitude: lat, longitude: lon, accuracy } })

function stubGeolocation(impl: (ok: (p: unknown) => void, fail: (e: unknown) => void) => void) {
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: impl } })
}

const tx = (merchant: string) => ({
  kind: 'expense' as const, amountMinor: 100, currency: 'INR', categoryId: 1, merchant, note: '',
  date: '2026-10-01', paymentMethod: '', source: 'manual' as const,
})

beforeEach(async () => {
  await Dexie.delete('expense-tracker')
  vi.resetModules()
})
afterEach(() => vi.unstubAllGlobals())

async function load() {
  const [{ db }, loc, { addTransaction }] = await Promise.all([import('../db/schema'), import('./location'), import('../db/repo')])
  await db.open()
  return { db, addTransaction, ...loc }
}

describe('location recording', () => {
  it('saves nothing, and never asks the device, while the setting is off', async () => {
    const ask = vi.fn()
    stubGeolocation(ask)
    const { db, addTransaction, attachLocation } = await load()
    const id = await addTransaction(tx('Cafe'))
    await attachLocation(id)
    expect(ask).not.toHaveBeenCalled()
    expect((await db.transactions.get(id))!.location).toBeUndefined()
  })

  it('adds a rounded position to the transaction when the setting is on', async () => {
    stubGeolocation((ok) => ok(position(12.971598, 77.594566, 19.6)))
    const { db, addTransaction, attachLocation, setRecordLocation } = await load()
    await setRecordLocation(true)
    const id = await addTransaction(tx('Cafe'))
    await attachLocation(id)
    expect((await db.transactions.get(id))!.location).toEqual({ lat: 12.9716, lon: 77.5946, accuracyM: 20 })
  })

  it('keeps the transaction when the fix fails, and reports why', async () => {
    stubGeolocation((_ok, fail) => fail({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 }))
    const { db, addTransaction, attachLocation, setRecordLocation, getPlace } = await load()
    expect(await getPlace()).toEqual({ ok: false, reason: 'denied' })
    await setRecordLocation(true)
    const id = await addTransaction(tx('Cafe'))
    await attachLocation(id)
    expect(await db.transactions.get(id)).toMatchObject({ merchant: 'Cafe' })
    expect((await db.transactions.get(id))!.location).toBeUndefined()
  })

  it('does not bring back a transaction that was undone before the fix arrived', async () => {
    let deliver: ((p: unknown) => void) | null = null
    stubGeolocation((ok) => (deliver = ok))
    const { db, addTransaction, attachLocation, setRecordLocation } = await load()
    await setRecordLocation(true)
    const id = await addTransaction(tx('Cafe'))
    const pending = attachLocation(id)
    await vi.waitFor(() => expect(deliver).not.toBeNull()) // the device is now being asked
    await db.transactions.delete(id) // Undo
    deliver!(position(1, 2, 3))
    await pending
    expect(await db.transactions.get(id)).toBeUndefined()
  })

  it('removes saved locations one at a time or all at once', async () => {
    const { db, addTransaction, clearLocation, clearAllLocations } = await load()
    const place = { lat: 1, lon: 2, accuracyM: 3 }
    const a = await addTransaction({ ...tx('A'), location: place })
    const b = await addTransaction({ ...tx('B'), location: place })
    const c = await addTransaction(tx('C'))
    await clearLocation(a)
    expect((await db.transactions.get(a))!.location).toBeUndefined()
    expect(await clearAllLocations()).toBe(1)
    expect((await db.transactions.get(b))!.location).toBeUndefined()
    expect((await db.transactions.get(c))!.merchant).toBe('C')
  })

  it('says unsupported when the browser has no geolocation', async () => {
    vi.stubGlobal('navigator', {})
    const { getPlace } = await load()
    expect(await getPlace()).toEqual({ ok: false, reason: 'unsupported' })
  })
})
