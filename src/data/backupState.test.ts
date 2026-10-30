import { describe, expect, it } from 'vitest'
import { backupNudge, describeAge } from './backupState'

const DAY = 86_400_000
const now = Date.UTC(2026, 9, 29)

describe('backupNudge', () => {
  it('stays quiet until there is enough data to be worth protecting', () => {
    expect(backupNudge({ transactionCount: 3, lastBackup: null, snoozedUntil: 0, now })).toBeNull()
  })

  it('suggests a first backup once there is data and none has ever been made', () => {
    expect(backupNudge({ transactionCount: 12, lastBackup: null, snoozedUntil: 0, now })).toEqual({ daysSince: null })
  })

  it('suggests another after a month, and reports how long it has been', () => {
    expect(backupNudge({ transactionCount: 50, lastBackup: now - 31 * DAY, snoozedUntil: 0, now })).toEqual({ daysSince: 31 })
    expect(backupNudge({ transactionCount: 50, lastBackup: now - 29 * DAY, snoozedUntil: 0, now })).toBeNull()
  })

  it('respects "later" for a week', () => {
    expect(backupNudge({ transactionCount: 50, lastBackup: null, snoozedUntil: now + DAY, now })).toBeNull()
    expect(backupNudge({ transactionCount: 50, lastBackup: null, snoozedUntil: now - 1, now })).toEqual({ daysSince: null })
  })
})

describe('describeAge', () => {
  it('speaks in plain days', () => {
    expect(describeAge(now - 1000, now)).toBe('today')
    expect(describeAge(now - DAY, now)).toBe('yesterday')
    expect(describeAge(now - 12 * DAY, now)).toBe('12 days ago')
  })
})
