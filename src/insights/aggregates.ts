import { localDateString, parseLocalDate } from '../db/money'
import type { Transaction } from '../db/schema'

/** YYYY-MM */
export type MonthKey = string

export const monthOf = (date: string): MonthKey => date.slice(0, 7)

export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const [y, m] = key.split('-').map(Number)
  return localDateString(new Date(y, m - 1 + delta, 1)).slice(0, 7)
}

export function daysInMonth(key: MonthKey): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function monthLabel(key: MonthKey): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
    new Date(y, m - 1, 1),
  )
}

export const inMonth = (txs: Transaction[], key: MonthKey) =>
  txs.filter((t) => monthOf(t.date) === key)

export const sum = (txs: Transaction[]) => txs.reduce((acc, t) => acc + t.amountMinor, 0)

/** Total for days 1..day of the month (inclusive). */
export function totalThroughDay(txs: Transaction[], key: MonthKey, day: number): number {
  return sum(inMonth(txs, key).filter((t) => parseLocalDate(t.date).getDate() <= day))
}

export interface CategoryTotal {
  categoryId: number
  totalMinor: number
}

export function byCategory(monthTxs: Transaction[]): CategoryTotal[] {
  const totals = new Map<number, number>()
  for (const t of monthTxs) totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amountMinor)
  return [...totals]
    .map(([categoryId, totalMinor]) => ({ categoryId, totalMinor }))
    .sort((a, b) => b.totalMinor - a.totalMinor)
}

/** Spend per calendar day; index 0 is day 1. */
export function byDay(monthTxs: Transaction[], key: MonthKey): number[] {
  const days = new Array<number>(daysInMonth(key)).fill(0)
  for (const t of monthTxs) days[parseLocalDate(t.date).getDate() - 1] += t.amountMinor
  return days
}

export interface Comparison {
  currentMinor: number
  previousMinor: number
  /** null when there is nothing to compare against. */
  deltaPct: number | null
  /** true when comparing the same elapsed days of the current month. */
  partial: boolean
}

/**
 * For the current month, compares month-to-date with the same elapsed days of the previous
 * month (so day 10 isn't compared with a full month). Past months compare in full.
 */
export function compareToPrevious(txs: Transaction[], key: MonthKey, today: Date): Comparison {
  const prevKey = shiftMonth(key, -1)
  const isCurrent = key === localDateString(today).slice(0, 7)
  const day = today.getDate()
  const currentMinor = isCurrent ? totalThroughDay(txs, key, day) : sum(inMonth(txs, key))
  const previousMinor = isCurrent
    ? totalThroughDay(txs, prevKey, Math.min(day, daysInMonth(prevKey)))
    : sum(inMonth(txs, prevKey))
  const deltaPct =
    previousMinor === 0 ? null : Math.round(((currentMinor - previousMinor) / previousMinor) * 100)
  return { currentMinor, previousMinor, deltaPct, partial: isCurrent }
}

/**
 * Straight-line month-end projection, rounded to a whole currency unit (an estimate shouldn't
 * show paise). Only meaningful for the current month.
 */
export function projectedTotal(totalMinor: number, key: MonthKey, today: Date): number | null {
  if (key !== localDateString(today).slice(0, 7)) return null
  const day = today.getDate()
  if (day < 3 || totalMinor === 0) return null
  return Math.round((totalMinor / day) * daysInMonth(key) / 100) * 100
}

export interface BalanceSummary {
  sentMinor: number
  receivedMinor: number
  /** Received minus sent. */
  netMinor: number
  /** Opening balance + received - sent. */
  estimatedMinor: number
}

/** All-time money in and out, and the balance they imply from a given opening balance. */
export function balanceFrom(txs: Transaction[], openingMinor: number): BalanceSummary {
  let sentMinor = 0
  let receivedMinor = 0
  for (const t of txs) {
    if (t.kind === 'income') receivedMinor += t.amountMinor
    else sentMinor += t.amountMinor
  }
  const netMinor = receivedMinor - sentMinor
  return { sentMinor, receivedMinor, netMinor, estimatedMinor: openingMinor + netMinor }
}

export interface MerchantTotal {
  name: string
  count: number
  totalMinor: number
}

/** Merchants ranked by total spend (names matched case-insensitively; blanks ignored). */
export function topMerchants(monthTxs: Transaction[], limit = 5): MerchantTotal[] {
  const groups = new Map<string, MerchantTotal>()
  for (const t of monthTxs) {
    const name = t.merchant.trim()
    if (!name) continue
    const key = name.toLowerCase()
    const cur = groups.get(key) ?? { name, count: 0, totalMinor: 0 }
    groups.set(key, { ...cur, count: cur.count + 1, totalMinor: cur.totalMinor + t.amountMinor })
  }
  return [...groups.values()].sort((a, b) => b.totalMinor - a.totalMinor).slice(0, limit)
}

/**
 * Running total per day (index 0 = day 1). Days after `throughDay` are null so a chart can
 * stop the line at today; pass null for a finished month.
 */
export function cumulative(
  monthTxs: Transaction[],
  key: MonthKey,
  throughDay: number | null,
): (number | null)[] {
  const days = byDay(monthTxs, key)
  const last = throughDay ?? days.length
  let running = 0
  return days.map((v, i) => (i < last ? (running += v) : null))
}

/** Total spend per weekday, Monday first (index 0 = Monday). */
export function byWeekday(monthTxs: Transaction[]): number[] {
  const totals = new Array<number>(7).fill(0)
  for (const t of monthTxs) totals[(parseLocalDate(t.date).getDay() + 6) % 7] += t.amountMinor
  return totals
}

export interface CategoryChange {
  categoryId: number
  currentMinor: number
  previousMinor: number
  /** current - previous; positive means spending went up. */
  deltaMinor: number
}

/**
 * Per-category change against the previous month, biggest movers first. For the current month
 * both sides cover the same elapsed days, like compareToPrevious.
 */
export function categoryChanges(txs: Transaction[], key: MonthKey, today: Date): CategoryChange[] {
  const prevKey = shiftMonth(key, -1)
  const isCurrent = key === localDateString(today).slice(0, 7)
  const day = today.getDate()
  const dayOf = (t: Transaction) => Number(t.date.slice(8, 10))
  const current = inMonth(txs, key).filter((t) => !isCurrent || dayOf(t) <= day)
  const previous = inMonth(txs, prevKey).filter(
    (t) => !isCurrent || dayOf(t) <= Math.min(day, daysInMonth(prevKey)),
  )

  const totals = new Map<number, { current: number; previous: number }>()
  const bump = (list: Transaction[], side: 'current' | 'previous') => {
    for (const t of list) {
      const row = totals.get(t.categoryId) ?? { current: 0, previous: 0 }
      row[side] += t.amountMinor
      totals.set(t.categoryId, row)
    }
  }
  bump(current, 'current')
  bump(previous, 'previous')

  return [...totals]
    .map(([categoryId, v]) => ({
      categoryId,
      currentMinor: v.current,
      previousMinor: v.previous,
      deltaMinor: v.current - v.previous,
    }))
    .filter((c) => c.deltaMinor !== 0)
    .sort((a, b) => Math.abs(b.deltaMinor) - Math.abs(a.deltaMinor))
}
