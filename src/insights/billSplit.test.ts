import { describe, expect, it } from 'vitest'
import type { Category, Recurring, Transaction } from '../db/schema'
import { BILL_SHADE, billKindOf, splitBills, splitCategoryTotals } from './billSplit'

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

describe('splitCategoryTotals', () => {
  const txs = () => [tx('Home loan EMI', 12_000), tx('Jio recharge', 300), tx('Airtel recharge', 200), tx('BESCOM', 1_500), tx('Swiggy', 6_000, 1)]

  it('divides the Bills and utilities total into what it was for, in place of the one category', () => {
    const t = splitCategoryTotals(txs(), byId, [])
    expect(t.map((x) => [x.name ?? byId.get(x.categoryId)?.name, x.totalMinor / 100])).toEqual([
      ['EMIs', 12_000],
      ['Food & Dining', 6_000],
      ['Utilities', 1_500],
      ['Recharges', 500],
    ])
    expect(t.some((x) => byId.get(x.categoryId)?.name === 'Bills & Utilities' && x.name === undefined)).toBe(false)
  })

  it('adds up to the same total as by category', () => {
    const all = splitCategoryTotals(txs(), byId, [])
    expect(all.reduce((a, x) => a + x.totalMinor, 0)).toBe(20_000 * 100)
  })

  it('gives each part its own key, icon and a shade of the bills colour, and a plain category none of them', () => {
    const t = splitCategoryTotals(txs(), byId, [])
    const emi = t.find((x) => x.key === 'bill-emi')!
    expect(emi.icon).toBe('emi')
    expect(emi.color).toBe(BILL_SHADE.emi)
    expect(emi.color).toContain('--s5')
    expect(t.find((x) => x.key === 'bill-recharge')!.icon).toBe('recharge')
    const food = t.find((x) => x.categoryId === 1)!
    expect(food.key).toBeUndefined()
    expect(food.name).toBeUndefined()
  })

  it('opens the category most of a part was filed under', () => {
    const t = splitCategoryTotals([...txs(), tx('Bajaj EMI', 500, 3), tx('Jio recharge', 99, 1)], byId, [])
    expect(t.find((x) => x.key === 'bill-emi')!.categoryId).toBe(2) // 12,000 in Bills against 500 in Shopping
    expect(t.find((x) => x.key === 'bill-recharge')!.categoryId).toBe(2)
  })

  it('counts an EMI as one wherever it was filed, taking it out of that category', () => {
    const t = splitCategoryTotals([tx('Bajaj Finserv EMI', 4_000, 3), tx('Shoes', 1_000, 3), tx('Jio recharge', 300)], byId, [])
    expect(t.find((x) => x.key === 'bill-emi')!.totalMinor).toBe(4_000 * 100)
    expect(t.find((x) => x.categoryId === 3 && x.key === undefined)!.totalMinor).toBe(1_000 * 100)
  })

  it('finds an EMI added from a regular payment by the rule', () => {
    const rule: Recurring = {
      id: 1, kind: 'expense', amountMinor: 500_000, currency: 'INR', categoryId: 3, merchant: 'Bike', note: '', paymentMethod: '',
      frequency: 'monthly', nextDue: '2026-11-05', active: true, tag: 'loan',
    }
    const t = splitCategoryTotals([tx('Bike', 5_000, 3, { source: 'recurring' }), tx('Jio recharge', 300)], byId, [rule])
    expect(t.map((x) => x.name).sort()).toEqual(['EMIs', 'Recharges'])
  })

  it('is just the categories when there is nothing to divide: one part, or none', () => {
    const one = splitCategoryTotals([tx('BESCOM', 1_500), tx('Swiggy', 400, 1)], byId, [])
    expect(one.map((x) => [x.categoryId, x.key])).toEqual([[2, undefined], [1, undefined]])
    expect(splitCategoryTotals([tx('Swiggy', 400, 1)], byId, [])).toHaveLength(1)
    expect(splitCategoryTotals([], byId, [])).toEqual([])
  })
})
