import type { Transaction } from '../db/schema'
import { inMonth, monthOf, shiftMonth, sum, type MonthKey } from './aggregates'

export interface MonthTotal {
  month: MonthKey
  totalMinor: number
}

/** Spending for each of the last `n` months ending at `endMonth`, oldest first. Quiet months are zero, not missing. */
export function monthlyTotals(expenses: Transaction[], endMonth: MonthKey, n = 12): MonthTotal[] {
  const totals = new Map<MonthKey, number>()
  for (const t of expenses) totals.set(monthOf(t.date), (totals.get(monthOf(t.date)) ?? 0) + t.amountMinor)
  return Array.from({ length: n }, (_, i) => {
    const month = shiftMonth(endMonth, i - (n - 1))
    return { month, totalMinor: totals.get(month) ?? 0 }
  })
}

export interface Savings {
  sentMinor: number
  receivedMinor: number
  /** Received minus sent. Negative when more went out than came in. */
  savedMinor: number
  /** Share of what came in that was kept, as a whole percent. null when nothing came in. */
  ratePct: number | null
}

export function savingsFor(expenses: Transaction[], income: Transaction[], month: MonthKey): Savings {
  const sentMinor = sum(inMonth(expenses, month))
  const receivedMinor = sum(inMonth(income, month))
  const savedMinor = receivedMinor - sentMinor
  return {
    sentMinor,
    receivedMinor,
    savedMinor,
    ratePct: receivedMinor > 0 ? Math.round((savedMinor / receivedMinor) * 100) : null,
  }
}

export interface Unusual {
  tx: Transaction
  /** What this category usually costs per transaction. */
  typicalMinor: number
  /** How many times larger this one is. */
  times: number
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

/** Needs this many other transactions in the category before "unusual" means anything. */
const MIN_HISTORY = 5
/** How much bigger than the typical amount counts as unusual. */
const UNUSUAL_TIMES = 2.5

/**
 * Expenses this month far larger than that category's usual: at least 2.5 times its median, judged
 * against everything else in the category. The biggest jump first.
 */
export function unusualExpenses(expenses: Transaction[], month: MonthKey, limit = 3): Unusual[] {
  const byCategory = new Map<number, Transaction[]>()
  for (const t of expenses) {
    const g = byCategory.get(t.categoryId)
    if (g) g.push(t)
    else byCategory.set(t.categoryId, [t])
  }
  const out: Unusual[] = []
  for (const t of inMonth(expenses, month)) {
    const others = (byCategory.get(t.categoryId) ?? []).filter((o) => o.id !== t.id)
    if (others.length < MIN_HISTORY) continue
    const typicalMinor = median(others.map((o) => o.amountMinor))
    if (typicalMinor <= 0) continue
    const times = t.amountMinor / typicalMinor
    if (times >= UNUSUAL_TIMES) out.push({ tx: t, typicalMinor, times })
  }
  return out.sort((a, b) => b.times - a.times).slice(0, limit)
}

export interface CategoryTrend {
  categoryId: number
  /** Spending in each of the last `n` months, oldest first. */
  months: number[]
  /** The latest month against the average of the ones before it, as a whole percent. null if there is no earlier spending. */
  changePct: number | null
}

/** How the biggest categories have moved over the last `n` months. */
export function categoryTrends(expenses: Transaction[], endMonth: MonthKey, n = 6, limit = 4): CategoryTrend[] {
  const keys = Array.from({ length: n }, (_, i) => shiftMonth(endMonth, i - (n - 1)))
  const grid = new Map<number, number[]>()
  for (const t of expenses) {
    const i = keys.indexOf(monthOf(t.date))
    if (i === -1) continue
    const row = grid.get(t.categoryId) ?? new Array<number>(n).fill(0)
    row[i] += t.amountMinor
    grid.set(t.categoryId, row)
  }
  return [...grid]
    .map(([categoryId, months]) => {
      const before = months.slice(0, -1)
      const average = before.reduce((a, b) => a + b, 0) / before.length
      return { categoryId, months, changePct: average > 0 ? Math.round(((months[n - 1] - average) / average) * 100) : null }
    })
    .sort((a, b) => b.months.reduce((x, y) => x + y, 0) - a.months.reduce((x, y) => x + y, 0))
    .slice(0, limit)
}

export interface CategoryBudgetStatus {
  categoryId: number
  spentMinor: number
  limitMinor: number
}

/** Each category that has a limit, with what has been spent against it this month. Closest to its limit first. */
export function categoryBudgetStatus(
  monthExpenses: Transaction[],
  limits: Map<number, number>,
): CategoryBudgetStatus[] {
  const spent = new Map<number, number>()
  for (const t of monthExpenses) spent.set(t.categoryId, (spent.get(t.categoryId) ?? 0) + t.amountMinor)
  return [...limits]
    .map(([categoryId, limitMinor]) => ({ categoryId, limitMinor, spentMinor: spent.get(categoryId) ?? 0 }))
    .sort((a, b) => b.spentMinor / b.limitMinor - a.spentMinor / a.limitMinor)
}
