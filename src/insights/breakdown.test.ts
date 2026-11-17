import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { carriedIntoMonth, monthBreakdown } from './trends'

let id = 0
const tx = (date: string, amount: number, kind: 'expense' | 'income', categoryId = 1): Transaction => ({
  id: ++id, kind, amountMinor: amount * 100, currency: 'INR', categoryId, merchant: '', note: '', date, paymentMethod: '', source: 'manual', createdAt: id,
})
const spend = (date: string, amount: number, categoryId = 1) => tx(date, amount, 'expense', categoryId)
const earn = (date: string, amount: number) => tx(date, amount, 'income')

describe('monthBreakdown: which money paid for the month', () => {
  const income = [earn('2026-10-01', 80_000), earn('2026-11-01', 50_000)]
  const expenses = [spend('2026-10-05', 30_000), spend('2026-10-20', 10_000), spend('2026-11-10', 30_000, 2), spend('2026-11-03', 15_000, 1)]

  it('spends the money left from last month first, in date order, then what came in this month', () => {
    const b = monthBreakdown(expenses, income, '2026-11')
    expect(b.carriedInMinor).toBe(40_000 * 100)
    expect(b.spentMinor).toBe(45_000 * 100)
    expect(b.fromCarriedMinor).toBe(40_000 * 100)
    expect(b.fromIncomeMinor).toBe(5_000 * 100)
    expect(b.notCoveredMinor).toBe(0)
    expect(b.carriedOutMinor).toBe(45_000 * 100)
  })

  it('says what the earlier money paid for, biggest first, and the day it ran out', () => {
    const b = monthBreakdown(expenses, income, '2026-11')
    expect(b.fromCarriedByCategory).toEqual([
      { categoryId: 2, totalMinor: 25_000 * 100 },
      { categoryId: 1, totalMinor: 15_000 * 100 },
    ])
    expect(b.carriedRanOutOn).toBe('2026-11-10')
  })

  it('has no run-out day while some of the earlier money is still there', () => {
    const b = monthBreakdown([spend('2026-10-05', 30_000), spend('2026-11-03', 5_000)], [earn('2026-10-01', 80_000)], '2026-11')
    expect(b.fromCarriedMinor).toBe(5_000 * 100)
    expect(b.carriedRanOutOn).toBeNull()
    expect(b.carriedOutMinor).toBe(45_000 * 100)
  })

  it('shows what was more than everything you had, and carries nothing on', () => {
    const b = monthBreakdown([spend('2026-10-01', 8_000), spend('2026-11-05', 5_000)], [earn('2026-10-01', 10_000), earn('2026-11-01', 1_000)], '2026-11')
    expect(b.carriedInMinor).toBe(2_000 * 100)
    expect(b.fromCarriedMinor).toBe(2_000 * 100)
    expect(b.fromIncomeMinor).toBe(1_000 * 100)
    expect(b.notCoveredMinor).toBe(2_000 * 100)
    expect(b.carriedOutMinor).toBe(0)
  })

  it('has nothing from earlier months in the first month money came in', () => {
    const b = monthBreakdown([spend('2026-11-05', 5_000)], [earn('2026-11-01', 80_000)], '2026-11')
    expect(b.carriedInMinor).toBe(0)
    expect(b.fromCarriedMinor).toBe(0)
    expect(b.fromIncomeMinor).toBe(5_000 * 100)
    expect(b.steps).toHaveLength(1)
  })

  it('lists the months from the first with money in up to this one, each carrying on to the next', () => {
    const b = monthBreakdown(expenses, income, '2026-11')
    expect(b.steps.map((s) => [s.month, s.carriedInMinor, s.receivedMinor, s.spentMinor, s.carriedOutMinor])).toEqual([
      ['2026-10', 0, 80_000 * 100, 40_000 * 100, 40_000 * 100],
      ['2026-11', 40_000 * 100, 50_000 * 100, 45_000 * 100, 45_000 * 100],
    ])
  })

  it('has no months when no money has come in, and counts everything as not covered', () => {
    const b = monthBreakdown([spend('2026-11-05', 700)], [], '2026-11')
    expect(b.steps).toEqual([])
    expect(b.notCoveredMinor).toBe(700 * 100)
  })

  it('starts from the same figure as carriedIntoMonth', () => {
    for (const month of ['2026-10', '2026-11', '2026-12']) {
      expect(monthBreakdown(expenses, income, month).carriedInMinor).toBe(carriedIntoMonth(expenses, income, month))
    }
  })
})
