import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  }
}

beforeEach(async () => {
  await Dexie.delete('expense-tracker')
  vi.resetModules()
  vi.stubGlobal('localStorage', fakeStorage())
})

async function load() {
  const [{ db }, lock] = await Promise.all([import('../db/schema'), import('./lock')])
  await db.open()
  return { db, ...lock }
}

describe('PIN rules', () => {
  it('accepts 4 to 8 digits only', async () => {
    const { validPin } = await load()
    expect(['1234', '12345678', '0000'].every(validPin)).toBe(true)
    expect(['123', '123456789', 'abcd', '12 34', '', '12.34'].some(validPin)).toBe(false)
  })

  it('hashes with a random salt and verifies the right PIN only', async () => {
    const { createPinRecord, verifyPin } = await load()
    const a = await createPinRecord('4821')
    const b = await createPinRecord('4821')
    expect(a.salt).not.toBe(b.salt) // same PIN, different record
    expect(a.hash).not.toContain('4821')
    expect(await verifyPin('4821', a)).toBe(true)
    expect(await verifyPin('4822', a)).toBe(false)
    expect(await verifyPin('', a)).toBe(false)
  })

  it('waits longer and longer after repeated wrong guesses', async () => {
    const { lockoutMs } = await load()
    expect([0, 1, 4].map(lockoutMs)).toEqual([0, 0, 0])
    expect(lockoutMs(5)).toBe(30_000)
    expect(lockoutMs(8)).toBe(5 * 60_000)
    expect(lockoutMs(12)).toBe(15 * 60_000)
  })
})

describe('app lock', () => {
  it('starts off, turns on unlocked, and stores no plain PIN', async () => {
    const { db, getLockState, enableLock } = await load()
    expect(getLockState()).toMatchObject({ enabled: false, locked: false })
    await enableLock('4821', 60)
    expect(getLockState()).toMatchObject({ enabled: true, locked: false, autoLockSeconds: 60 })
    expect(JSON.stringify(await db.settings.get('appLock'))).not.toContain('4821')
    expect(localStorage.getItem('lock-enabled')).toBe('1')
  })

  it('refuses a bad PIN when turning on', async () => {
    const { enableLock } = await load()
    await expect(enableLock('12', 60)).rejects.toThrow(/4 to 8/)
  })

  it('locks, then unlocks only with the right PIN', async () => {
    const { enableLock, lockNow, tryUnlock, getLockState } = await load()
    await enableLock('4821', 60)
    lockNow()
    expect(getLockState().locked).toBe(true)
    expect(await tryUnlock('0000')).toMatchObject({ ok: false, reason: 'wrong' })
    expect(getLockState().locked).toBe(true)
    expect(await tryUnlock('4821')).toEqual({ ok: true })
    expect(getLockState().locked).toBe(false)
  })

  it('makes you wait after five wrong guesses, even for the right PIN', async () => {
    const { enableLock, lockNow, tryUnlock } = await load()
    await enableLock('4821', 60)
    lockNow()
    const t0 = 1_000_000
    for (let i = 0; i < 4; i++) expect(await tryUnlock('1111', t0)).toMatchObject({ reason: 'wrong' })
    expect(await tryUnlock('1111', t0)).toMatchObject({ ok: false, reason: 'wait', retryInMs: 30_000 })
    expect(await tryUnlock('4821', t0 + 10_000)).toMatchObject({ ok: false, reason: 'wait', retryInMs: 20_000 })
    expect(await tryUnlock('4821', t0 + 31_000)).toEqual({ ok: true })
  })

  it('a successful unlock clears the count of wrong guesses', async () => {
    const { enableLock, lockNow, tryUnlock } = await load()
    await enableLock('4821', 60)
    lockNow()
    for (let i = 0; i < 3; i++) await tryUnlock('1111')
    await tryUnlock('4821')
    lockNow()
    expect(await tryUnlock('1111')).toMatchObject({ reason: 'wrong', attemptsLeftBeforeWait: 4 })
  })

  it('locks again only after being away longer than the chosen time', async () => {
    const { enableLock, getLockState, watchVisibility } = await load()
    await enableLock('4821', 60)
    let visibility: DocumentVisibilityState = 'visible'
    const listeners: (() => void)[] = []
    vi.stubGlobal('document', {
      get visibilityState() {
        return visibility
      },
      addEventListener: (_: string, l: () => void) => listeners.push(l),
      removeEventListener: () => {},
    })
    watchVisibility()
    const change = (v: DocumentVisibilityState) => {
      visibility = v
      listeners.forEach((l) => l())
    }

    vi.useFakeTimers()
    vi.setSystemTime(0)
    change('hidden')
    vi.setSystemTime(30_000)
    change('visible')
    expect(getLockState().locked).toBe(false) // back within a minute

    change('hidden')
    vi.setSystemTime(30_000 + 61_000)
    change('visible')
    expect(getLockState().locked).toBe(true)
    vi.useRealTimers()
  })

  it('turning the lock off removes the PIN', async () => {
    const { db, enableLock, disableLock, getLockState } = await load()
    await enableLock('4821', 60)
    await disableLock()
    expect(getLockState()).toMatchObject({ enabled: false, locked: false })
    expect(await db.settings.get('appLock')).toBeUndefined()
    expect(localStorage.getItem('lock-enabled')).toBeNull()
  })

  it('does not trap you if the stored PIN has gone missing', async () => {
    const { db, enableLock, lockNow, tryUnlock } = await load()
    await enableLock('4821', 60)
    await db.settings.delete('appLock')
    lockNow()
    expect(await tryUnlock('anything')).toEqual({ ok: true })
  })
})
