import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { learnedCategoryId, learnedPaymentMethod } from './learn'
import { guessCategoryName } from './localParser'

const FOOD = 1, GROCERIES = 2, TRANSPORT = 3, SHOPPING = 4, OTHER = 5, HEALTH = 6, INCOME = 7
const categoryById = new Map<number, Category>(
  [
    [FOOD, 'Food & Dining'],
    [GROCERIES, 'Groceries'],
    [TRANSPORT, 'Transport'],
    [SHOPPING, 'Shopping'],
    [OTHER, 'Other'],
    [HEALTH, 'Health'],
    [INCOME, 'Income'],
  ].map(([id, name]) => [id as number, { id: id as number, name: name as string, color: 'var(--other)' }]),
)

// Saturday, 31 Oct 2026
const today = new Date(2026, 9, 31)

let id = 0
const tx = (merchant: string, categoryId: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: 100, currency: 'INR', categoryId, merchant, note: '',
  date: '2026-10-20', paymentMethod: '', source: 'manual', createdAt: id, ...extra,
})
const times = (n: number, make: () => Transaction) => Array.from({ length: n }, make)
const learn = (merchant: string, txs: Transaction[]) => learnedCategoryId(merchant, txs, categoryById, today)

describe('guessCategoryName', () => {
  it('is the category the keywords give for a name, or Other', () => {
    expect(guessCategoryName('Ksrtc Bus Fare')).toBe('Transport')
    expect(guessCategoryName('Masala Dosa')).toBe('Food & Dining')
    expect(guessCategoryName('Zudio')).toBe('Other')
    expect(guessCategoryName('')).toBe('Other')
  })
})

describe('learnedCategoryId: only your corrections teach it', () => {
  it('is null for a name never seen, or no name at all', () => {
    expect(learn('Cafe', [tx('Uber', TRANSPORT)])).toBeNull()
    expect(learn('', [tx('Uber', SHOPPING)])).toBeNull()
    expect(learn('   ', [tx('', SHOPPING)])).toBeNull()
  })

  it('uses the category you chose where it differs from the keyword guess, matching the name case-insensitively', () => {
    // "Swiggy" is Food & Dining by keyword; filing it under Shopping was a choice.
    expect(learn('swiggy', [tx('Swiggy', SHOPPING)])).toBe(SHOPPING)
    expect(learn('  SWIGGY ', [tx('Swiggy', SHOPPING)])).toBe(SHOPPING)
  })

  it('learns nothing from entries that only agree with the keywords', () => {
    expect(learn('Swiggy', times(5, () => tx('Swiggy', FOOD)))).toBeNull()
  })

  it('does not take the parser’s own fall-back to Other for a choice, so a word added later still works', () => {
    // Logged before "dosa" was a known word, so the chat bar filed them under Other.
    const stale = times(3, () => tx('Dosa', OTHER, { source: 'chat' }))
    expect(learn('Dosa', stale)).toBeNull()
  })

  it('does count Other when you picked it yourself', () => {
    expect(learn('Dosa', [tx('Dosa', OTHER, { source: 'manual' })])).toBe(OTHER)
  })

  it('ignores money received and trashed entries', () => {
    expect(learn('Employer', [tx('Employer', SHOPPING, { kind: 'income' })])).toBeNull()
    expect(learn('Swiggy', [tx('Swiggy', SHOPPING, { deletedAt: 5 })])).toBeNull()
  })

  it('ignores a category that no longer exists', () => {
    expect(learn('Swiggy', [tx('Swiggy', 99)])).toBeNull()
  })
})

describe('learnedCategoryId: newer choices count for more', () => {
  const longAgo = '2025-10-20'
  const recent = '2026-10-25'

  it('lets a few recent corrections beat many old ones', () => {
    const txs = [...times(10, () => tx('Blue Tokai', FOOD, { date: longAgo })), ...times(3, () => tx('Blue Tokai', HEALTH, { date: recent }))]
    expect(learn('Blue Tokai', txs)).toBe(HEALTH)
  })

  it('goes by how often when they are equally recent', () => {
    const txs = [...times(3, () => tx('Blue Tokai', FOOD)), tx('Blue Tokai', HEALTH)]
    expect(learn('Blue Tokai', txs)).toBe(FOOD)
  })

  it('goes by the most recent on an exact tie', () => {
    const txs = [tx('Blue Tokai', FOOD, { date: '2026-10-01' }), tx('Blue Tokai', HEALTH, { date: '2026-10-01', createdAt: 9999 })]
    expect(learn('Blue Tokai', txs)).toBe(HEALTH)
  })

  it('does not break on a date in the future', () => {
    expect(learn('Blue Tokai', [tx('Blue Tokai', FOOD, { date: '2027-01-01' })])).toBe(FOOD)
  })
})

