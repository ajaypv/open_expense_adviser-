import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { earlierEntriesToMove } from './recategorize'

let id = 100
const tx = (merchant: string, categoryId: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: 100, currency: 'INR', categoryId, merchant, note: '',
  date: '2026-10-20', paymentMethod: '', source: 'manual', createdAt: id, ...extra,
})

const edited = { id: 1, merchant: 'Cafe', kind: 'expense' as const, categoryId: 1 }

describe('earlierEntriesToMove', () => {
  it('is every other entry with the same name that is under another category', () => {
    const a = tx('Cafe', 9)
    const b = tx('cafe ', 3)
    const same = tx('Cafe', 1)
    expect(earlierEntriesToMove(edited, [a, b, same])).toEqual([a.id, b.id])
  })

  it('leaves out the edited entry itself', () => {
    const self = tx('Cafe', 9, { id: 1 })
    expect(earlierEntriesToMove(edited, [self])).toEqual([])
  })

  it('goes by the exact name only, not a word in it', () => {
    expect(earlierEntriesToMove(edited, [tx('Cafe Coffee Day', 9), tx('Lunch Cafe', 9)])).toEqual([])
  })

  it('keeps spending and income apart, and skips trashed entries and transfers', () => {
    const rows = [tx('Cafe', 9, { kind: 'income' }), tx('Cafe', 9, { deletedAt: 5 }), tx('Cafe', 9, { kind: 'transfer' })]
    expect(earlierEntriesToMove(edited, rows)).toEqual([])
  })

  it('is empty for a blank name or a transfer', () => {
    expect(earlierEntriesToMove({ ...edited, merchant: '  ' }, [tx('', 9)])).toEqual([])
    expect(earlierEntriesToMove({ ...edited, kind: 'transfer' }, [tx('Cafe', 9)])).toEqual([])
  })
})
