import { localDateString, parseLocalDate } from '../db/money'
import type { Transaction } from '../db/schema'
import { daysInMonth, monthLabel, shiftMonth, type MonthKey } from './aggregates'

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

/** The first and last day of a month. */
export function monthRange(key: MonthKey): { from: string; to: string } {
  return { from: `${key}-01`, to: `${key}-${String(daysInMonth(key)).padStart(2, '0')}` }
}

/** The quick choices for when: any time, this month, last month, and the last 30 days. */
export type DatePreset = 'any' | 'this-month' | 'last-month' | 'last-30'

export function presetRange(preset: DatePreset, today: Date): { from: string; to: string } {
  const todayKey = localDateString(today)
  switch (preset) {
    case 'any':
      return { from: '', to: '' }
    case 'this-month':
      return monthRange(todayKey.slice(0, 7))
    case 'last-month':
      return monthRange(shiftMonth(todayKey.slice(0, 7), -1))
    case 'last-30':
      return { from: localDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)), to: todayKey }
  }
}

const PRESETS: DatePreset[] = ['any', 'this-month', 'last-month', 'last-30']

/** Which quick choice the dates in force match, or null for a range of the person's own. */
export function presetOf(f: Pick<ActivityFilters, 'from' | 'to'>, today: Date): DatePreset | null {
  return PRESETS.find((p) => {
    const r = presetRange(p, today)
    return r.from === f.from && r.to === f.to
  }) ?? null
}

let dayFormat: Intl.DateTimeFormat | undefined
let dayYearFormat: Intl.DateTimeFormat | undefined

/** "October 2026" for a whole month, otherwise the dates themselves ("5 Oct to 12 Oct", "From 5 Oct"). */
export function describeRange(from: string, to: string, today: Date): string {
  if (from && to) {
    const todayKey = localDateString(today)
    const dayBefore = (key: string, n: number) => {
      const d = parseLocalDate(key)
      return localDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n))
    }
    if (from === to && to === todayKey) return 'Today'
    if (from === to && to === dayBefore(todayKey, 1)) return 'Yesterday'
    if (to === todayKey && from === dayBefore(todayKey, 6)) return 'Last 7 days'
    const key = from.slice(0, 7)
    const whole = monthRange(key)
    if (whole.from === from && whole.to === to) return monthLabel(key)
  }
  const show = (d: string) => {
    const date = parseLocalDate(d)
    return date.getFullYear() === today.getFullYear()
      ? (dayFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(date)
      : (dayYearFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })).format(date)
  }
  if (from && to) return from === to ? show(from) : `${show(from)} to ${show(to)}`
  return from ? `From ${show(from)}` : `Until ${show(to)}`
}

/** A search matches when every word typed is somewhere in the text, in any order. */
export function matchesSearch(text: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return words.every((w) => text.includes(w))
}

export interface DayTotal {
  spentMinor: number
  receivedMinor: number
}

/** What each day came to, spent and received apart; transfers are neither. Counts every row it is given. */
export function dayTotals(rows: Transaction[]): Map<string, DayTotal> {
  const totals = new Map<string, DayTotal>()
  for (const t of rows) {
    const day = totals.get(t.date) ?? { spentMinor: 0, receivedMinor: 0 }
    if (t.kind === 'expense') day.spentMinor += t.amountMinor
    else if (t.kind === 'income') day.receivedMinor += t.amountMinor
    totals.set(t.date, day)
  }
  return totals
}
