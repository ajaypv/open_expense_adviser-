import { localDateString, parseLocalDate } from '../db/money'
import type { Transaction } from '../db/schema'
import { oldestFirst } from './order'

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

// Building an Intl formatter is slow, so make it once and only when first needed.
let shortDate: Intl.DateTimeFormat | undefined

function daysAgo(date: string, now: Date): string {
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - parseLocalDate(date).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 31) return `${days} days ago`
  shortDate ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
  return shortDate.format(parseLocalDate(date))
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

export interface Here {
  lat: number
  lon: number
}

/** Within this many metres counts as "the same place". Position fixes are rounded to about 11 m. */
export const NEARBY_METERS = 150

/** Straight-line distance between two points on the earth, in metres (haversine). */
export function distanceMeters(a: Here, b: Here): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Regular transactions, ranked by how well they fit right now. A merchant needs at least two
 * entries to count as regular. Frequency sets the base score; matching today's weekday, the
 * current part of the day (from when entries were logged) or a monthly date adds to it.
 * Merchants logged only once come after the regulars, newest first, so the list is never empty
 * once there is any history. Anything already logged today goes last. When `here` is given,
 * merchants you have paid at this spot before rank higher. Transfers and amounts recorded in
 * another currency are left out: neither makes a sensible one-tap fill.
 */
export function suggest(txs: Transaction[], now: Date, limit = 4, kind?: Transaction['kind'], here?: Here): Suggestion[] {
  const today = localDateString(now)
  const weekday = now.getDay()
  const dayOfMonth = now.getDate()
  const part = partOfDay(now.getHours())

  // Group first and sort each (small) group, rather than sorting every transaction up front.
  const groups = new Map<string, Transaction[]>()
  for (const t of txs) {
    const name = t.merchant.trim().toLowerCase()
    if (!name || t.kind === 'transfer' || (kind && t.kind !== kind)) continue
    if ((t as { originalCurrency?: string }).originalCurrency) continue
    const key = `${t.kind}:${name}`
    const group = groups.get(key)
    if (group) group.push(t)
    else groups.set(key, [t])
  }

  // Weekday of a date string, cached: a few hundred distinct dates cover thousands of transactions.
  const weekdayOf = new Map<string, number>()
  const weekdayFor = (date: string) => {
    let w = weekdayOf.get(date)
    if (w === undefined) weekdayOf.set(date, (w = parseLocalDate(date).getDay()))
    return w
  }

  type Ranked = Suggestion & { score: number; last: string; fixedReason: string | null }
  const out: Ranked[] = []
  for (const [key, items] of groups) {
    items.sort(oldestFirst)
    const n = items.length

    // One pass over the group for every signal. Weekday and time of day only count from three
    // entries up, so smaller groups skip those lookups.
    const timing = n >= 3
    let loggedToday = false
    let onWeekday = 0
    let inPart = 0
    let nearDay = 0
    let nearHere = 0
    const days: number[] = []
    const monthSet = new Set<string>()
    for (const t of items) {
      const day = Number(t.date.slice(8, 10))
      days.push(day)
      monthSet.add(t.date.slice(0, 7))
      if (t.date === today) loggedToday = true
      if (timing) {
        if (weekdayFor(t.date) === weekday) onWeekday++
        if (partOfDay(new Date(t.createdAt).getHours()) === part) inPart++
      }
      if (dayGap(day, dayOfMonth) <= 2) nearDay++
      if (here && t.location && distanceMeters(here, t.location) <= NEARBY_METERS) nearHere++
    }
    const weekdayShare = onWeekday / n
    const partShare = inPart / n
    const monthlyShare = nearDay / n
    const months = monthSet.size
    const usualDay = median(days)

    // Each timing signal only counts when it is consistent enough to mean something.
    const hints: { score: number; reason: string }[] = []
    if (months >= 2 && monthlyShare >= 0.6 && dayGap(usualDay, dayOfMonth) <= 2) {
      hints.push({ score: 3, reason: `Usually around the ${ordinal(usualDay)}` })
    }
    if (n >= 3 && weekdayShare >= 0.5) hints.push({ score: 2 * weekdayShare, reason: `Usually on ${WEEKDAYS[weekday]}` })
    if (n >= 3 && partShare >= 0.6) hints.push({ score: 1.5 * partShare, reason: `Usually in the ${part}` })
    // Being where you have paid before is the strongest hint of all.
    if (nearHere > 0 && nearHere / n >= 0.4) hints.push({ score: 4 * (nearHere / n) + 1, reason: 'You often pay here' })
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
      reason: '',
      fixedReason: loggedToday ? 'Added earlier today' : (hints[0]?.reason ?? null),
      count: n,
      score: Math.log2(n) * 0.5 + hints.reduce((sum, h) => sum + h.score, 0) - (loggedToday ? 10 : 0),
      last: last.date,
    })
  }

  return out
    .sort((a, b) => b.score - a.score || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0))
    .slice(0, limit)
    // Wording is only worked out for the few suggestions that are actually shown.
    .map(({ score: _score, last, fixedReason, ...s }) => ({
      ...s,
      reason: fixedReason ?? (s.count > 1 ? `Logged ${s.count} times` : `Last added ${daysAgo(last, now)}`),
    }))
}
