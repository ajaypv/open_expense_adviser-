import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { buildLedger, type RawData } from './buildLedger'

let id = 0
const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: 10_000, currency: 'INR', categoryId: 1, merchant: '', note: '', date: '2026-10-05',
  paymentMethod: '', source: 'manual', createdAt: id, ...over,
})

const raw = (over: Partial<RawData> = {}): RawData => ({
  transactions: [],
  categories: [
    { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
    { id: 2, name: 'Income', color: 'var(--ink-2)' },
  ],
  accounts: [{ id: 1, name: 'Main', openingMinor: null }],
  budgets: [],
  recurring: [],
  currency: 'INR',
  rates: {},
  ...over,
})

describe('buildLedger', () => {
  it('keeps trashed transactions out of every total and lists them in the trash, newest first', () => {
    const l = buildLedger(raw({ transactions: [tx(), tx({ deletedAt: 100 }), tx({ deletedAt: 300 })] }))
    expect(l.txs).toHaveLength(1)
    expect(l.expenses).toHaveLength(1)
    expect(l.trash.map((t) => t.deletedAt)).toEqual([300, 100])
    expect(l.netMinor).toBe(-10_000)
  })

  it('counts money sent and received separately, and transfers as neither', () => {
    const l = buildLedger(
      raw({
        accounts: [{ id: 1, name: 'Main', openingMinor: 100_000 }, { id: 2, name: 'Cash', openingMinor: null }],
        transactions: [
          tx({ kind: 'expense', amountMinor: 20_000 }),
          tx({ kind: 'income', amountMinor: 50_000 }),
          tx({ kind: 'transfer', amountMinor: 30_000, accountId: 1, toAccountId: 2 }),
        ],
      }),
    )
    expect(l.expenses).toHaveLength(1)
    expect(l.income).toHaveLength(1)
    expect(l.txs).toHaveLength(3)
    // 100,000 opening - 20,000 + 50,000; the transfer only moves money between accounts.
    expect(l.estimatedBalanceMinor).toBe(130_000)
    expect(l.balances.get(1)!.estimatedMinor).toBe(100_000)
    expect(l.balances.get(2)!.estimatedMinor).toBe(30_000)
  })

  it('converts other currencies with the rates you set, keeping what was actually paid', () => {
    const l = buildLedger(raw({ rates: { USD: 83.5 }, transactions: [tx({ currency: 'USD', amountMinor: 1_000 })] }))
    expect(l.txs[0]).toMatchObject({ amountMinor: 83_500, currency: 'INR', originalMinor: 1_000, originalCurrency: 'USD' })
    expect(l.missingRates).toEqual([])
    expect(l.expenses[0].amountMinor).toBe(83_500) // $10 at 83.5 is ₹835
  })

  it('counts a currency with no rate at face value and says which one needs a rate', () => {
    const l = buildLedger(raw({ transactions: [tx({ currency: 'EUR', amountMinor: 5_000 }), tx({ currency: 'USD', amountMinor: 100 })] }))
    expect(l.missingRates).toEqual(['EUR', 'USD'])
    expect(l.txs[0]).toMatchObject({ amountMinor: 5_000, currency: 'INR', originalCurrency: 'EUR', originalMinor: 5_000 })
  })

  it('ignores rates that are not usable numbers', () => {
    const l = buildLedger(raw({ rates: { USD: -3, EUR: Number.NaN, GBP: 0 }, transactions: [tx({ currency: 'USD' })] }))
    expect(l.missingRates).toEqual(['USD'])
  })

  it('leaves transactions already in the main currency untouched, as the same objects', () => {
    const t = tx()
    expect(buildLedger(raw({ transactions: [t] })).txs[0]).toBe(t)
  })

  it('switching the main currency makes older amounts foreign, and a rate fixes them', () => {
    const rows = [tx({ currency: 'INR', amountMinor: 83_000 })]
    const before = buildLedger(raw({ currency: 'USD', transactions: rows }))
    expect(before.missingRates).toEqual(['INR'])
    const after = buildLedger(raw({ currency: 'USD', rates: { INR: 0.012 }, transactions: rows }))
    expect(after.missingRates).toEqual([])
    expect(after.txs[0].amountMinor).toBe(996) // ₹830 at 0.012 = $9.96
  })

  it('separates the overall budget from category budgets', () => {
    const l = buildLedger(
      raw({
        budgets: [
          { id: 1, categoryId: null, monthlyLimitMinor: 5_000_000, currency: 'INR' },
          { id: 2, categoryId: 1, monthlyLimitMinor: 800_000, currency: 'INR' },
        ],
      }),
    )
    expect(l.budgetMinor).toBe(5_000_000)
    expect([...l.categoryBudgets]).toEqual([[1, 800_000]])
  })

  it('reports whether any account has a balance set, and excludes Income from expense categories', () => {
    expect(buildLedger(raw()).balanceSet).toBe(false)
    expect(buildLedger(raw({ accounts: [{ id: 1, name: 'Main', openingMinor: 0 }] })).balanceSet).toBe(true)
    expect(buildLedger(raw()).expenseCategories.map((c) => c.name)).toEqual(['Food & Dining'])
  })
})
