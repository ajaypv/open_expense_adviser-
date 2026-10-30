import { describe, expect, it } from 'vitest'
import type { Recurring, Transaction } from '../db/schema'
import { applyFilters, countActive, NO_FILTERS } from './filters'
import { describeRule, detectRecurring, dueRules, nextDueAfter, occurrencesDue } from './recurring'
import { categoryBudgetStatus, categoryTrends, monthlyTotals, savingsFor, unusualExpenses } from './trends'

let id = 0
const tx = (date: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: amount * 100, currency: 'INR', categoryId: 1, merchant: '', note: '', date,
  paymentMethod: '', source: 'manual', createdAt: id, ...over,
})

describe('Activity filters', () => {
  const rows = [
    tx('2026-10-01', 100),
    tx('2026-10-10', 500, { kind: 'income' }),
    tx('2026-10-20', 2000),
    tx('2026-10-25', 300, { kind: 'transfer' }),
  ]

  it('changes nothing when no filter is on', () => {
    expect(countActive(NO_FILTERS)).toBe(0)
    expect(applyFilters(rows, NO_FILTERS)).toBe(rows)
  })

  it('narrows by type', () => {
    expect(applyFilters(rows, { ...NO_FILTERS, kind: 'income' })).toHaveLength(1)
    expect(applyFilters(rows, { ...NO_FILTERS, kind: 'expense' })).toHaveLength(2)
    expect(applyFilters(rows, { ...NO_FILTERS, kind: 'transfer' })).toHaveLength(1)
  })

  it('includes both ends of a date range, and accepts one end only', () => {
    expect(applyFilters(rows, { ...NO_FILTERS, from: '2026-10-10', to: '2026-10-20' }).map((t) => t.date)).toEqual(['2026-10-10', '2026-10-20'])
    expect(applyFilters(rows, { ...NO_FILTERS, from: '2026-10-21' })).toHaveLength(1)
    expect(applyFilters(rows, { ...NO_FILTERS, to: '2026-10-01' })).toHaveLength(1)
  })

  it('narrows by amount, inclusive, with either bound optional', () => {
    expect(applyFilters(rows, { ...NO_FILTERS, minMinor: 50_000 }).map((t) => t.amountMinor)).toEqual([50_000, 200_000])
    expect(applyFilters(rows, { ...NO_FILTERS, maxMinor: 10_000 })).toHaveLength(1)
    expect(applyFilters(rows, { ...NO_FILTERS, minMinor: 10_000, maxMinor: 30_000 }).map((t) => t.amountMinor)).toEqual([10_000, 30_000])
  })

  it('combines filters and counts a date range as one', () => {
    const f = { ...NO_FILTERS, kind: 'expense' as const, from: '2026-10-01', to: '2026-10-31', minMinor: 50_000 }
    expect(countActive(f)).toBe(3)
    expect(applyFilters(rows, f).map((t) => t.date)).toEqual(['2026-10-20'])
  })
})

describe('recurring dates', () => {
  it('moves a week or a month on, staying on the usual day of the month', () => {
    expect(nextDueAfter('2026-10-26', 'weekly')).toBe('2026-11-02')
    expect(nextDueAfter('2026-10-01', 'monthly')).toBe('2026-11-01')
    expect(nextDueAfter('2026-12-15', 'monthly')).toBe('2027-01-15')
  })

  it('does not drift after a short month', () => {
    const feb = nextDueAfter('2026-01-31', 'monthly', 31)
    expect(feb).toBe('2026-02-28')
    expect(nextDueAfter(feb, 'monthly', 31)).toBe('2026-03-31')
    expect(nextDueAfter('2028-01-31', 'monthly', 31)).toBe('2028-02-29') // leap year
  })

  const rule = (over: Partial<Recurring> = {}): Recurring => ({
    id: 1, kind: 'expense', amountMinor: 1_800_000, currency: 'INR', categoryId: 1, merchant: 'Rent', note: '',
    paymentMethod: '', frequency: 'monthly', nextDue: '2026-10-01', active: true, ...over,
  })

  it('lists rules due today or earlier, soonest first, and skips paused ones', () => {
    const rules = [rule({ id: 1, nextDue: '2026-10-20' }), rule({ id: 2, nextDue: '2026-10-05' }), rule({ id: 3, nextDue: '2026-11-01' }), rule({ id: 4, nextDue: '2026-10-01', active: false })]
    expect(dueRules(rules, '2026-10-28').map((r) => r.id)).toEqual([2, 1])
  })

  it('lists every occurrence missed while the app was closed, up to a cap', () => {
    expect(occurrencesDue(rule({ nextDue: '2026-08-01' }), '2026-10-28')).toEqual(['2026-08-01', '2026-09-01', '2026-10-01'])
    expect(occurrencesDue(rule({ nextDue: '2026-11-01' }), '2026-10-28')).toEqual([])
    expect(occurrencesDue(rule({ nextDue: '2020-01-01', frequency: 'weekly' }), '2026-10-28', 5)).toHaveLength(5)
  })

  it('says when a rule repeats in plain words', () => {
    expect(describeRule({ frequency: 'monthly', nextDue: '2026-11-01' })).toBe('Every month on the 1st')
    expect(describeRule({ frequency: 'monthly', nextDue: '2026-11-22' })).toBe('Every month on the 22nd')
    expect(describeRule({ frequency: 'monthly', nextDue: '2026-11-13' })).toBe('Every month on the 13th')
    expect(describeRule({ frequency: 'weekly', nextDue: '2026-11-02' })).toMatch(/^Every week on /)
  })
})

