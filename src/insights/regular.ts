import type { Recurring, RecurringTag } from '../db/schema'
import { amountInMain, restOfMonth, TAG_LABELS, tagOf, upcomingPayments, type UpcomingPayment } from './upcoming'

export interface RegularPayments {
  /** What the payments going out come to in an average month. A weekly one counts 52 weeks over 12 months. */
  monthlyMinor: number
  /** ...and in a year, worked out from the exact amounts. */
  yearlyMinor: number
  /** What the regular money coming in comes to in an average month. */
  incomeMonthlyMinor: number
  /** Going out, by kind of payment, biggest first. */
  byType: { tag: RecurringTag; label: string; monthlyMinor: number; count: number }[]
  /** Still to leave this month, late ones included. */
  leftThisMonth: { outMinor: number; count: number }
  /** What leaves and what arrives in the next 30 days. `count` is the payments going out. */
  next30: { outMinor: number; inMinor: number; count: number }
  /** How many payments going out are already late. */
  overdue: number
  /** The next payment to go out; a late one comes first. */
  next: UpcomingPayment | null
  /** The next five payments, in or out, in order of date. */
  upcoming: UpcomingPayment[]
  /** Currencies with no exchange rate, whose amounts are counted at face value. */
  unconverted: string[]
}

const WEEKS_PER_YEAR = 52

/**
 * What the regular payments add up to, and what is coming: a month and a year of them, what is left this month,
 * the next 30 days, and what is due next. Built from the payments that are set up and switched on, the same
 * ones the Upcoming list uses, so the two always agree. Null when no payment going out is set up.
 */
export function regularPayments(
  rules: Recurring[],
  todayKey: string,
  money: { currency: string; rates: Record<string, number> },
): RegularPayments | null {
  const active = rules.filter((r) => r.active)
  const spending = active.filter((r) => r.kind === 'expense')
  if (spending.length === 0) return null

  // A year of each rule, exactly: twelve of a monthly one, fifty-two of a weekly one.
  const perYear = (r: Recurring) => amountInMain(r, money).amountMinor * (r.frequency === 'weekly' ? WEEKS_PER_YEAR : 12)
  const spendingYear = spending.reduce((sum, r) => sum + perYear(r), 0)
  const incomeYear = active.filter((r) => r.kind === 'income').reduce((sum, r) => sum + perYear(r), 0)

  const byTag = new Map<RecurringTag, { year: number; count: number }>()
  for (const r of spending) {
    const tag = tagOf(r)
    const cur = byTag.get(tag) ?? { year: 0, count: 0 }
    byTag.set(tag, { year: cur.year + perYear(r), count: cur.count + 1 })
  }

  const within30 = upcomingPayments(rules, todayKey, 30, money)
  const goingOut = (items: UpcomingPayment[]) => items.filter((p) => p.kind === 'expense')
  const sum = (items: UpcomingPayment[]) => items.reduce((s, p) => s + p.amountMinor, 0)
  const left = goingOut(restOfMonth(upcomingPayments(rules, todayKey, 62, money), todayKey))
  const out30 = goingOut(within30)

  return {
    monthlyMinor: Math.round(spendingYear / 12),
    yearlyMinor: spendingYear,
    incomeMonthlyMinor: Math.round(incomeYear / 12),
    byType: [...byTag]
      .map(([tag, v]) => ({ tag, label: TAG_LABELS[tag], monthlyMinor: Math.round(v.year / 12), count: v.count }))
      .sort((a, b) => b.monthlyMinor - a.monthlyMinor),
    leftThisMonth: { outMinor: sum(left), count: left.length },
    next30: { outMinor: sum(out30), inMinor: sum(within30.filter((p) => p.kind === 'income')), count: out30.length },
    overdue: out30.filter((p) => p.overdue).length,
    next: out30[0] ?? null,
    upcoming: within30.slice(0, 5),
    unconverted: [...new Set(spending.map((r) => ({ r, c: amountInMain(r, money) })).filter((x) => x.c.unconverted).map((x) => x.r.currency))],
  }
}
