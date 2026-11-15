import { describe, expect, it } from 'vitest'
import type { Recurring } from '../db/schema'
import { billsFrom, byDay, countsOf, monthGrid } from './bills'
import { upcomingPayments } from './upcoming'

const money = { currency: 'INR', rates: {} }
let id = 0
const rule = (over: Partial<Recurring> = {}): Recurring => ({
  id: ++id, kind: 'expense', amountMinor: 100_000, currency: 'INR', categoryId: 1, merchant: 'Netflix', note: '', paymentMethod: '',
  frequency: 'monthly', nextDue: '2026-11-20', active: true, tag: 'subscription', ...over,
})
const paid = (over: Record<string, unknown> = {}) => ({ id: ++id, kind: 'expense' as const, source: 'recurring' as const, date: '2026-11-05', merchant: 'Rent', categoryId: 1, amountMinor: 600_000, ...over })
const nameOf = (c: number) => (c === 1 ? 'Bills' : undefined)

describe('billsFrom', () => {
  it('has the ones paid, the ones late and the ones still to come, in the order of the days', () => {
    const rent = rule({ merchant: 'Rent', tag: 'bill', nextDue: '2026-11-30' })
    const late = rule({ merchant: 'Electricity', tag: 'bill', nextDue: '2026-11-08' })
    const items = upcomingPayments([rent, late], '2026-11-15', 20, money)
    const bills = billsFrom([paid()], items, [rent, late], nameOf)
    expect(bills.map((b) => [b.date, b.name, b.state])).toEqual([
      ['2026-11-05', 'Rent', 'paid'],
      ['2026-11-08', 'Electricity', 'late'],
      ['2026-11-30', 'Rent', 'upcoming'],
    ])
  })

  it('leaves out what was not added from a regular payment, and transfers', () => {
    const bills = billsFrom([paid({ source: 'manual' }), paid({ kind: 'transfer' })], [], [], nameOf)
    expect(bills).toEqual([])
  })

  it('knows a paid one by its name, for its kind of payment, and the rule behind one still to come', () => {
    const rent = rule({ merchant: 'Rent', tag: 'bill', nextDue: '2026-11-30' })
    const items = upcomingPayments([rent], '2026-11-15', 20, money)
    const [done, coming] = billsFrom([paid({ merchant: ' rent ' })], items, [rent], nameOf)
    expect(done.tag).toBe('bill')
    expect(done.rule).toBeUndefined()
    expect(coming.rule).toBe(rent)
    expect(coming.daysLeft).toBe(15)
  })

  it('names a payment with no name by what it is filed under, then by what it is', () => {
    const [a] = billsFrom([paid({ merchant: '' })], [], [], nameOf)
    const [b] = billsFrom([paid({ merchant: '', categoryId: 9, kind: 'income' })], [], [], nameOf)
    expect(a.name).toBe('Bills')
    expect(b.name).toBe('Income')
    expect(b.tag).toBe('income')
  })

  it('counts them by how they stand', () => {
    const late = rule({ nextDue: '2026-11-08' })
    const items = upcomingPayments([late], '2026-11-15', 30, money)
    expect(countsOf(billsFrom([paid(), paid()], items, [late], nameOf))).toEqual({ upcoming: 1, late: 1, paid: 2 })
  })

  it('groups by the day', () => {
    const map = byDay(billsFrom([paid(), paid({ merchant: 'Gym' }), paid({ date: '2026-11-06' })], [], [], nameOf))
    expect(map.get('2026-11-05')).toHaveLength(2)
    expect(map.get('2026-11-06')).toHaveLength(1)
  })
})

describe('monthGrid', () => {
  it('is always six weeks of seven', () => {
    for (const m of ['2026-02', '2026-11', '2027-05']) expect(monthGrid(m, 1)).toHaveLength(42)
  })

  it('starts the first of the month under the right weekday, for a week that starts on Monday', () => {
    // 1 Nov 2026 is a Sunday: six days of October come first.
    const grid = monthGrid('2026-11', 1)
    expect(grid[6]).toMatchObject({ date: '2026-11-01', day: 1, inMonth: true })
    expect(grid[0]).toMatchObject({ date: '2026-10-26', inMonth: false })
  })

  it('starts the first of the month under the right weekday, for a week that starts on Sunday', () => {
    const grid = monthGrid('2026-11', 7)
    expect(grid[0]).toMatchObject({ date: '2026-11-01', inMonth: true })
  })

  it('marks the days either side, and has every day of the month once', () => {
    const grid = monthGrid('2026-02', 1)
    expect(grid.filter((c) => c.inMonth)).toHaveLength(28)
    expect(grid.at(-1)!.inMonth).toBe(false)
    expect(new Set(grid.map((c) => c.date)).size).toBe(42)
  })
})
