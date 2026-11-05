import { describe, expect, it } from 'vitest'
import type { Category, Recurring, Transaction } from '../db/schema'
import { billKindOf, splitBills } from './billSplit'

const categories: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Bills & Utilities', color: 'var(--s5)' },
  { id: 3, name: 'Shopping', color: 'var(--s3)' },
]
const byId = new Map(categories.map((c) => [c.id, c]))

let id = 0
const tx = (merchant: string, rupees: number, categoryId = 2, over: Partial<Transaction> = {}): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId, merchant, note: '', date: '2026-10-05',
  paymentMethod: '', source: 'manual', createdAt: id, ...over,
})

describe('billKindOf', () => {
  it.each([
    ['Jio recharge', 'Bills & Utilities', 'recharge'],
    ['Airtel', 'Bills & Utilities', 'recharge'],
    ['HDFC home loan EMI', 'Bills & Utilities', 'emi'],
    ['Bajaj Finserv EMI', 'Shopping', 'emi'],
    ['BESCOM', 'Bills & Utilities', 'utilities'],
    ['Water bill', 'Bills & Utilities', 'utilities'],
    ['Broadband', 'Bills & Utilities', 'utilities'],
    ['LIC', 'Bills & Utilities', 'insurance'],
    ['Health insurance', 'Shopping', 'insurance'],
    ['Society maintenance', 'Bills & Utilities', 'bills'],
  ])('puts %s, filed under %s, in %s', (merchant, category, kind) => {
    expect(billKindOf({ merchant, note: '' }, category)).toBe(kind)
  })

  it('leaves out what is not a bill', () => {
    expect(billKindOf({ merchant: 'Swiggy', note: '' }, 'Food & Dining')).toBeNull()
    expect(billKindOf({ merchant: 'Premium coffee', note: '' }, 'Food & Dining')).toBeNull()
    expect(billKindOf({ merchant: 'Remit', note: '' }, 'Shopping')).toBeNull()
  })

  it('counts a payment set up as a Loan EMI as one, whatever it is called or filed under', () => {
    expect(billKindOf({ merchant: 'Bike', note: '' }, 'Shopping', 'loan')).toBe('emi')
  })

  it('counts a payment set up as a Bill as a bill, even filed elsewhere', () => {
    expect(billKindOf({ merchant: 'Maintenance', note: '' }, 'Shopping', 'bill')).toBe('bills')
  })
})

describe('splitBills', () => {
  it('is null when nothing went on bills', () => {
    expect(splitBills([tx('Swiggy', 400, 1)], byId, [])).toBeNull()
    expect(splitBills([], byId, [])).toBeNull()
  })

  it('divides the bills into parts, biggest first, with shares of the bills and of the month', () => {
    const txs = [tx('Home loan EMI', 12_000), tx('Jio recharge', 300), tx('Airtel recharge', 200), tx('BESCOM', 1_500), tx('Swiggy', 6_000, 1)]
    const s = splitBills(txs, byId, [])!
    expect(s.totalMinor).toBe(14_000 * 100)
    expect(s.shareOfMonth).toBeCloseTo(14_000 / 20_000)
    expect(s.parts.map((p) => [p.kind, p.totalMinor / 100, p.count])).toEqual([
      ['emi', 12_000, 1],
      ['utilities', 1_500, 1],
      ['recharge', 500, 2],
    ])
    expect(s.parts[0].shareOfBills).toBeCloseTo(12_000 / 14_000)
    expect(s.parts[0].shareOfMonth).toBeCloseTo(12_000 / 20_000)
    expect(s.parts.reduce((a, p) => a + p.shareOfBills, 0)).toBeCloseTo(1)
  })

  it('finds an EMI added from a regular payment by the rule, not just the name', () => {
    const rule: Recurring = {
      id: 1, kind: 'expense', amountMinor: 500_000, currency: 'INR', categoryId: 3, merchant: 'Bike', note: '', paymentMethod: '',
      frequency: 'monthly', nextDue: '2026-11-05', active: true, tag: 'loan',
    }
    const s = splitBills([tx('Bike', 5_000, 3, { source: 'recurring' })], byId, [rule])!
    expect(s.parts).toHaveLength(1)
    expect(s.parts[0].kind).toBe('emi')
    expect(s.parts[0].shareOfBills).toBe(1)
  })
})
