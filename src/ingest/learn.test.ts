import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { learnedCategoryId } from './learn'
import { parseMany } from './localParser'

let id = 0
const tx = (merchant: string, categoryId: number, date = '2026-10-01', kind: Transaction['kind'] = 'expense', createdAt = 0): Transaction => ({
  id: ++id, kind, amountMinor: 100, currency: 'INR', categoryId, merchant, note: '', date,
  paymentMethod: '', source: 'manual', createdAt,
})

describe('learnedCategoryId', () => {
  it('is null for a merchant never seen, or no merchant at all', () => {
    expect(learnedCategoryId('Cafe', [tx('Uber', 3)])).toBeNull()
    expect(learnedCategoryId('', [tx('Uber', 3)])).toBeNull()
    expect(learnedCategoryId('   ', [tx('', 3)])).toBeNull()
  })

  it('returns the category you used, matching the name case-insensitively', () => {
    expect(learnedCategoryId('swiggy', [tx('Swiggy', 5)])).toBe(5)
    expect(learnedCategoryId('  SWIGGY ', [tx('Swiggy', 5)])).toBe(5)
  })

  it('prefers the category used most, then the one used most recently on a tie', () => {
    const many = [tx('Amazon', 4), tx('Amazon', 4), tx('Amazon', 2, '2026-10-20')]
    expect(learnedCategoryId('Amazon', many)).toBe(4)
    const tie = [tx('Amazon', 4, '2026-10-01'), tx('Amazon', 2, '2026-10-20')]
    expect(learnedCategoryId('Amazon', tie)).toBe(2)
  })

  it('ignores money received', () => {
    expect(learnedCategoryId('Employer', [tx('Employer', 9, '2026-10-01', 'income')])).toBeNull()
  })
})

describe('parseMany', () => {
  const today = new Date(2026, 9, 28)

  it('splits entries typed together on commas, semicolons and new lines', () => {
    const rows = parseMany('coffee 120, lunch 340; auto 80\nmetro 30', today)
    expect(rows.map((r) => [r.merchant, r.amountMinor])).toEqual([
      ['Coffee', 12000], ['Lunch', 34000], ['Auto', 8000], ['Metro', 3000],
    ])
  })

  it('keeps a comma inside a number as part of the amount', () => {
    const rows = parseMany('1,200 rent', today)
    expect(rows).toHaveLength(1)
    expect(rows[0].amountMinor).toBe(120000)
    expect(parseMany('rent 18,000', today)).toHaveLength(1)
  })

  it('treats the whole text as one entry if any piece has no amount, so nothing is lost', () => {
    const rows = parseMany('lunch at Joe, the usual place 450', today)
    expect(rows).toHaveLength(1)
    expect(rows[0].amountMinor).toBe(45000)
  })

  it('handles a single entry, a mix of sent and received, and nothing', () => {
    expect(parseMany('450 swiggy', today)).toHaveLength(1)
    const mixed = parseMany('salary 80000, coffee 120', today)
    expect(mixed.map((r) => r.kind)).toEqual(['income', 'expense'])
    expect(parseMany('hello there', today)).toEqual([])
    expect(parseMany('', today)).toEqual([])
  })
})
