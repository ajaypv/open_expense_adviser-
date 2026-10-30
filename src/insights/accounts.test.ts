import { describe, expect, it } from 'vitest'
import type { Account, Transaction } from '../db/schema'
import { balancesByAccount, defaultAccountId } from './accounts'

const main: Account = { id: 1, name: 'Main', openingMinor: 100_000 }
const cash: Account = { id: 2, name: 'Cash', openingMinor: null }

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 1, kind: 'expense', amountMinor: 0, currency: 'INR', categoryId: 1, merchant: '', note: '', date: '2026-10-01',
  paymentMethod: '', source: 'manual', createdAt: 0, ...over,
})

describe('balancesByAccount', () => {
  it('adds received money and subtracts sent money from the opening balance', () => {
    const b = balancesByAccount([tx({ kind: 'income', amountMinor: 50_000 }), tx({ amountMinor: 20_000 })], [main])
    expect(b.get(1)).toEqual({ accountId: 1, netMinor: 30_000, estimatedMinor: 130_000 })
  })

  it('files a transaction with no account under the first account', () => {
    const b = balancesByAccount([tx({ amountMinor: 10_000 })], [main, cash])
    expect(b.get(1)!.estimatedMinor).toBe(90_000)
    expect(b.get(2)!.estimatedMinor).toBe(0)
  })

  it('moves money between accounts with a transfer, leaving the total unchanged', () => {
    const txs = [tx({ kind: 'transfer', amountMinor: 40_000, accountId: 1, toAccountId: 2 })]
    const b = balancesByAccount(txs, [main, cash])
    expect(b.get(1)!.estimatedMinor).toBe(60_000)
    expect(b.get(2)!.estimatedMinor).toBe(40_000)
    expect(b.get(1)!.estimatedMinor + b.get(2)!.estimatedMinor).toBe(100_000)
  })

  it('treats a never-set opening balance as zero, and can go negative', () => {
    expect(balancesByAccount([tx({ amountMinor: 500, accountId: 2 })], [main, cash]).get(2)!.estimatedMinor).toBe(-500)
  })

  it('ignores a transaction that points at an account that no longer exists', () => {
    const b = balancesByAccount([tx({ amountMinor: 500, accountId: 99 })], [main])
    expect(b.get(1)!.estimatedMinor).toBe(100_000)
  })
})

describe('defaultAccountId', () => {
  it('is the first account that is not archived', () => {
    expect(defaultAccountId([{ ...main, archived: true }, cash])).toBe(2)
    expect(defaultAccountId([main, cash])).toBe(1)
    expect(defaultAccountId([])).toBeUndefined()
  })
})
