import { useSyncExternalStore } from 'react'
import { db } from '../db/schema'

/**
 * A PIN lock for the app screen. It stops someone who picks up an unlocked phone from reading
 * your finances. It is not encryption: the data on the device is not scrambled, so this does not
 * protect against someone with access to the device's browser storage.
 */

const SETTING = 'appLock'
const ENABLED_FLAG = 'lock-enabled' // mirrored in localStorage so the very first paint can already be locked
const AFTER_FLAG = 'lock-after'
const FAILS_FLAG = 'lock-fails'

const ITERATIONS = 150_000
const bytesToB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export const PIN_MIN = 4
export const PIN_MAX = 8
export const validPin = (pin: string) => new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin)

export interface PinRecord {
  salt: string
  hash: string
  /** Digits in the PIN, so the lock screen can unlock as soon as the last one is typed. */
  length: number
}

async function derive(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS }, key, 256)
  return new Uint8Array(bits)
}

export async function createPinRecord(pin: string): Promise<PinRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { salt: bytesToB64(salt), hash: bytesToB64(await derive(pin, salt)), length: pin.length }
}

/** Compares in constant time, so how long it takes says nothing about how close a guess was. */
export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  const expected = b64ToBytes(record.hash)
  const actual = await derive(pin, b64ToBytes(record.salt))
  let diff = expected.length ^ actual.length
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ (actual[i] ?? 0)
  return diff === 0
}

/** How long to wait after this many wrong guesses in a row: none at first, then longer and longer. */
export function lockoutMs(fails: number): number {
  if (fails < 5) return 0
  if (fails < 8) return 30_000
  if (fails < 10) return 5 * 60_000
  return 15 * 60_000
}

/* ---------- state ---------- */

export interface LockState {
  enabled: boolean
  locked: boolean
  /** How long the app can be in the background before it locks again. 0 means straight away. */
  autoLockSeconds: number
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* private mode */
  }
}

function initial(): LockState {
  const enabled = read(ENABLED_FLAG) === '1'
  const after = Number(read(AFTER_FLAG))
  return { enabled, locked: enabled, autoLockSeconds: Number.isFinite(after) && after >= 0 ? after : 60 }
}

let state = initial()
const listeners = new Set<() => void>()
const set = (patch: Partial<LockState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const getLockState = () => state

export function useLockState(): LockState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getLockState,
    getLockState,
  )
}

export async function getPinRecord(): Promise<PinRecord | null> {
  const v = (await db.settings.get(SETTING))?.value as PinRecord | undefined
  return v && typeof v.hash === 'string' && typeof v.salt === 'string' ? v : null
}

export async function enableLock(pin: string, autoLockSeconds: number): Promise<void> {
  if (!validPin(pin)) throw new Error(`Use ${PIN_MIN} to ${PIN_MAX} digits`)
  await db.settings.put({ key: SETTING, value: await createPinRecord(pin) })
  write(ENABLED_FLAG, '1')
  write(AFTER_FLAG, String(autoLockSeconds))
  write(FAILS_FLAG, null)
  set({ enabled: true, locked: false, autoLockSeconds })
}

/** Changing the PIN keeps the lock on and the app unlocked. */
export async function changePin(pin: string): Promise<void> {
  if (!validPin(pin)) throw new Error(`Use ${PIN_MIN} to ${PIN_MAX} digits`)
  await db.settings.put({ key: SETTING, value: await createPinRecord(pin) })
}

export async function disableLock(): Promise<void> {
  await db.settings.delete(SETTING)
  write(ENABLED_FLAG, null)
  write(FAILS_FLAG, null)
  set({ enabled: false, locked: false })
}

export function setAutoLockSeconds(seconds: number): void {
  write(AFTER_FLAG, String(seconds))
  set({ autoLockSeconds: seconds })
}

export function lockNow(): void {
  if (state.enabled) set({ locked: true })
}

/* ---------- unlocking with attempt limits ---------- */

interface Fails {
  count: number
  until: number
}

const readFails = (): Fails => {
  try {
    const f = JSON.parse(read(FAILS_FLAG) ?? '{}') as Partial<Fails>
    return { count: typeof f.count === 'number' ? f.count : 0, until: typeof f.until === 'number' ? f.until : 0 }
  } catch {
    return { count: 0, until: 0 }
  }
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: 'wrong'; attemptsLeftBeforeWait: number }
  | { ok: false; reason: 'wait'; retryInMs: number }

/** Check a PIN. Wrong guesses are counted on this device, and too many in a row make the next try wait. */
export async function tryUnlock(pin: string, now = Date.now()): Promise<UnlockResult> {
  const fails = readFails()
  if (now < fails.until) return { ok: false, reason: 'wait', retryInMs: fails.until - now }

  const record = await getPinRecord()
  if (!record) {
    set({ locked: false }) // lock was removed elsewhere; don't trap the user
    return { ok: true }
  }
  if (await verifyPin(pin, record)) {
    write(FAILS_FLAG, null)
    set({ locked: false })
    return { ok: true }
  }

  const count = fails.count + 1
  const wait = lockoutMs(count)
  write(FAILS_FLAG, JSON.stringify({ count, until: wait ? now + wait : 0 }))
  if (wait) return { ok: false, reason: 'wait', retryInMs: wait }
  return { ok: false, reason: 'wrong', attemptsLeftBeforeWait: 5 - count }
}

/* ---------- locking when the app goes to the background ---------- */

let hiddenAt: number | null = null

/** Call once. Locks again when the app comes back after being away longer than the chosen time. */
export function watchVisibility(): () => void {
  const onChange = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      if (state.enabled && state.autoLockSeconds === 0) set({ locked: true })
    } else if (hiddenAt !== null) {
      if (state.enabled && Date.now() - hiddenAt >= state.autoLockSeconds * 1000) set({ locked: true })
      hiddenAt = null
    }
  }
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

/** Reset for tests. */
export function resetLockForTests(): void {
  state = initial()
  hiddenAt = null
  listeners.forEach((l) => l())
}

/**
 * The last resort when the PIN is forgotten: erase everything on this device. The data can only
 * come back from a backup, because the lock is not something anyone can bypass.
 */
export async function eraseEverything(): Promise<void> {
  db.close()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('expense-tracker')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  for (const key of [ENABLED_FLAG, AFTER_FLAG, FAILS_FLAG]) write(key, null)
  location.reload()
}
