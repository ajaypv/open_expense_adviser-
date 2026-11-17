/**
 * Category colors are CSS variables (see index.css) so they re-step for dark mode.
 * Eight hues follow the validated categorical order, EMI, Recharge, Credit Card and People have a hue of their own, and "Other" and "Income" are neutral grays.
 * "Income" and "Salary" are the categories of received money (Salary for a salary, Income for any other money in) and are never offered
 * for expenses.
 */
export const INCOME_CATEGORY = 'Income'
export const SALARY_CATEGORY = 'Salary'

/** Both categories money received is filed under. */
export const INCOME_CATEGORIES: readonly string[] = [INCOME_CATEGORY, SALARY_CATEGORY]
export const isIncomeCategory = (name: string | undefined) => name !== undefined && INCOME_CATEGORIES.includes(name)

/** Whether what came in is a salary by its name: "Salary", "October payroll", "Stipend". */
export const isSalaryName = (name: string | undefined) => /\b(salary|salaries|payroll|wages?|stipend|paycheque|paycheck)\b/i.test(name ?? '')

export const DEFAULT_CATEGORIES = [
  { name: 'Food & Dining', color: 'var(--s1)' },
  { name: 'Groceries', color: 'var(--s2)' },
  { name: 'Transport', color: 'var(--s3)' },
  { name: 'Shopping', color: 'var(--s4)' },
  { name: 'Bills & Utilities', color: 'var(--s5)' },
  { name: 'Rent & Housing', color: 'var(--s6)' },
  { name: 'Health', color: 'var(--s7)' },
  { name: 'Entertainment & Travel', color: 'var(--s8)' },
  { name: 'EMI', color: 'var(--s9)' },
  { name: 'Recharge', color: 'var(--s10)' },
  { name: 'Credit Card', color: 'var(--s11)' },
  { name: 'People', color: 'var(--s12)' },
  { name: 'Other', color: 'var(--other)' },
  { name: INCOME_CATEGORY, color: 'var(--ink-2)' },
  { name: SALARY_CATEGORY, color: 'var(--good-text)' },
] as const

/** The categories that were once part of Bills & Utilities and now stand on their own. */
export const BILL_SPLIT_OFF = ['EMI', 'Recharge', 'Credit Card'] as const

/**
 * Which of the separate categories a payment filed under Bills & Utilities belongs in by what its name says, or null when it
 * really is a bill. Used once, to move what was filed there before EMI, Recharge and Credit Card had categories of their own.
 */
export function separateCategoryFor(merchant: string): (typeof BILL_SPLIT_OFF)[number] | null {
  const n = merchant.trim().toLowerCase()
  if (/\b(emi|loan|instal)/.test(n)) return 'EMI'
  if (/\b(recharge|prepaid|postpaid|dth|jio|airtel|vodafone|bsnl|telecom|telicom)/.test(n)) return 'Recharge'
  if (/\b(credit card|card bill|card repayment|cred|slice)\b/.test(n)) return 'Credit Card'
  return null
}

export type DefaultCategoryName = (typeof DEFAULT_CATEGORIES)[number]['name']
