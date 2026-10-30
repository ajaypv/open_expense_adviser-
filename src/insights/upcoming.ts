import { localDateString, parseLocalDate } from '../db/money'
import type { Account, Recurring, RecurringTag } from '../db/schema'
import { defaultAccountId } from './accounts'
import { nextDueAfter } from './recurring'

/** The kinds of regular payment a person sets up, in the words they use for them. */
export const TAG_LABELS: Record<RecurringTag, string> = {
  loan: 'Loan EMI',
  autopay: 'UPI AutoPay',
  subscription: 'Subscription',
  bill: 'Bill',
  income: 'Salary or income',
  other: 'Other',
}

export const TAGS = Object.keys(TAG_LABELS) as RecurringTag[]

/** What to call a payment made before types existed, or without one. */
export const tagOf = (rule: Pick<Recurring, 'kind' | 'tag'>): RecurringTag => rule.tag ?? (rule.kind === 'income' ? 'income' : 'other')

export interface UpcomingPayment {
  /** Unique for this payment on this date, for lists. */
  key: string
  rule: Recurring
  /** The day it is due (YYYY-MM-DD). */
  date: string
  /** Days from today: zero today, negative once it is late. */
  daysLeft: number
  /** In the main currency, always positive; `kind` says which way the money goes. */
  amountMinor: number
  kind: 'expense' | 'income'
  /** No exchange rate is set for its currency, so the amount is counted at face value. */
  unconverted: boolean
  /** Late and not yet added: it still has to leave the account. */
  overdue: boolean
}

const DAY_MS = 86_400_000
/** Same cap as the Due card: a long-forgotten payment does not flood the list. */
const MAX_OVERDUE = 12

const daysBetween = (fromKey: string, toKey: string) => Math.round((parseLocalDate(toKey).getTime() - parseLocalDate(fromKey).getTime()) / DAY_MS)

const addDays = (key: string, days: number) => {
  const d = parseLocalDate(key)
  return localDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days))
}

const validRate = (r: unknown): r is number => typeof r === 'number' && Number.isFinite(r) && r > 0

/**
 * Everything that will be paid or received in the next `horizonDays`, with how many days away each one is.
 * A weekly payment appears every week and a monthly one every month, on the day it was set for (a payment on
 * the 31st moves to the 30th or 28th only in the months that are shorter). Payments that are switched off are
 * left out. Ones already late come first, because they have not been added yet.
 */
export function upcomingPayments(
  rules: Recurring[],
  todayKey: string,
  horizonDays: number,
  money: { currency: string; rates: Record<string, number> },
): UpcomingPayment[] {
  const last = addDays(todayKey, horizonDays)
  const out: UpcomingPayment[] = []

  for (const rule of rules) {
    if (!rule.active) continue
    const anchor = rule.anchorDay ?? parseLocalDate(rule.nextDue).getDate()
    const code = rule.currency || money.currency
    const rate = money.rates[code]
    const sameCurrency = code === money.currency
    const unconverted = !sameCurrency && !validRate(rate)
    const amountMinor = sameCurrency || unconverted ? rule.amountMinor : Math.round(rule.amountMinor * rate)

    let date = rule.nextDue
    let lateShown = 0
    for (let guard = 0; date <= last && guard < 1000; guard++) {
      const overdue = date < todayKey
      if (!overdue || lateShown < MAX_OVERDUE) {
        if (overdue) lateShown++
        out.push({ key: `${rule.id}-${date}`, rule, date, daysLeft: daysBetween(todayKey, date), amountMinor, kind: rule.kind, unconverted, overdue })
      }
      date = nextDueAfter(date, rule.frequency, anchor)
    }
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.rule.id - b.rule.id))
}

export interface Totals {
  outMinor: number
  inMinor: number
  count: number
}

/** What goes out and what comes in across these payments. */
export function totalsOf(items: UpcomingPayment[]): Totals {
  let outMinor = 0
  let inMinor = 0
  for (const p of items) {
    if (p.kind === 'income') inMinor += p.amountMinor
    else outMinor += p.amountMinor
  }
  return { outMinor, inMinor, count: items.length }
}

/** What is still to happen this month: the days left of it, and anything late that has not been added. */
export function restOfMonth(items: UpcomingPayment[], todayKey: string): UpcomingPayment[] {
  const month = todayKey.slice(0, 7)
  return items.filter((p) => p.overdue || p.date.slice(0, 7) === month)
}

export interface Forecast {
  startMinor: number
  /** The balance after the last payment. */
  endMinor: number
  /** The lowest the balance gets, and the day it gets there (null when it never goes below where it started). */
  lowestMinor: number
  lowestDate: string | null
  /** How far below zero it goes at the worst: the amount to add so nothing bounces. 0 when it is enough. */
  shortfallMinor: number
  /** The first day it goes below zero. */
  firstShortDate: string | null
}

/**
 * Walks the balance forward through the payments. On a day with both, what goes out is counted before what comes
 * in, so a warning is never missed because money was assumed to arrive first. Late payments count from today.
 */
export function forecast(startMinor: number, items: UpcomingPayment[], todayKey: string): Forecast {
  const events = items
    .map((p) => ({ date: p.date < todayKey ? todayKey : p.date, delta: p.kind === 'income' ? p.amountMinor : -p.amountMinor }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.delta - b.delta))

  let balance = startMinor
  let lowest = startMinor
  let lowestDate: string | null = null
  let firstShortDate: string | null = null
  for (const e of events) {
    balance += e.delta
    if (balance < lowest) {
      lowest = balance
      lowestDate = e.date
    }
    if (balance < 0 && firstShortDate === null) firstShortDate = e.date
  }
  return { startMinor, endMinor: balance, lowestMinor: lowest, lowestDate, shortfallMinor: Math.max(0, -lowest), firstShortDate }
}

export interface AccountForecast {
  accountId: number
  name: string
  items: UpcomingPayment[]
  forecast: Forecast
}

/**
 * Each account against the payments scheduled to leave from it (a payment with no account uses the first one),
 * since a loan comes out of one bank account, not out of the total. Accounts with nothing scheduled are left out.
 */
export function forecastByAccount(
  items: UpcomingPayment[],
  accounts: Account[],
  balances: Map<number, { estimatedMinor: number }>,
  todayKey: string,
): AccountForecast[] {
  const fallback = defaultAccountId(accounts)
  const groups = new Map<number, UpcomingPayment[]>()
  for (const p of items) {
    const id = p.rule.accountId ?? fallback
    if (id === undefined) continue
    groups.set(id, [...(groups.get(id) ?? []), p])
  }
  return accounts
    .filter((a) => groups.has(a.id))
    .sort((a, b) => a.id - b.id)
    .map((a) => ({ accountId: a.id, name: a.name, items: groups.get(a.id)!, forecast: forecast(balances.get(a.id)?.estimatedMinor ?? 0, groups.get(a.id)!, todayKey) }))
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "Today", "Tomorrow", "In 6 days", "Overdue by 2 days". */
export function describeWhen(daysLeft: number): string {
  if (daysLeft < 0) return `Overdue by ${plural(-daysLeft, 'day')}`
  if (daysLeft === 0) return 'Today'
  if (daysLeft === 1) return 'Tomorrow'
  return `In ${daysLeft} days`
}
