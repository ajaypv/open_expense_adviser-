import { localDateString, parseLocalDate } from '../db/money'
import type { Recurring, Transaction } from '../db/schema'

type Frequency = Recurring['frequency']

/** The date one period after `date`. Monthly rules stay on `anchorDay`, clamped to short months. */
export function nextDueAfter(date: string, frequency: Frequency, anchorDay?: number): string {
  const d = parseLocalDate(date)
  if (frequency === 'weekly') return localDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))
  const day = anchorDay ?? d.getDate()
  const lastOfNext = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate()
  return localDateString(new Date(d.getFullYear(), d.getMonth() + 1, Math.min(day, lastOfNext)))
}

/** Rules that are switched on and due today or earlier, soonest first. */
export function dueRules(rules: Recurring[], today: string): Recurring[] {
  return rules.filter((r) => r.active && r.nextDue <= today).sort((a, b) => (a.nextDue < b.nextDue ? -1 : a.nextDue > b.nextDue ? 1 : a.id - b.id))
}

/**
 * Every date a rule has come due up to today, oldest first. If the app was not opened for a long
 * time this lists each missed one, capped so a stale rule can't flood the list.
 */
export function occurrencesDue(rule: Recurring, today: string, cap = 12): string[] {
  const dates: string[] = []
  const anchor = rule.anchorDay ?? parseLocalDate(rule.nextDue).getDate()
  let due = rule.nextDue
  while (due <= today && dates.length < cap) {
    dates.push(due)
    due = nextDueAfter(due, rule.frequency, anchor)
  }
  return dates
}

export function describeRule(rule: Pick<Recurring, 'frequency' | 'nextDue'>): string {
  if (rule.frequency === 'weekly') {
    const day = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(parseLocalDate(rule.nextDue))
    return `Every week on ${day}`
  }
  const n = parseLocalDate(rule.nextDue).getDate()
  const mod100 = n % 100
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `Every month on the ${n}${suffix}`
}

export interface DetectedRecurring {
  key: string
  kind: 'expense' | 'income'
  merchant: string
  amountMinor: number
  currency: string
  categoryId: number
  paymentMethod: string
  accountId?: number
  frequency: 'monthly'
  nextDue: string
  /** How many times it has happened. */
  count: number
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

/** Distance between two days of the month, treating the month as a ring so the 30th is near the 1st. */
const dayGap = (a: number, b: number) => Math.min(Math.abs(a - b), 30 - Math.abs(a - b))

const monthNumber = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))

/**
 * Looks through the history for things that happen every month, such as rent or a subscription:
 * the same merchant, in at least three months in a row, for about the same amount, on about the
 * same day, and still going. Anything already set up as a rule is left out.
 */
export function detectRecurring(txs: Transaction[], rules: Pick<Recurring, 'merchant' | 'kind'>[], today: string): DetectedRecurring[] {
  const have = new Set(rules.map((r) => `${r.kind}:${r.merchant.trim().toLowerCase()}`))
  const groups = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (t.kind === 'transfer' || t.deletedAt !== undefined) continue
    const name = t.merchant.trim().toLowerCase()
    if (!name) continue
    const key = `${t.kind}:${name}`
    if (have.has(key)) continue
    const g = groups.get(key)
    if (g) g.push(t)
    else groups.set(key, [t])
  }

  const found: DetectedRecurring[] = []
  for (const [key, items] of groups) {
    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const months = [...new Set(items.map((t) => monthNumber(t.date)))].sort((a, b) => a - b)
    if (months.length < 3) continue
    // The latest three months must run on from one another: it is still happening.
    const tail = months.slice(-3)
    if (tail[2] - tail[0] !== 2) continue

    const amounts = items.map((t) => t.amountMinor)
    const typical = median(amounts)
    if (amounts.some((a) => Math.abs(a - typical) > typical * 0.1)) continue

    const days = items.map((t) => Number(t.date.slice(8, 10)))
    const usual = median(days)
    if (days.some((d) => dayGap(d, usual) > 3)) continue

    const last = items[items.length - 1]
    // Gone quiet for six weeks: not recurring any more.
    const daysSince = (parseLocalDate(today).getTime() - parseLocalDate(last.date).getTime()) / 86_400_000
    if (daysSince > 45) continue

    found.push({
      key,
      kind: last.kind as 'expense' | 'income',
      merchant: last.merchant.trim(),
      amountMinor: typical,
      currency: last.currency,
      categoryId: last.categoryId,
      paymentMethod: last.paymentMethod,
      accountId: last.accountId,
      frequency: 'monthly',
      nextDue: nextDueAfter(last.date, 'monthly', usual),
      count: items.length,
    })
  }
  return found.sort((a, b) => b.amountMinor - a.amountMinor)
}
