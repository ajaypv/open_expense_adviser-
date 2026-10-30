import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const DAY = 86_400_000
const now = Date.UTC(2026, 9, 29)

beforeEach(async () => {
  await Dexie.delete('expense-tracker')
  vi.resetModules()
})

async function load() {
  const [{ db }, state] = await Promise.all([import('../db/schema'), import('./backupState')])
  await db.open()
  return { db, ...state }
}

describe('saying "Later" to the backup reminder', () => {
  it('waits a week the first time, a month the second, three months after that', async () => {
    const { snoozeBackupNudge, getSnoozedUntil } = await load()
    await snoozeBackupNudge(now)
    expect(await getSnoozedUntil()).toBe(now + 7 * DAY)
    await snoozeBackupNudge(now)
    expect(await getSnoozedUntil()).toBe(now + 30 * DAY)
    await snoozeBackupNudge(now)
    expect(await getSnoozedUntil()).toBe(now + 90 * DAY)
    await snoozeBackupNudge(now)
    expect(await getSnoozedUntil()).toBe(now + 90 * DAY) // and no longer than that
  })

  it('starts again at a week after a backup is made', async () => {
    const { snoozeBackupNudge, markBackedUp, getSnoozedUntil } = await load()
    await snoozeBackupNudge(now)
    await snoozeBackupNudge(now)
    await markBackedUp(now)
    expect(await getSnoozedUntil()).toBe(0)
    await snoozeBackupNudge(now)
    expect(await getSnoozedUntil()).toBe(now + 7 * DAY)
  })
})
