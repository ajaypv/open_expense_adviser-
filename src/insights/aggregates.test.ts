import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import {
  balanceFrom,
  byCategory,
  byDay,
  byWeekday,
  categoryChanges,
  compareToPrevious,
  cumulative,
  daysInMonth,
  projectedTotal,
  shiftMonth,
  topMerchants,
} from './aggregates'

let id = 0
const tx = (
  date: string,
  amount: number,
  categoryId = 1,
  merchant = '',
  kind: Transaction['kind'] = 'expense',
): Transaction => ({
  id: ++id,
  kind,
  amountMinor: amount * 100,
  currency: 'INR',
  categoryId,
  merchant,
  note: '',
  date,
  paymentMethod: '',
  source: 'manual',
  createdAt: 0,
})

describe('month helpers', () => {
  it('shifts across year boundaries and counts days', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-02')).toBe(28)
  })
})

describe('byCategory / byDay', () => {
  const txs = [tx('2026-10-01', 100, 1), tx('2026-10-01', 50, 2), tx('2026-10-03', 400, 1)]
  it('sorts categories by total, descending', () => {
    expect(byCategory(txs)).toEqual([
      { categoryId: 1, totalMinor: 50000 },
      { categoryId: 2, totalMinor: 5000 },
    ])
  })
  it('buckets spend per day with one slot per calendar day', () => {
    const days = byDay(txs, '2026-10')
    expect(days).toHaveLength(31)
    expect(days[0]).toBe(15000)
    expect(days[2]).toBe(40000)
    expect(days[1]).toBe(0)
  })
})

describe('compareToPrevious', () => {
  const txs = [
    tx('2026-09-05', 1000),
    tx('2026-09-25', 9000), // after day 10, must not count against a day-10 comparison
    tx('2026-10-04', 1500),
  ]
  it('compares month-to-date with the same elapsed days of last month', () => {
    const c = compareToPrevious(txs, '2026-10', new Date(2026, 9, 10))
    expect(c).toMatchObject({ currentMinor: 150000, previousMinor: 100000, deltaPct: 50, partial: true })
  })
  it('compares whole months for past months, and gives null with no baseline', () => {
    expect(compareToPrevious(txs, '2026-09', new Date(2026, 9, 10)).previousMinor).toBe(0)
    expect(compareToPrevious(txs, '2026-09', new Date(2026, 9, 10)).deltaPct).toBeNull()
  })
})

describe('projectedTotal', () => {
  it('extrapolates the current month only, and not on the first days', () => {
    expect(projectedTotal(100000, '2026-10', new Date(2026, 9, 10))).toBe(310000)
    expect(projectedTotal(100000, '2026-09', new Date(2026, 9, 10))).toBeNull()
    expect(projectedTotal(100000, '2026-10', new Date(2026, 9, 2))).toBeNull()
  })
})

describe('balanceFrom', () => {
  const txs = [
    tx('2026-10-01', 80000, 1, 'Employer', 'income'),
    tx('2026-10-02', 450, 1, 'Cafe'),
    tx('2026-10-03', 18000, 1, 'Rent'),
    tx('2026-10-04', 2000, 1, 'Refund', 'income'),
  ]
  it('adds money received and subtracts money sent, from the opening balance', () => {
    expect(balanceFrom(txs, 100000)).toEqual({
      sentMinor: 1845000,
      receivedMinor: 8200000,
      netMinor: 6355000,
      estimatedMinor: 6455000,
    })
  })
  it('starts from zero with no opening balance and can go negative', () => {
    expect(balanceFrom([], 0).estimatedMinor).toBe(0)
    expect(balanceFrom([tx('2026-10-02', 450)], 0).estimatedMinor).toBe(-45000)
  })
  it('calibrating to a stated balance makes the estimate match it, then tracks new activity', () => {
    const stated = 5_000_00 // "I have 5,000 today"
    const opening = stated - balanceFrom(txs, 0).netMinor
    expect(balanceFrom(txs, opening).estimatedMinor).toBe(stated)
    expect(balanceFrom([...txs, tx('2026-10-05', 120)], opening).estimatedMinor).toBe(stated - 12000)
  })
})

describe('topMerchants', () => {
  it('ranks by total spend, merges names case-insensitively and skips blanks', () => {
    const txs = [
      tx('2026-10-01', 10, 1, 'Swiggy'),
      tx('2026-10-02', 10, 1, 'swiggy'),
      tx('2026-10-03', 500, 1, 'Amazon'),
      tx('2026-10-04', 99, 1, ''),
    ]
    expect(topMerchants(txs)).toEqual([
      { name: 'Amazon', count: 1, totalMinor: 50000 },
      { name: 'Swiggy', count: 2, totalMinor: 2000 },
    ])
    expect(topMerchants(txs, 1)).toHaveLength(1)
  })
})

describe('cumulative', () => {
  it('keeps a running total and stops (null) after the last elapsed day', () => {
    const txs = [tx('2026-10-01', 10), tx('2026-10-03', 5)]
    const c = cumulative(txs, '2026-10', 4)
    expect(c.slice(0, 5)).toEqual([1000, 1000, 1500, 1500, null])
    expect(c).toHaveLength(31)
    expect(cumulative(txs, '2026-10', null)[30]).toBe(1500)
  })
})

describe('byWeekday', () => {
  it('is Monday-first', () => {
    // 2026-10-26 is a Monday, 2026-11-01 is a Sunday.
    const totals = byWeekday([tx('2026-10-26', 10), tx('2026-10-26', 5), tx('2026-11-01', 7)])
    expect(totals[0]).toBe(1500)
    expect(totals[6]).toBe(700)
    expect(totals.slice(1, 6).every((v) => v === 0)).toBe(true)
  })
})

describe('categoryChanges', () => {
  const txs = [
    tx('2026-09-05', 100, 1),
    tx('2026-09-05', 50, 2),
    tx('2026-09-25', 900, 1), // after the comparison cut-off, ignored mid-month
    tx('2026-10-04', 300, 1),
    tx('2026-10-06', 20, 3),
  ]
  it('compares the same elapsed days and sorts by size of change', () => {
    const changes = categoryChanges(txs, '2026-10', new Date(2026, 9, 10))
    expect(changes.map((c) => [c.categoryId, c.deltaMinor])).toEqual([
      [1, 20000], // 300 vs 100
      [2, -5000], // 0 vs 50
      [3, 2000], //  20 vs 0
    ])
  })
  it('compares whole months for a finished month', () => {
    const changes = categoryChanges(txs, '2026-10', new Date(2026, 10, 15))
    expect(changes.find((c) => c.categoryId === 1)).toMatchObject({ previousMinor: 100000, currentMinor: 30000 })
  })
})
