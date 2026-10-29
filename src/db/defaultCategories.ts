/**
 * Category colors are CSS variables (see index.css) so they re-step for dark mode.
 * Eight hues follow the validated categorical order; "Other" and "Income" are neutral grays.
 * "Income" is the category of every received transaction and is never offered for expenses.
 */
export const INCOME_CATEGORY = 'Income'

export const DEFAULT_CATEGORIES = [
  { name: 'Food & Dining', color: 'var(--s1)' },
  { name: 'Groceries', color: 'var(--s2)' },
  { name: 'Transport', color: 'var(--s3)' },
  { name: 'Shopping', color: 'var(--s4)' },
  { name: 'Bills & Utilities', color: 'var(--s5)' },
  { name: 'Rent & Housing', color: 'var(--s6)' },
  { name: 'Health', color: 'var(--s7)' },
  { name: 'Entertainment & Travel', color: 'var(--s8)' },
  { name: 'Other', color: 'var(--other)' },
  { name: INCOME_CATEGORY, color: 'var(--ink-2)' },
] as const

export type DefaultCategoryName = (typeof DEFAULT_CATEGORIES)[number]['name']
