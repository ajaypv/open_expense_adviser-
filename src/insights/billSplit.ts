import type { Category, Recurring, Transaction } from '../db/schema'
import { byCategory, type CategoryTotal } from './aggregates'
import type { IconName } from '../ui/Icon'
import { nameIcon } from '../ui/categoryIcon'
import { tagOf } from './upcoming'

/** The parts the money that goes on bills divides into, in the order they are listed when equal. */
export type BillKind = 'emi' | 'recharge' | 'utilities' | 'insurance' | 'bills'

export const BILL_LABELS: Record<BillKind, string> = {
  emi: 'EMIs and loans',
  recharge: 'Mobile and DTH recharges',
  utilities: 'Electricity, water, gas and internet',
  insurance: 'Insurance',
  bills: 'Other bills',
}

export interface BillPart {
  kind: BillKind
  totalMinor: number
  count: number
  /** Of everything that went on bills, recharges and EMIs (0 to 1). */
  shareOfBills: number
  /** Of everything spent in the month (0 to 1). */
  shareOfMonth: number
}

export interface BillSplit {
  totalMinor: number
  /** Of everything spent in the month (0 to 1). */
  shareOfMonth: number
  parts: BillPart[]
}

/** The parts as a chart names them: short, since each is a bubble, a segment or a bar. */
export const BILL_SHORT: Record<BillKind, string> = {
  emi: 'EMIs',
  recharge: 'Recharges',
  utilities: 'Utilities',
  insurance: 'Insurance',
  bills: 'Other bills',
}

export const BILL_ICON: Record<BillKind, IconName> = { emi: 'emi', recharge: 'recharge', utilities: 'bolt', insurance: 'heart', bills: 'receipt' }

/**
 * Each part is a shade of the colour of the Bills and utilities category, so that together they read as that category, divided,
 * and apart from every other category. The names and percentages say which is which; the shade only backs them up.
 */
export const BILL_SHADE: Record<BillKind, string> = {
  insurance: 'color-mix(in oklab, var(--s5) 55%, var(--ink))',
  emi: 'color-mix(in oklab, var(--s5) 78%, var(--ink))',
  recharge: 'var(--s5)',
  bills: 'color-mix(in oklab, var(--s5) 74%, var(--surface))',
  utilities: 'color-mix(in oklab, var(--s5) 52%, var(--surface))',
}

const UTILITY_WORDS = /\b(electric|power|water|gas|cylinder|lpg|internet|wifi|broadband|fibre|fiber|fibernet|bescom|bwssb|utilit)/
const INSURANCE_WORDS = /\b(insurance|lic)\b/
const BILL_CATEGORY = /\b(bill|utilit)/

/**
 * Which part a payment belongs to, or null if it is not a bill at all. A name that says EMI or recharge wins wherever the
 * payment is filed (an EMI under Shopping is still an EMI); a regular payment set up as a Loan EMI is one whatever it is called;
 * the rest of what is filed under Bills & Utilities is divided by what its name says.
 */
export function billKindOf(tx: Pick<Transaction, 'merchant' | 'note'>, categoryName: string | undefined, ruleTag?: Recurring['tag']): BillKind | null {
  if (ruleTag === 'loan') return 'emi'
  const byName = nameIcon(tx.merchant) ?? nameIcon(categoryName)
  if (byName === 'emi') return 'emi'
  if (byName === 'recharge') return 'recharge'
  const category = (categoryName ?? '').toLowerCase()
  const inBills = BILL_CATEGORY.test(category) || ruleTag === 'bill'
  // The general category's own name ("Bills & Utilities") says nothing about which part this is, so only the merchant is read.
  const text = inBills ? tx.merchant.toLowerCase() : `${tx.merchant} ${category}`.toLowerCase()
  const insured = INSURANCE_WORDS.test(text) || (inBills && /\bpremium\b/.test(text))
  if (!inBills && !insured) return null
  if (insured) return 'insurance'
  if (UTILITY_WORDS.test(text)) return 'utilities'
  return 'bills'
}

