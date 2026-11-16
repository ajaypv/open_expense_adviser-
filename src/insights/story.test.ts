import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { yearsWithSpending, yearStory } from './story'

const categories: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Bills & Utilities', color: 'var(--s5)' },
  { id: 3, name: 'Shopping', color: 'var(--s2)' },
]
const byId = new Map(categories.map((c) => [c.id, c]))
let id = 0
const tx = (date: string, rupees: number, categoryId = 1, merchant = '', over: Partial<Transaction> = {}): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId, merchant, note: '', date, paymentMethod: '', source: 'manual', createdAt: id, ...over,
})
const today = new Date(2026, 10, 15) // 15 Nov 2026

describe('yearStory', () => {
  const txs = [
    tx('2026-01-05', 500, 1, 'Cafe'),
    tx('2026-01-20', 700, 1, 'Cafe'),
    tx('2026-03-02', 9000, 3, 'Laptop'),
    tx('2026-03-10', 300, 1, 'Cafe'),
    tx('2026-02-11', 399, 2, 'Jio recharge'),
    tx('2026-03-11', 399, 2, 'Jio recharge'),
    tx('2026-04-11', 399, 2, 'Airtel postpaid'),
    tx('2025-12-31', 1000, 1, 'Last year'),
  ]

  it('is null for a year with no spending', () => {
    expect(yearStory(txs, [], byId, [], 2024, today)).toBeNull()
  })

  it('adds up the year, and leaves out the other years', () => {
    const s = yearStory(txs, [], byId, [], 2026, today)!
    expect(s.totalMinor).toBe((500 + 700 + 9000 + 300 + 399 * 3) * 100)
    expect(s.count).toBe(7)
  })

  it('ranks the categories, with each one’s share of the year', () => {
    const s = yearStory(txs, [], byId, [], 2026, today)!
    expect(s.categories.map((c) => c.categoryId)).toEqual([3, 1, 2])
    expect(s.categories[0].share).toBeCloseTo(9000 / (11_697 - 0), 1)
    expect(s.categories.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1, 5)
  })

  it('finds what went on phone bills, with how many payments and what a month came to', () => {
    const s = yearStory(txs, [], byId, [], 2026, today)!
    expect(s.phone).toMatchObject({ totalMinor: 399 * 3 * 100, count: 3, perMonthMinor: 39_900 })
    expect(s.phone!.share).toBeGreaterThan(0.09)
  })

  it('has no phone bills when there were none', () => {
    const s = yearStory([tx('2026-01-05', 500, 1, 'Cafe')], [], byId, [], 2026, today)!
    expect(s.phone).toBeNull()
  })

  it('finds the priciest and cheapest month, January first', () => {
    const s = yearStory(txs, [], byId, [], 2026, today)!
    expect(s.months).toHaveLength(12)
    expect(s.months[2]).toBe((9000 + 300 + 399) * 100)
    expect(s.priciestMonth).toEqual({ month: 2, totalMinor: 969_900 })
    expect(s.cheapestMonth).toEqual({ month: 1, totalMinor: 39_900 })
  })

  it('has no cheapest month when only one month had spending', () => {
    const s = yearStory([tx('2026-05-05', 100), tx('2026-05-06', 200)], [], byId, [], 2026, today)!
    expect(s.cheapestMonth).toBeNull()
  })

  it('finds the biggest expense and the place paid most often', () => {
    const s = yearStory(txs, [], byId, [], 2026, today)!
    expect(s.biggest).toMatchObject({ merchant: 'Laptop', totalMinor: 900_000, date: '2026-03-02' })
    expect(s.favourite).toMatchObject({ name: 'Cafe', count: 3 })
  })

  it('has no favourite place when nothing was paid twice', () => {
    expect(yearStory([tx('2026-05-05', 100, 1, 'A'), tx('2026-05-06', 100, 1, 'B')], [], byId, [], 2026, today)!.favourite).toBeNull()
  })

  it('finds the weekday spent most on, Monday first', () => {
    // 2 Mar 2026 is a Monday.
    const s = yearStory(txs, [], byId, [], 2026, today)!
    expect(s.busiestWeekday).toEqual({ weekday: 0, totalMinor: 950_000 }) // the laptop, and the first coffee of the year (5 Jan was a Monday too)
  })

  it('works out a day on average over the days of the year so far, and the whole year once it is over', () => {
    const open = yearStory([tx('2026-01-01', 360)], [], byId, [], 2026, new Date(2026, 0, 10))!
    expect(open.perDayMinor).toBe(3_600) // ten days so far
    const over = yearStory([tx('2025-06-01', 365)], [], byId, [], 2025, today)!
    expect(over.perDayMinor).toBe(100) // 365 days
  })

  it('rounds an average to the whole rupee, with no paise in a sentence', () => {
    const s = yearStory([tx('2026-01-01', 100)], [], byId, [], 2026, new Date(2026, 0, 3))!
    expect(s.perDayMinor % 100).toBe(0)
  })

  it('says how much came in', () => {
    const s = yearStory(txs, [tx('2026-01-31', 50_000, 1, 'Salary', { kind: 'income' })], byId, [], 2026, today)!
    expect(s.receivedMinor).toBe(5_000_000)
  })
})

describe('yearsWithSpending', () => {
  it('lists the years, newest first', () => {
    expect(yearsWithSpending([tx('2024-01-01', 1), tx('2026-01-01', 1), tx('2025-01-01', 1), tx('2026-06-01', 1)])).toEqual([2026, 2025, 2024])
  })
})