describe('detectRecurring', () => {
  const rent = (date: string, amount = 18000) => tx(date, amount, { merchant: 'Rent', categoryId: 6 })

  it('finds a merchant paid about the same amount on about the same day for three months running', () => {
    const found = detectRecurring([rent('2026-08-01'), rent('2026-09-01'), rent('2026-10-02')], [], '2026-10-28')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ merchant: 'Rent', amountMinor: 1_800_000, frequency: 'monthly', count: 3, categoryId: 6 })
    expect(found[0].nextDue).toBe('2026-11-01')
  })

  it('needs three months, in a row, and a steady amount and day', () => {
    expect(detectRecurring([rent('2026-09-01'), rent('2026-10-01')], [], '2026-10-28')).toEqual([])
    expect(detectRecurring([rent('2026-07-01'), rent('2026-09-01'), rent('2026-10-01')], [], '2026-10-28')).toEqual([]) // a gap
    expect(detectRecurring([rent('2026-08-01'), rent('2026-09-01', 25000), rent('2026-10-01')], [], '2026-10-28')).toEqual([])
    expect(detectRecurring([rent('2026-08-01'), rent('2026-09-15'), rent('2026-10-01')], [], '2026-10-28')).toEqual([])
  })

  it('forgets something that has stopped', () => {
    expect(detectRecurring([rent('2026-05-01'), rent('2026-06-01'), rent('2026-07-01')], [], '2026-10-28')).toEqual([])
  })

  it('leaves out what is already a rule, blanks, transfers and deleted rows', () => {
    const rows = [rent('2026-08-01'), rent('2026-09-01'), rent('2026-10-01')]
    expect(detectRecurring(rows, [{ merchant: 'rent', kind: 'expense' }], '2026-10-28')).toEqual([])
    const blank = ['2026-08-01', '2026-09-01', '2026-10-01'].map((d) => tx(d, 100))
    expect(detectRecurring(blank, [], '2026-10-28')).toEqual([])
    const gone = rows.map((t) => ({ ...t, deletedAt: 1 }))
    expect(detectRecurring(gone, [], '2026-10-28')).toEqual([])
  })

  it('treats a monthly salary as recurring too', () => {
    const pay = ['2026-08-30', '2026-09-30', '2026-10-30'].map((d) => tx(d, 80000, { kind: 'income', merchant: 'Employer' }))
    expect(detectRecurring(pay, [], '2026-11-02')[0]).toMatchObject({ kind: 'income', merchant: 'Employer' })
  })
})

describe('insights helpers', () => {
  it('totals the last twelve months, with quiet months as zero', () => {
    const rows = [tx('2026-10-05', 100), tx('2026-10-20', 50), tx('2026-07-01', 30), tx('2025-09-01', 999)]
    const t = monthlyTotals(rows, '2026-10', 12)
    expect(t).toHaveLength(12)
    expect(t[0].month).toBe('2025-11') // 2025-09 falls outside the window
    expect(t[11]).toEqual({ month: '2026-10', totalMinor: 15000 })
    expect(t.find((m) => m.month === '2026-07')!.totalMinor).toBe(3000)
    expect(t.find((m) => m.month === '2026-08')!.totalMinor).toBe(0)
  })

  it('works out how much was kept, and has no rate when nothing came in', () => {
    const out = [tx('2026-10-05', 600)]
    const inn = [tx('2026-10-01', 1000, { kind: 'income' })]
    expect(savingsFor(out, inn, '2026-10')).toEqual({ sentMinor: 60000, receivedMinor: 100000, savedMinor: 40000, ratePct: 40 })
    expect(savingsFor(out, [], '2026-10').ratePct).toBeNull()
    expect(savingsFor(out, [tx('2026-10-01', 400, { kind: 'income' })], '2026-10')).toMatchObject({ savedMinor: -20000, ratePct: -50 })
  })

  it('flags a purchase far above what the category usually costs, and only with enough history', () => {
    const usual = Array.from({ length: 6 }, (_, i) => tx(`2026-0${i + 1}-10`, 100, { categoryId: 3 }))
    const big = tx('2026-10-12', 900, { categoryId: 3 })
    const flagged = unusualExpenses([...usual, big], '2026-10')
    expect(flagged).toHaveLength(1)
    expect(flagged[0]).toMatchObject({ typicalMinor: 10000, times: 9 })
    expect(unusualExpenses([...usual.slice(0, 3), big], '2026-10')).toEqual([]) // too little history
    expect(unusualExpenses([...usual, tx('2026-10-12', 200, { categoryId: 3 })], '2026-10')).toEqual([]) // only 2x
  })

  it('follows the biggest categories over six months', () => {
    const rows = [
      ...['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m) => tx(`${m}-10`, 100, { categoryId: 1 })),
      tx('2026-10-10', 200, { categoryId: 1 }),
      tx('2026-10-11', 50, { categoryId: 2 }),
    ]
    const [first, second] = categoryTrends(rows, '2026-10', 6)
    expect(first).toMatchObject({ categoryId: 1, months: [10000, 10000, 10000, 10000, 10000, 20000], changePct: 100 })
    expect(second).toMatchObject({ categoryId: 2, changePct: null }) // nothing earlier to compare with
  })

  it('shows spending against each category limit, closest to the limit first', () => {
    const spent = [tx('2026-10-05', 90, { categoryId: 1 }), tx('2026-10-06', 20, { categoryId: 2 })]
    const status = categoryBudgetStatus(spent, new Map([[1, 10000], [2, 100000], [3, 5000]]))
    expect(status.map((s) => [s.categoryId, s.spentMinor])).toEqual([[1, 9000], [2, 2000], [3, 0]])
  })
})