/** A payment added from a regular one carries its name, so the type it was set up as is found by that name. */
function ruleTagsByName(recurring: Recurring[]): Map<string, Recurring['tag']> {
  const tagByName = new Map<string, Recurring['tag']>()
  for (const r of recurring) if (r.kind === 'expense' && r.merchant) tagByName.set(r.merchant.trim().toLowerCase(), tagOf(r))
  return tagByName
}

/**
 * The month's spending by category, with what went on bills divided into what it was for: EMIs, recharges, utilities, insurance
 * and other bills each stand in the place of the one Bills and utilities total. An EMI or a recharge counts as one wherever it was
 * filed, so those come out of the category they were in. It is left as it is, by category alone, when there is nothing to divide
 * (fewer than two of the parts). A part opens the category most of it was filed under.
 */
export function splitCategoryTotals(monthTxs: Transaction[], categoryById: Map<number, Category>, recurring: Recurring[]): CategoryTotal[] {
  const tagByName = ruleTagsByName(recurring)
  const rest: Transaction[] = []
  const parts = new Map<BillKind, { minor: number; byCategory: Map<number, number> }>()
  for (const t of monthTxs) {
    const tag = t.source === 'recurring' ? tagByName.get(t.merchant.trim().toLowerCase()) : undefined
    const kind = billKindOf(t, categoryById.get(t.categoryId)?.name, tag)
    if (!kind) {
      rest.push(t)
      continue
    }
    const p = parts.get(kind) ?? { minor: 0, byCategory: new Map<number, number>() }
    p.minor += t.amountMinor
    p.byCategory.set(t.categoryId, (p.byCategory.get(t.categoryId) ?? 0) + t.amountMinor)
    parts.set(kind, p)
  }
  if (parts.size < 2) return byCategory(monthTxs)

  const split: CategoryTotal[] = [...parts].map(([kind, p]) => ({
    categoryId: [...p.byCategory].sort((a, b) => b[1] - a[1])[0][0],
    totalMinor: p.minor,
    key: `bill-${kind}`,
    name: BILL_SHORT[kind],
    color: BILL_SHADE[kind],
    icon: BILL_ICON[kind],
  }))
  return [...byCategory(rest), ...split].sort((a, b) => b.totalMinor - a.totalMinor)
}

/** How the month's spending on bills, recharges and EMIs divides, biggest part first. Null when none was spent. */
export function splitBills(monthTxs: Transaction[], categoryById: Map<number, Category>, recurring: Recurring[]): BillSplit | null {
  const spentMinor = monthTxs.reduce((a, t) => a + t.amountMinor, 0)
  const tagByName = ruleTagsByName(recurring)

  const sums = new Map<BillKind, { totalMinor: number; count: number }>()
  for (const t of monthTxs) {
    const tag = t.source === 'recurring' ? tagByName.get(t.merchant.trim().toLowerCase()) : undefined
    const kind = billKindOf(t, categoryById.get(t.categoryId)?.name, tag)
    if (!kind) continue
    const s = sums.get(kind) ?? { totalMinor: 0, count: 0 }
    s.totalMinor += t.amountMinor
    s.count += 1
    sums.set(kind, s)
  }
  const totalMinor = [...sums.values()].reduce((a, s) => a + s.totalMinor, 0)
  if (totalMinor <= 0) return null

  const order = Object.keys(BILL_LABELS) as BillKind[]
  const parts = [...sums]
    .map(([kind, s]) => ({ kind, ...s, shareOfBills: s.totalMinor / totalMinor, shareOfMonth: spentMinor > 0 ? s.totalMinor / spentMinor : 0 }))
    .sort((a, b) => b.totalMinor - a.totalMinor || order.indexOf(a.kind) - order.indexOf(b.kind))
  return { totalMinor, shareOfMonth: spentMinor > 0 ? totalMinor / spentMinor : 0, parts }
}
