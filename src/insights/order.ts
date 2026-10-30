import type { Transaction } from '../db/schema'

/**
 * Orders transactions by their YYYY-MM-DD date, then by when they were added. Plain string
 * comparison is correct for ISO dates and far faster than localeCompare, which goes through
 * ICU on every call and dominates a sort of thousands of rows.
 */
export const newestFirst = (a: Transaction, b: Transaction) =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt || b.id - a.id

export const oldestFirst = (a: Transaction, b: Transaction) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt || a.id - b.id
