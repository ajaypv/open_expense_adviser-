import { db } from '../db/schema'

const LAST = 'lastBackupAt'
const SNOOZE = 'backupSnoozedUntil'
const SNOOZE_COUNT = 'backupSnoozeCount'

const DAY = 86_400_000

/** How long without a backup before the app suggests one. */
export const BACKUP_EVERY_DAYS = 30
/** Don't nag people who have only logged a handful of entries. */
export const BACKUP_MIN_TRANSACTIONS = 10
/** Each "Later" waits longer than the one before, so a reminder that was declined stops coming back every week. */
const SNOOZE_STEPS_DAYS = [7, 30, 90]

export async function getLastBackup(): Promise<number | null> {
  const v = (await db.settings.get(LAST))?.value
  return typeof v === 'number' ? v : null
}

export async function markBackedUp(now = Date.now()): Promise<void> {
  await db.settings.put({ key: LAST, value: now })
  await db.settings.delete(SNOOZE)
  await db.settings.delete(SNOOZE_COUNT)
}

export async function snoozeBackupNudge(now = Date.now()): Promise<void> {
  const said = (await db.settings.get(SNOOZE_COUNT))?.value
  const times = typeof said === 'number' ? said : 0
  const days = SNOOZE_STEPS_DAYS[Math.min(times, SNOOZE_STEPS_DAYS.length - 1)]
  await db.settings.bulkPut([
    { key: SNOOZE, value: now + days * DAY },
    { key: SNOOZE_COUNT, value: times + 1 },
  ])
}

export async function getSnoozedUntil(): Promise<number> {
  const v = (await db.settings.get(SNOOZE))?.value
  return typeof v === 'number' ? v : 0
}

export interface BackupNudge {
  /** Whole days since the last backup, or null if there has never been one. */
  daysSince: number | null
}

/**
 * Whether to suggest a backup now: there is enough data to lose, it has been a while (or never),
 * and the user hasn't just said "later".
 */
export function backupNudge(opts: {
  transactionCount: number
  lastBackup: number | null
  snoozedUntil: number
  now?: number
}): BackupNudge | null {
  const now = opts.now ?? Date.now()
  if (opts.transactionCount < BACKUP_MIN_TRANSACTIONS) return null
  if (now < opts.snoozedUntil) return null
  if (opts.lastBackup === null) return { daysSince: null }
  const days = Math.floor((now - opts.lastBackup) / DAY)
  return days >= BACKUP_EVERY_DAYS ? { daysSince: days } : null
}

/** "today", "yesterday", "12 days ago" — for showing the last backup in Settings. */
export function describeAge(then: number, now = Date.now()): string {
  const days = Math.floor((now - then) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}
