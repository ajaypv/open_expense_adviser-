import { localDateString, parseLocalDate } from '../db/money'
import type { Transaction } from '../db/schema'

export interface Suggestion {
  key: string
  kind: Transaction['kind']
  merchant: string
  /** The amount this merchant is most often logged at. */
  amountMinor: number
  categoryId: number
  paymentMethod: string
  /** Why it is suggested now, in plain words ("Usually on Mondays"). */
  reason: string
  count: number
}

const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

type Part = 'morning' | 'afternoon' | 'evening' | 'night'
const partOfDay = (hour: number): Part =>
  hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 21 ? 'evening' : 'night'

const ordinal = (n: number) => {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

/** The most common value; on a tie the one seen most recently (items are oldest first). */
function mostCommon<T>(items: T[]): T {
  const counts = new Map<T, number>()
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1)
  let best = items[items.length - 1]
  for (const [item, count] of counts) if (count > counts.get(best)!) best = item
  return best
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

/** Distance between two days of the month, treating the month as a ring so the 30th is near the 1st. */
const dayGap = (a: number, b: number) => {
  const gap = Math.abs(a - b)
  return Math.min(gap, 30 - gap)
}

/**
 * Regular transactions, ranked by how well they fit right now. A merchant needs at least two
 * entries to count as regular. Frequency sets the base score; matching today's weekday, the
 * current part of the day (from when entries were logged) or a monthly date adds to it.
 * Anything already logged today is left out.
 */
export function suggest(txs: Transaction[], now: Date, limit = 4, kind?: Transaction['kind']): Suggestion[] {
  const today = localDateString(now)
  const weekday = now.getDay()
  const dayOfMonth = now.getDate()
  const part = partOfDay(now.getHours())

  const groups = new Map<string, Transaction[]>()
  for (const t of [...txs].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)) {
    const name = t.merchant.trim().toLowerCase()
    if (!name || (kind && t.kind !== kind)) continue
    const key = `${t.kind}:${name}`
    groups.set(key, [...(groups.get(key) ?? []), t])
  }

  const out: (Suggestion & { score: number; last: string })[] = []
  for (const [key, items] of groups) {
    const n = items.length
    if (n < 2 || items.some((t) => t.date === today)) continue

    const share = (match: (t: Transaction) => boolean) => items.filter(match).length / n
    const weekdayShare = share((t) => parseLocalDate(t.date).getDay() === weekday)
    const partShare = share((t) => partOfDay(new Date(t.createdAt).getHours()) === part)
    const days = items.map((t) => Number(t.date.slice(8, 10)))
    const months = new Set(items.map((t) => t.date.slice(0, 7))).size
    const usualDay = median(days)
    const monthlyShare = share((t) => dayGap(Number(t.date.slice(8, 10)), dayOfMonth) <= 2)

    // Each timing signal only counts when it is consistent enough to mean something.
    const hints: { score: number; reason: string }[] = []
    if (months >= 2 && monthlyShare >= 0.6 && dayGap(usualDay, dayOfMonth) <= 2) {
      hints.push({ score: 3, reason: `Usually around the ${ordinal(usualDay)}` })
    }
    if (n >= 3 && weekdayShare >= 0.5) hints.push({ score: 2 * weekdayShare, reason: `Usually on ${WEEKDAYS[weekday]}` })
    if (n >= 3 && partShare >= 0.6) hints.push({ score: 1.5 * partShare, reason: `Usually in the ${part}` })
    hints.sort((a, b) => b.score - a.score)

    const last = items[n - 1]
    const methods = items.map((t) => t.paymentMethod).filter(Boolean)
    out.push({
      key,
      kind: last.kind,
      merchant: last.merchant.trim(),
      amountMinor: mostCommon(items.map((t) => t.amountMinor)),
      categoryId: mostCommon(items.map((t) => t.categoryId)),
      paymentMethod: methods.length ? mostCommon(methods) : '',
      reason: hints[0]?.reason ?? `Logged ${n} times`,
      count: n,
      score: Math.log2(n) * 0.5 + hints.reduce((sum, h) => sum + h.score, 0),
      last: last.date,
    })
  }

  return out
    .sort((a, b) => b.score - a.score || b.last.localeCompare(a.last))
    .slice(0, limit)
    .map(({ score: _score, last: _last, ...s }) => s)
}
