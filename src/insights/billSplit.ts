import type { Category, Recurring, Transaction } from '../db/schema'
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

/** How the month's spending on bills, recharges and EMIs divides, biggest part first. Null when none was spent. */
export function splitBills(monthTxs: Transaction[], categoryById: Map<number, Category>, recurring: Recurring[]): BillSplit | null {
  const spentMinor = monthTxs.reduce((a, t) => a + t.amountMinor, 0)
  // A payment added from a regular one carries its name, so the type is found by that name.
  const tagByName = new Map<string, Recurring['tag']>()
  for (const r of recurring) if (r.kind === 'expense' && r.merchant) tagByName.set(r.merchant.trim().toLowerCase(), tagOf(r))

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
