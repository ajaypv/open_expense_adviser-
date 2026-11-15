import { daysInMonth } from './aggregates'
import type { Recurring, RecurringTag } from '../db/schema'
import { tagOf, type UpcomingPayment } from './upcoming'

/** Where a regular payment stands: already added, late and not added, or still to come. */
export type BillState = 'paid' | 'late' | 'upcoming'

export interface Bill {
  key: string
  /** The day it is (or was) due, YYYY-MM-DD. */
  date: string
  name: string
  tag: RecurringTag
  categoryId: number
  categoryName?: string
  kind: 'expense' | 'income'
  /** In the main currency. */
  amountMinor: number
  state: BillState
  /** Days from today: zero today, negative once late. Not set for a paid one. */
  daysLeft?: number
  /** The rule behind it, so it can be opened to change (not known for one that was paid). */
  rule?: Recurring
}

/** The part of a transaction this needs; a ledger row has all of it. */
interface PaidTx {
  id: number
  kind: 'expense' | 'income' | 'transfer'
  source: 'manual' | 'chat' | 'import' | 'recurring'
  date: string
  merchant: string
  categoryId: number
  amountMinor: number
}

const nameKey = (s: string) => s.trim().toLowerCase()

/**
 * Every regular payment as a calendar wants it, in the order of the days: the ones already added (a transaction made from a regular
 * payment), the late ones (due before today and not added yet) and the ones still to come. `items` are the payments from today onwards,
 * as `upcomingPayments` gives them, late ones first.
 */
export function billsFrom(
  txs: PaidTx[],
  items: UpcomingPayment[],
  rules: Recurring[],
  categoryName: (id: number) => string | undefined,
): Bill[] {
  const byName = new Map<string, Recurring>()
  for (const r of rules) if (r.merchant) byName.set(nameKey(r.merchant), r)

  const out: Bill[] = []
  for (const t of txs) {
    if (t.source !== 'recurring' || t.kind === 'transfer') continue
    const rule = byName.get(nameKey(t.merchant))
    const category = categoryName(t.categoryId)
    out.push({
      key: `paid-${t.id}`,
      date: t.date,
      name: t.merchant || category || (t.kind === 'income' ? 'Income' : 'Payment'),
      tag: rule ? tagOf(rule) : t.kind === 'income' ? 'income' : 'other',
      categoryId: t.categoryId,
      categoryName: category,
      kind: t.kind,
      amountMinor: t.amountMinor,
      state: 'paid',
    })
  }
  for (const p of items) {
    const category = categoryName(p.rule.categoryId)
    out.push({
      key: p.key,
      date: p.date,
      name: p.rule.merchant || category || (p.kind === 'income' ? 'Income' : 'Payment'),
      tag: tagOf(p.rule),
      categoryId: p.rule.categoryId,
      categoryName: category,
      kind: p.kind,
      amountMinor: p.amountMinor,
      state: p.overdue ? 'late' : 'upcoming',
      daysLeft: p.daysLeft,
      rule: p.rule,
    })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

export interface Cell {
  /** YYYY-MM-DD. */
  date: string
  day: number
  /** In the month shown, as against a day of the month before or after that fills the week. */
  inMonth: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (y: number, m: number, d: number) => {
  const date = new Date(y, m, d)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * The month as a grid, always six weeks of seven so it keeps its height from month to month: the days of the month in place, and the
 * days of the months either side filling the first and last weeks. `firstDay` is the day the week starts on, 1 for Monday to 7 for Sunday.
 */
export function monthGrid(monthKey: string, firstDay: number): Cell[] {
  const [y, m] = monthKey.split('-').map(Number)
  const lead = (new Date(y, m - 1, 1).getDay() - (firstDay % 7) + 7) % 7
  const cells: Cell[] = []
  for (let i = 0; i < 42; i++) {
    const day = i - lead + 1
    const date = new Date(y, m - 1, day)
    cells.push({ date: keyOf(y, m - 1, day), day: date.getDate(), inMonth: day >= 1 && day <= daysInMonth(monthKey) })
  }
  return cells
}

/** The bills grouped by the day they fall on. */
export function byDay(bills: Bill[]): Map<string, Bill[]> {
  const map = new Map<string, Bill[]>()
  for (const b of bills) map.set(b.date, [...(map.get(b.date) ?? []), b])
  return map
}

export interface Counts {
  upcoming: number
  late: number
  paid: number
}

/** How many of these are still to come, late, or paid. */
export function countsOf(bills: Bill[]): Counts {
  const c: Counts = { upcoming: 0, late: 0, paid: 0 }
  for (const b of bills) c[b.state]++
  return c
}
