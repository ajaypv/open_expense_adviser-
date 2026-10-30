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

/** Needs this many other transactions in the category before "unusual" means anything. */
const MIN_HISTORY = 5
/** How much bigger than the typical amount counts as unusual. */
const UNUSUAL_TIMES = 2.5

/** The first position in an ascending list that holds `value` or something larger. */
function lowerBound(sorted: number[], value: number): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Expenses this month far larger than that category's usual: at least 2.5 times its median, judged
 * against everything else in the category. The biggest jump first.
 *
 * Each category's amounts are sorted once. The median of "everything else" is then read straight off that
 * list, skipping the transaction's own place in it, rather than sorting the rest again for every transaction.
 */
export function unusualExpenses(expenses: Transaction[], month: MonthKey, limit = 3): Unusual[] {
  const amounts = new Map<number, number[]>()
  for (const t of expenses) {
    const list = amounts.get(t.categoryId)
    if (list) list.push(t.amountMinor)
    else amounts.set(t.categoryId, [t.amountMinor])
  }
  for (const list of amounts.values()) list.sort((a, b) => a - b)

  const out: Unusual[] = []
  for (const t of inMonth(expenses, month)) {
    const sorted = amounts.get(t.categoryId) ?? []
    const others = sorted.length - 1
    if (others < MIN_HISTORY) continue
    // Take this transaction's own amount out of the list (one copy of it), then read the middle.
    const own = lowerBound(sorted, t.amountMinor)
    const middle = Math.floor(others / 2)
    const typicalMinor = sorted[middle < own ? middle : middle + 1]
    if (typicalMinor <= 0) continue
    const times = t.amountMinor / typicalMinor
    if (times >= UNUSUAL_TIMES) out.push({ tx: t, typicalMinor, times })
  }
  return out.sort((x, y) => y.times - x.times).slice(0, limit)
}

export interface CategoryTrend {
  categoryId: number
  /** Spending in each of the last `n` months, oldest first. */
  months: number[]
  /**
   * The latest month against the usual of the months before it, as a whole percent. null when there isn't
   * enough to compare with: fewer than two earlier months of use, or a latest month that is still in progress.
   */
  changePct: number | null
  /** The usual month: the average of the earlier months since logging began. 0 when there is none. */
  averageMinor: number
}

/** Earlier months needed before "more than usual" means anything. */
const MIN_EARLIER_MONTHS = 2

/** How the biggest categories have moved over the last `n` months. */
export function categoryTrends(expenses: Transaction[], endMonth: MonthKey, n = 6, limit = 4, endInProgress = false): CategoryTrend[] {
  const keys = Array.from({ length: n }, (_, i) => shiftMonth(endMonth, i - (n - 1)))
  const grid = new Map<number, number[]>()
  const overall = new Array<number>(n).fill(0)
  for (const t of expenses) {
    const i = keys.indexOf(monthOf(t.date))
    if (i === -1) continue
    const row = grid.get(t.categoryId) ?? new Array<number>(n).fill(0)
    row[i] += t.amountMinor
    grid.set(t.categoryId, row)
    overall[i] += t.amountMinor
  }
  // The months before the first one with anything logged say nothing about what is usual, so they are left out
  // of the average. Without this a person with two months of use sees "+400%" against four empty months.
  const first = overall.findIndex((m) => m > 0)
  return [...grid]
    .map(([categoryId, months]) => {
      const earlier = first === -1 ? [] : months.slice(first, -1)
      const enough = earlier.length >= MIN_EARLIER_MONTHS
      const average = enough ? earlier.reduce((a, b) => a + b, 0) / earlier.length : 0
      const changePct = enough && average > 0 && !endInProgress ? Math.round(((months[n - 1] - average) / average) * 100) : null
      return { categoryId, months, changePct, averageMinor: Math.round(average) }
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
