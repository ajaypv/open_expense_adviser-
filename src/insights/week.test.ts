import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { shiftWeek, weekEndFor, weekView } from './week'

let id = 0
const tx = (date: string, rupees: number): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId: 1, merchant: 'x', note: '', date,
  paymentMethod: '', source: 'manual', createdAt: id,
})
const today = new Date(2026, 10, 14) // Sat 14 Nov 2026

describe('weekView', () => {
  it('is seven days, the oldest first, ending on the day given', () => {
    const v = weekView([], '2026-11-14', today)
    expect(v.days.map((d) => d.date)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'])
    expect(v.from).toBe('2026-11-08')
    expect(v.to).toBe('2026-11-14')
  })

  it('reaches back across a month end, and a year end', () => {
    expect(weekView([], '2026-11-02', today).days.map((d) => d.date)[0]).toBe('2026-10-27')
    expect(weekView([], '2027-01-03', today).from).toBe('2026-12-28')
  })

  it('adds up what was spent each day, how many expenses, and the whole week', () => {
    const v = weekView([tx('2026-11-14', 120), tx('2026-11-14', 30), tx('2026-11-10', 450), tx('2026-11-01', 999)], '2026-11-14', today)
    expect(v.days[6]).toMatchObject({ date: '2026-11-14', minor: 15_000, count: 2 })
    expect(v.days[2]).toMatchObject({ minor: 45_000, count: 1 })
    expect(v.days[0]).toMatchObject({ minor: 0, count: 0 })
    expect(v.totalMinor).toBe(60_000)
    expect(v.averageMinor).toBe(8_600) // over seven days, in whole rupees
  })

  it('marks the day that is today, and the biggest day, the latest on a tie', () => {
    const v = weekView([tx('2026-11-10', 100), tx('2026-11-12', 100), tx('2026-11-13', 40)], '2026-11-14', today)
    expect(v.days.filter((d) => d.today).map((d) => d.date)).toEqual(['2026-11-14'])
    expect(v.peak!.date).toBe('2026-11-12')
    expect(weekView([], '2026-11-14', today).peak).toBeNull()
  })

  it('has no day marked today for a week that ended earlier', () => {
    expect(weekView([], '2026-10-31', today).days.some((d) => d.today)).toBe(false)
  })

  it('compares with the seven days before, in whole percent, and says nothing where there is nothing to compare', () => {
    const v = weekView([tx('2026-11-13', 150), tx('2026-11-05', 100)], '2026-11-14', today)
    expect(v.previousMinor).toBe(10_000)
    expect(v.deltaPct).toBe(50)
    expect(weekView([tx('2026-11-13', 150)], '2026-11-14', today).deltaPct).toBeNull()
    expect(weekView([tx('2026-11-13', 50), tx('2026-11-05', 100)], '2026-11-14', today).deltaPct).toBe(-50)
  })

  it('leaves out what falls in neither week', () => {
    const v = weekView([tx('2026-10-01', 500), tx('2026-11-15', 500)], '2026-11-14', today)
    expect(v.totalMinor).toBe(0)
    expect(v.previousMinor).toBe(0)
  })
})

describe('weekEndFor', () => {
  it('is today for the month in progress, and the last day of any other month', () => {
    expect(weekEndFor('2026-11', today)).toBe('2026-11-14')
    expect(weekEndFor('2026-10', today)).toBe('2026-10-31')
    expect(weekEndFor('2026-02', today)).toBe('2026-02-28')
    expect(weekEndFor('2028-02', today)).toBe('2028-02-29')
  })
})

describe('shiftWeek', () => {
  it('moves by whole weeks, either way', () => {
    expect(shiftWeek('2026-11-14', -1)).toBe('2026-11-07')
    expect(shiftWeek('2026-11-14', 2)).toBe('2026-11-28')
    expect(shiftWeek('2026-01-03', -1)).toBe('2025-12-27')
  })
})
