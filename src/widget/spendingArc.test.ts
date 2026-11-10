import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { buildSpendingArc } from './spendingArc'

const money = (minor: number) => `₹${minor / 100}`
const today = new Date(2026, 10, 10, 15, 40) // Tue 10 Nov 2026; November has 30 days
const tx = (id: number, date: string, rupees: number, over: Partial<Transaction> = {}): Transaction => ({
  id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '', date, paymentMethod: '', source: 'manual', createdAt: id, ...over,
})
const BUDGET = 3_000_000 // ₹30,000: a day's share is ₹1,000

describe('buildSpendingArc with a budget', () => {
  const expenses = [tx(1, '2026-11-01', 500), tx(2, '2026-11-01', 500), tx(3, '2026-11-04', 3000), tx(4, '2026-11-10', 250)]

  it('has a number for each day of the month, in order', () => {
    const arc = buildSpendingArc(expenses, '2026-11', today, BUDGET, money)
    expect(arc.ratios).toHaveLength(30)
  })

  it('says how big each day was against its share of the budget', () => {
    const { ratios } = buildSpendingArc(expenses, '2026-11', today, BUDGET, money)
    expect(ratios[0]).toBe(1)
    expect(ratios[1]).toBe(0)
    expect(ratios[3]).toBe(3)
    expect(ratios[9]).toBe(0.25)
  })

  it('names the day it is, for the month in progress', () => {
    expect(buildSpendingArc(expenses, '2026-11', today, BUDGET, money).todayDay).toBe(10)
  })

  it('puts the share of the budget used in the middle, and what is left under it', () => {
    const arc = buildSpendingArc(expenses, '2026-11', today, BUDGET, money)
    expect(arc.big).toBe('14%')
    expect(arc.small).toBe('₹25750 left')
    expect(arc.tone).toBe('Good')
  })

  it('warns near the limit, in words and a tone', () => {
    const arc = buildSpendingArc([tx(1, '2026-11-02', 25_000)], '2026-11', today, BUDGET, money)
    expect(arc.big).toBe('83%')
    expect(arc.small).toBe('Close to the limit, ₹5000 left')
    expect(arc.tone).toBe('Warning')
  })

  it('says so once over the limit', () => {
    const arc = buildSpendingArc([tx(1, '2026-11-02', 32_000)], '2026-11', today, BUDGET, money)
    expect(arc.big).toBe('107%')
    expect(arc.small).toBe('Over budget by ₹2000')
    expect(arc.tone).toBe('Attention')
  })
})

describe('buildSpendingArc without a budget', () => {
  it('measures each day against an average day, an average day being half way along the scale', () => {
    // ₹2,000 over 10 days so far is ₹200 an average day.
    const arc = buildSpendingArc([tx(1, '2026-11-01', 1000), tx(2, '2026-11-02', 1000)], '2026-11', today, null, money)
    expect(arc.ratios[0]).toBe(2.5)
    expect(arc.ratios[5]).toBe(0)
    expect(arc.big).toBe('₹200')
    expect(arc.small).toBe('a day on average')
    expect(arc.tone).toBe('Default')
  })

  it('treats a budget of nothing as no budget', () => {
    const arc = buildSpendingArc([tx(1, '2026-11-01', 1000)], '2026-11', today, 0, money)
    expect(arc.small).toBe('a day on average')
  })
})

describe('buildSpendingArc with nothing spent', () => {
  it('has a bar of nothing for every day, and says so', () => {
    const arc = buildSpendingArc([], '2026-11', today, BUDGET, money)
    expect(arc.ratios).toEqual(Array(30).fill(0))
    expect(arc.big).toBe('₹0')
    expect(arc.small).toBe('Nothing spent yet')
    expect(arc.tone).toBe('Default')
  })
})

describe('buildSpendingArc for other months', () => {
  it('counts every day of a month that is over, with no today', () => {
    const arc = buildSpendingArc([tx(1, '2026-10-15', 1000)], '2026-10', today, BUDGET, money)
    expect(arc.todayDay).toBeNull()
    expect(arc.ratios).toHaveLength(31)
    expect(arc.ratios[14]).toBe(1000 * 100 / (BUDGET / 31))
  })

  it('leaves out other months, income and deleted expenses', () => {
    const arc = buildSpendingArc(
      [tx(1, '2026-10-30', 9000), tx(2, '2026-11-03', 100), tx(3, '2026-11-03', 5000, { kind: 'income' }), tx(4, '2026-11-03', 700, { deletedAt: 9 })],
      '2026-11',
      today,
      BUDGET,
      money,
    )
    expect(arc.big).toBe('0%')
    expect(arc.ratios[2]).toBeCloseTo(0.1, 5)
  })
})
