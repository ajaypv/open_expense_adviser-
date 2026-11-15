import type { Category, Recurring, Transaction } from '../db/schema'
import { byCategory, byWeekday, sum, topMerchants, type CategoryTotal } from './aggregates'
import { billKindOf, splitBills, type BillSplit } from './billSplit'

/** A category's place in the year. */
export interface RankedCategory extends CategoryTotal {
  /** Of everything spent in the year (0 to 1). */
  share: number
}

/** Everything a year in review says, worked out from the money sent in that year. */
export interface YearStory {
  year: number
  totalMinor: number
  count: number
  /** Spent a day on average, over the days of the year so far (the whole year once it is over). */
  perDayMinor: number
  /** The biggest categories, biggest first (at most five). */
  categories: RankedCategory[]
  /** What went on mobile and DTH recharges and phone bills, with how many payments and how it works out a month; null when nothing did. */
  phone: { totalMinor: number; count: number; perMonthMinor: number; share: number } | null
  /** Spent in each month of the year, January first; 0 for a month with nothing. */
  months: number[]
  priciestMonth: { month: number; totalMinor: number } | null
  /** The month that cost least of those with any spending, when more than one month had some. */
  cheapestMonth: { month: number; totalMinor: number } | null
  /** The single biggest expense. */
  biggest: { merchant: string; categoryId: number; totalMinor: number; date: string } | null
  /** The place paid most often, when it was more than once. */
  favourite: { name: string; count: number; totalMinor: number } | null
  /** Spent on each weekday, Monday first. */
  weekdays: number[]
  /** The weekday spent most on (0 = Monday), with what went on it. */
  busiestWeekday: { weekday: number; totalMinor: number } | null
  /** Bills, recharges and EMIs together, and how they divide; null when none. */
  bills: BillSplit | null
  /** Money received in the year, when any was. */
  receivedMinor: number
}

/** The years that have any spending, newest first. */
export function yearsWithSpending(expenses: Transaction[]): number[] {
  return [...new Set(expenses.map((t) => Number(t.date.slice(0, 4))))].filter((y) => Number.isFinite(y)).sort((a, b) => b - a)
}

const DAY_MS = 86_400_000

/** An average to the nearest whole rupee (or dollar): a figure in a sentence reads better without the paise. */
const wholeUnits = (minor: number) => Math.round(minor / 100) * 100

/**
 * A year of spending as a story. `today` says how far the year has got, for the daily average. Null when nothing was spent in the year.
 * `expenses` are money sent only; `income` is what came in.
 */
export function yearStory(expenses: Transaction[], income: Transaction[], categoryById: Map<number, Category>, recurring: Recurring[], year: number, today: Date): YearStory | null {
  const prefix = `${year}-`
  const txs = expenses.filter((t) => t.date.startsWith(prefix))
  if (txs.length === 0) return null
  const totalMinor = sum(txs)

  const categories: RankedCategory[] = byCategory(txs)
    .slice(0, 5)
    .map((c) => ({ ...c, share: totalMinor > 0 ? c.totalMinor / totalMinor : 0 }))

  const months = new Array<number>(12).fill(0)
  for (const t of txs) months[Number(t.date.slice(5, 7)) - 1] += t.amountMinor
  const spent = months.map((totalMinor, month) => ({ month, totalMinor })).filter((m) => m.totalMinor > 0)
  const priciestMonth = spent.reduce((a, b) => (b.totalMinor > a.totalMinor ? b : a))
  const cheapestMonth = spent.length > 1 ? spent.reduce((a, b) => (b.totalMinor < a.totalMinor ? b : a)) : null

  const biggestTx = txs.reduce((a, b) => (b.amountMinor > a.amountMinor ? b : a))

  const places = topMerchants(txs, 200).sort((a, b) => b.count - a.count || b.totalMinor - a.totalMinor)
  const fav = places[0]

  const weekdays = byWeekday(txs)
  const peak = Math.max(...weekdays)

  const bills = splitBills(txs, categoryById, recurring)
  const recharge = bills?.parts.find((p) => p.kind === 'recharge')
  // Months that had a phone payment, so "a month" is what a month with one cost, not spread over a year that did not have it.
  const phoneMonths = new Set(txs.filter((t) => billKindOf(t, categoryById.get(t.categoryId)?.name) === 'recharge').map((t) => t.date.slice(0, 7))).size

  const startOfYear = new Date(year, 0, 1).getTime()
  const endOfYear = new Date(year + 1, 0, 1).getTime()
  const through = Math.min(Math.max(today.getTime(), startOfYear), endOfYear - 1)
  const daysSoFar = Math.max(1, Math.floor((through - startOfYear) / DAY_MS) + 1)

  return {
    year,
    totalMinor,
    count: txs.length,
    perDayMinor: wholeUnits(totalMinor / daysSoFar),
    categories,
    phone: recharge ? { totalMinor: recharge.totalMinor, count: recharge.count, perMonthMinor: wholeUnits(recharge.totalMinor / Math.max(1, phoneMonths)), share: recharge.shareOfMonth } : null,
    months,
    priciestMonth,
    cheapestMonth: cheapestMonth && cheapestMonth.month !== priciestMonth.month ? cheapestMonth : null,
    biggest: { merchant: biggestTx.merchant.trim(), categoryId: biggestTx.categoryId, totalMinor: biggestTx.amountMinor, date: biggestTx.date },
    favourite: fav && fav.count > 1 ? fav : null,
    weekdays,
    busiestWeekday: peak > 0 ? { weekday: weekdays.indexOf(peak), totalMinor: peak } : null,
    bills,
    receivedMinor: sum(income.filter((t) => t.date.startsWith(prefix) && t.kind === 'income')),
  }
}
