import { describe, expect, it } from 'vitest'
import {
  budgetMessage,
  DEFAULT_REMINDERS,
  logReminderDue,
  newBudgetAlerts,
  pruneSent,
  readPrefs,
  readState,
  shouldNotifyLog,
  strongestAlert,
} from './logic'

const at = (h: number, m = 0) => new Date(2026, 9, 28, h, m)
const on = { ...DEFAULT_REMINDERS, logReminder: true, logTime: '21:00' }

describe('log reminder', () => {
  it('is due once the time has passed and nothing was logged today', () => {
    expect(logReminderDue(at(21, 0), on, false)).toBe(true)
    expect(logReminderDue(at(20, 59), on, false)).toBe(false)
    expect(logReminderDue(at(23, 30), on, false)).toBe(true)
  })

  it('stays quiet when something was logged, or the reminder is off', () => {
    expect(logReminderDue(at(22), on, true)).toBe(false)
    expect(logReminderDue(at(22), { ...on, logReminder: false }, false)).toBe(false)
  })

  it('sends the system notification at most once a day', () => {
    const fresh = { lastLogNudge: null, budgetAlerts: [] }
    expect(shouldNotifyLog(at(22), '2026-10-28', on, false, fresh)).toBe(true)
    expect(shouldNotifyLog(at(22), '2026-10-28', on, false, { ...fresh, lastLogNudge: '2026-10-28' })).toBe(false)
    expect(shouldNotifyLog(at(22), '2026-10-28', on, false, { ...fresh, lastLogNudge: '2026-10-27' })).toBe(true)
  })
})

describe('budget alerts', () => {
  const base = { month: '2026-10', scope: 'overall', limitMinor: 100_000, sent: [] as string[] }

  it('says nothing below 80%', () => {
    expect(newBudgetAlerts({ ...base, spentMinor: 79_999 })).toEqual([])
  })

  it('reports each threshold as it is reached', () => {
    expect(newBudgetAlerts({ ...base, spentMinor: 80_000 }).map((a) => a.threshold)).toEqual([80])
    expect(newBudgetAlerts({ ...base, spentMinor: 100_000 }).map((a) => a.threshold)).toEqual([80, 100])
  })

  it('never repeats one already sent this month, but warns again next month', () => {
    const sent = ['2026-10:overall:80']
    expect(newBudgetAlerts({ ...base, spentMinor: 85_000, sent })).toEqual([])
    expect(newBudgetAlerts({ ...base, spentMinor: 105_000, sent }).map((a) => a.threshold)).toEqual([100])
    expect(newBudgetAlerts({ ...base, month: '2026-11', spentMinor: 85_000, sent })).toHaveLength(1)
  })

  it('keeps categories separate from the overall budget, and ignores a missing limit', () => {
    const sent = ['2026-10:overall:80']
    expect(newBudgetAlerts({ ...base, scope: 'cat:3', spentMinor: 85_000, sent })).toHaveLength(1)
    expect(newBudgetAlerts({ ...base, limitMinor: 0, spentMinor: 1 })).toEqual([])
  })

  it('speaks only about the strongest threshold, in plain words', () => {
    const both = newBudgetAlerts({ ...base, spentMinor: 120_000 })
    expect(strongestAlert(both)?.threshold).toBe(100)
    expect(strongestAlert([])).toBeNull()
    expect(budgetMessage('Food & Dining', 100).title).toBe('Over budget')
    expect(budgetMessage('overall', 80).body).toContain('80%')
  })

  it('forgets alerts older than last month', () => {
    const sent = ['2026-10:overall:80', '2026-09:overall:100', '2026-08:overall:80', '2025-12:cat:1:80']
    expect(pruneSent(sent, '2026-10')).toEqual(['2026-10:overall:80', '2026-09:overall:100'])
    expect(pruneSent(['2025-12:overall:80', '2025-11:overall:80'], '2026-01')).toEqual(['2025-12:overall:80'])
  })
})

describe('stored values', () => {
  it('fall back to safe defaults when missing or malformed', () => {
    expect(readPrefs(undefined)).toEqual(DEFAULT_REMINDERS)
    expect(readPrefs({ logReminder: true, logTime: '25:99', budgetAlerts: false })).toEqual({ logReminder: true, logTime: '21:00', budgetAlerts: false })
    expect(readPrefs({ logTime: '08:30' }).logTime).toBe('08:30')
    expect(readState('nonsense')).toEqual({ lastLogNudge: null, budgetAlerts: [] })
    expect(readState({ lastLogNudge: 5, budgetAlerts: ['a', 7] })).toEqual({ lastLogNudge: null, budgetAlerts: ['a'] })
  })
})