describe('learnedCategoryId: by the words in a name', () => {
  it('carries a correction to other names with the same distinctive word', () => {
    const txs = [tx('Zudio kurta', SHOPPING), tx('Zudio shirts', SHOPPING)]
    // Before: only the exact name "Zudio kurta" was remembered.
    expect(learn('Zudio', txs)).toBe(SHOPPING)
    expect(learn('Zudio jeans', txs)).toBe(SHOPPING)
  })

  it('needs two entries to agree before it trusts a single word', () => {
    expect(learn('Zudio', [tx('Zudio kurta', SHOPPING)])).toBeNull()
  })

  it('does not trust a word whose entries went different ways', () => {
    const txs = [tx('Zudio kurta', SHOPPING), tx('Zudio kurta', SHOPPING), tx('Zudio cafe', HEALTH), tx('Zudio cafe', HEALTH)]
    expect(learn('Zudio', txs)).toBeNull()
  })

  it('does not learn from filler words such as "paid" or "for"', () => {
    const txs = [tx('Paid for Zudio', SHOPPING), tx('Paid for Rolex', SHOPPING)]
    // "paid" and "for" are in both names but say nothing about the category.
    expect(learn('Paid for Pharmacy', txs)).toBeNull()
  })

  it('prefers the exact name over a word in it', () => {
    const txs = [tx('Zudio kurta', SHOPPING), tx('Zudio shirts', SHOPPING), tx('Zudio', HEALTH)]
    expect(learn('Zudio', txs)).toBe(HEALTH)
  })
})

describe('learnedPaymentMethod', () => {
  it('is the method you usually use for the name, newest first, ignoring entries with none', () => {
    const txs = [tx('Uber', TRANSPORT, { paymentMethod: 'Online' }), tx('Uber', TRANSPORT, { paymentMethod: 'Online' }), tx('Uber', TRANSPORT, { paymentMethod: '' })]
    expect(learnedPaymentMethod('uber', 'expense', txs, today)).toBe('Online')
  })

  it('follows a recent change of habit', () => {
    const txs = [
      ...times(6, () => tx('Uber', TRANSPORT, { paymentMethod: 'Cash', date: '2025-10-01' })),
      ...times(3, () => tx('Uber', TRANSPORT, { paymentMethod: 'Card', date: '2026-10-28' })),
    ]
    expect(learnedPaymentMethod('Uber', 'expense', txs, today)).toBe('Card')
  })

  it('is empty when the name was never seen, never had a method, or is blank', () => {
    expect(learnedPaymentMethod('Uber', 'expense', [tx('Ola', TRANSPORT, { paymentMethod: 'Online' })], today)).toBe('')
    expect(learnedPaymentMethod('Uber', 'expense', [tx('Uber', TRANSPORT)], today)).toBe('')
    expect(learnedPaymentMethod('', 'expense', [tx('', TRANSPORT, { paymentMethod: 'Cash' })], today)).toBe('')
  })

  it('keeps spending and income apart, and ignores trashed entries', () => {
    const income = tx('Salary', INCOME, { kind: 'income', paymentMethod: 'Online' })
    expect(learnedPaymentMethod('Salary', 'expense', [income], today)).toBe('')
    expect(learnedPaymentMethod('Salary', 'income', [income], today)).toBe('Online')
    expect(learnedPaymentMethod('Uber', 'expense', [tx('Uber', TRANSPORT, { paymentMethod: 'Cash', deletedAt: 1 })], today)).toBe('')
  })

  it('reads a method off a word in the name when the exact name is new', () => {
    const txs = [tx('Rapido bike', TRANSPORT, { paymentMethod: 'Online' }), tx('Rapido auto', TRANSPORT, { paymentMethod: 'Online' })]
    expect(learnedPaymentMethod('Rapido', 'expense', txs, today)).toBe('Online')
  })
})
