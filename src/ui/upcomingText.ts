import { formatMoney, parseLocalDate } from '../db/money'
import type { Forecast, UpcomingPayment } from '../insights/upcoming'

let dayFormat: Intl.DateTimeFormat | undefined
let dayYearFormat: Intl.DateTimeFormat | undefined

/** "5 Nov", or "5 Nov 2027" for a day in another year. */
export function shortDay(key: string, today: Date): string {
  const d = parseLocalDate(key)
  return d.getFullYear() === today.getFullYear()
    ? (dayFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(d)
    : (dayYearFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })).format(d)
}

/** What a payment is called in lists: its name, or what it is filed under, or what it is. */
export function paymentName(p: UpcomingPayment, categoryName: string | undefined): string {
  return p.rule.merchant || categoryName || (p.kind === 'income' ? 'Income' : 'Payment')
}

/** "₹12,500", or "+₹80,000" for money coming in. */
export function signedAmount(p: UpcomingPayment, currency: string): string {
  return `${p.kind === 'income' ? '+' : ''}${formatMoney(p.amountMinor, currency)}`
}

/** "short by ₹11,999 from 5 Nov", or null when the balance never goes below zero. */
export function shortfallPhrase(f: Forecast, currency: string, today: Date): string | null {
  if (f.shortfallMinor <= 0 || f.firstShortDate === null) return null
  return `short by ${formatMoney(f.shortfallMinor, currency)} from ${shortDay(f.firstShortDate, today)}`
}
