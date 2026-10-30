import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { categoryTrends, unusualExpenses } from './trends'

let id = 0
const spend = (date: string, amount: number, categoryId = 1): Transaction =>
  ({ id: ++id, kind: 'expense', amountMinor: amount * 100, currency: 'INR', categoryId, merchant: '', note: '', date, paymentMethod: '', source: 'manual', createdAt: id }) as Transaction

describe('categoryTrends: the change against what is usual', () => {
  it('does not call it a jump when only one earlier month exists, which is too little to compare with', () => {
    const rows = [spend('2026-09-10', 1000), spend('2026-10-10', 4000)]
    expect(categoryTrends(rows, '2026-10')[0].changePct).toBeNull()
  })

  it('averages only the months since logging began, not the empty months before', () => {
    // Three months of use, ₹1,000 each: steady, not 60% above an average dragged down by three empty months.
    const rows = [spend('2026-08-10', 1000), spend('2026-09-10', 1000), spend('2026-10-10', 1000)]
    expect(categoryTrends(rows, '2026-10')[0].changePct).toBe(0)
  })

  it('compares with the usual of those months', () => {
    const rows = [spend('2026-08-10', 1000), spend('2026-09-10', 1000), spend('2026-10-10', 2000)]
    const [food] = categoryTrends(rows, '2026-10')
    expect(food.changePct).toBe(100)
    expect(food.averageMinor).toBe(100_000)
  })

  it('counts a quiet month in one category as zero when other spending shows the person was logging', () => {
    const rows = [spend('2026-08-10', 500, 2), spend('2026-09-10', 500, 2), spend('2026-10-10', 1000, 1), spend('2026-08-12', 1000, 1)]
    const food = categoryTrends(rows, '2026-10').find((t) => t.categoryId === 1)!
    expect(food.changePct).toBe(100) // (1000 + 0) / 2 = 500 usual; 1000 is double
  })

  it('gives no change for a month still in progress, which is only part of a month', () => {
    const rows = [spend('2026-08-10', 1000), spend('2026-09-10', 1000), spend('2026-10-10', 300)]
    expect(categoryTrends(rows, '2026-10', 6, 4, true)[0].changePct).toBeNull()
    expect(categoryTrends(rows, '2026-10', 6, 4, false)[0].changePct).toBe(-70)
  })
})

describe('unusualExpenses: the faster way gives the same answers', () => {
  // The straightforward version it replaced: for every transaction, sort everything else in its category.
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  function reference(expenses: Transaction[], month: string, limit = 3) {
    const out: { id: number; times: number; typicalMinor: number }[] = []
    for (const t of expenses.filter((x) => x.date.startsWith(month))) {
      const others = expenses.filter((o) => o.categoryId === t.categoryId && o.id !== t.id)
      if (others.length < 5) continue
      const typicalMinor = median(others.map((o) => o.amountMinor))
      if (typicalMinor <= 0) continue
      const times = t.amountMinor / typicalMinor
      if (times >= 2.5) out.push({ id: t.id, times, typicalMinor })
    }
    return out.sort((a, b) => b.times - a.times).slice(0, limit)
  }

  // A small deterministic generator so a failure can be reproduced.
  const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('matches on a random month of spending (seed %i)', (seed) => {
    const r = rng(seed)
    const rows: Transaction[] = []
    for (let i = 0; i < 160; i++) {
      const month = r() < 0.4 ? '2026-10' : r() < 0.5 ? '2026-09' : '2026-08'
      const base = [100, 450, 2000][Math.floor(r() * 3)]
      const amount = Math.max(1, Math.round(base * (r() < 0.08 ? 4 + r() * 6 : 0.6 + r() * 0.8)))
      rows.push({ ...spend(`${month}-${String(1 + Math.floor(r() * 27)).padStart(2, '0')}`, amount, 1 + Math.floor(r() * 3)) })
    }
    const got = unusualExpenses(rows, '2026-10', 5).map((u) => ({ id: u.tx.id, times: u.times, typicalMinor: u.typicalMinor }))
    expect(got).toEqual(reference(rows, '2026-10', 5))
  })

  it('is tested on data that really contains unusual purchases, not on empty answers', () => {
    let found = 0
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = rng(seed)
      const rows: Transaction[] = []
      for (let i = 0; i < 160; i++) {
        const month = r() < 0.4 ? '2026-10' : r() < 0.5 ? '2026-09' : '2026-08'
        const base = [100, 450, 2000][Math.floor(r() * 3)]
        const amount = Math.max(1, Math.round(base * (r() < 0.08 ? 4 + r() * 6 : 0.6 + r() * 0.8)))
        rows.push(spend(`${month}-${String(1 + Math.floor(r() * 27)).padStart(2, '0')}`, amount, 1 + Math.floor(r() * 3)))
      }
      found += unusualExpenses(rows, '2026-10', 5).length
    }
    expect(found).toBeGreaterThan(5)
  })

  it('treats equal amounts correctly: the transaction itself is left out once, not every copy of its amount', () => {
    const rows = [...Array.from({ length: 6 }, () => spend('2026-09-01', 100)), spend('2026-10-01', 100), spend('2026-10-02', 900)]
    expect(unusualExpenses(rows, '2026-10').map((u) => u.tx.date)).toEqual(['2026-10-02'])
  })
})
