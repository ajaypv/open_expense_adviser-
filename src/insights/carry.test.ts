import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { carriedIntoMonth } from './trends'

let id = 0
const tx = (date: string, amount: number, kind: 'expense' | 'income'): Transaction => ({
  id: ++id, kind, amountMinor: amount * 100, currency: 'INR', categoryId: 1, merchant: '', note: '', date, paymentMethod: '', source: 'manual', createdAt: id,
})
const spend = (date: string, amount: number) => tx(date, amount, 'expense')
const earn = (date: string, amount: number) => tx(date, amount, 'income')

describe('carriedIntoMonth: what is left from earlier months', () => {
  it('is nothing when no money came in before the month', () => {
    expect(carriedIntoMonth([spend('2026-10-05', 500)], [], '2026-11')).toBe(0)
    expect(carriedIntoMonth([], [earn('2026-11-01', 80_000)], '2026-11')).toBe(0)
  })

  it('carries what was not spent of last month\'s salary into the next month', () => {
    const income = [earn('2026-10-01', 80_000)]
    const expenses = [spend('2026-10-05', 30_000), spend('2026-10-20', 10_000)]
    expect(carriedIntoMonth(expenses, income, '2026-11')).toBe(40_000 * 100)
  })

  it('keeps carrying it through months with no money in, less what was spent in them', () => {
    const income = [earn('2026-09-01', 50_000)]
    const expenses = [spend('2026-09-10', 20_000), spend('2026-10-10', 10_000)]
    expect(carriedIntoMonth(expenses, income, '2026-11')).toBe(20_000 * 100)
  })

  it('does not count spending from before the first month any money came in', () => {
    const income = [earn('2026-10-01', 80_000)]
    const expenses = [spend('2026-05-10', 90_000), spend('2026-10-10', 20_000)]
    expect(carriedIntoMonth(expenses, income, '2026-11')).toBe(60_000 * 100)
  })

  it('carries nothing, not a debt, out of a month that went over', () => {
    const income = [earn('2026-09-01', 10_000), earn('2026-11-01', 5_000)]
    const expenses = [spend('2026-09-10', 30_000), spend('2026-10-10', 1_000)]
    expect(carriedIntoMonth(expenses, income, '2026-11')).toBe(0)
  })

  it('looks only at months before the one asked about', () => {
    const income = [earn('2026-10-01', 80_000), earn('2026-11-01', 80_000)]
    expect(carriedIntoMonth([], income, '2026-11')).toBe(80_000 * 100)
    expect(carriedIntoMonth([], income, '2026-10')).toBe(0)
  })
})
