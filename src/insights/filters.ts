import type { Transaction } from '../db/schema'

export type KindFilter = 'all' | 'expense' | 'income' | 'transfer'

/** What the Activity list is narrowed to, besides the category chips and the search box. */
export interface ActivityFilters {
  kind: KindFilter
  /** First day to include (YYYY-MM-DD), or '' for no limit. */
  from: string
  /** Last day to include, or ''. */
  to: string
  /** Smallest and largest amount, in minor units, or null for no limit. */
  minMinor: number | null
  maxMinor: number | null
}

export const NO_FILTERS: ActivityFilters = { kind: 'all', from: '', to: '', minMinor: null, maxMinor: null }

/** How many separate filters are in force, shown on the Filters button. A date range counts as one. */
export function countActive(f: ActivityFilters): number {
  return (
    (f.kind !== 'all' ? 1 : 0) +
    (f.from || f.to ? 1 : 0) +
    (f.minMinor !== null || f.maxMinor !== null ? 1 : 0)
  )
}

/** Keeps the transactions that satisfy every filter. Dates are YYYY-MM-DD, so plain comparison is right. */
export function applyFilters<T extends Transaction>(txs: T[], f: ActivityFilters): T[] {
  if (countActive(f) === 0) return txs
  return txs.filter(
    (t) =>
      (f.kind === 'all' || t.kind === f.kind) &&
      (!f.from || t.date >= f.from) &&
      (!f.to || t.date <= f.to) &&
      (f.minMinor === null || t.amountMinor >= f.minMinor) &&
      (f.maxMinor === null || t.amountMinor <= f.maxMinor),
  )
}
