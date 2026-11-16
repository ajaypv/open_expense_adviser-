import { localDateString, parseLocalDate } from '../db/money'
import type { Transaction } from '../db/schema'

/** One day of the seven. */
export interface WeekDay {
  /** YYYY-MM-DD. */
  date: string
  minor: number
  count: number
  /** The day the week ends on, when that is today. */
  today: boolean
}

export interface WeekView {
  /** Seven days, the oldest first, the last of them `to`. */
  days: WeekDay[]
  from: string
  to: string
  totalMinor: number
  /** Over seven days, whatever has happened (a week is always seven days long), to a whole unit of the currency. */
  averageMinor: number
  /** The biggest day (the latest on a tie); null when nothing was spent. */
  peak: WeekDay | null
  /** The seven days before these. */
  previousMinor: number
  /** Against those, as a whole percent; null when there was nothing to compare with. */
  deltaPct: number | null
}

const addDays = (date: string, n: number) => {
  const d = parseLocalDate(date)
  return localDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n))
}

/** The date a week of the given month ends on: today for the month in progress, otherwise the last day of that month. */
export function weekEndFor(month: string, today: Date): string {
  const [y, m] = month.split('-').map(Number)
  const todayKey = localDateString(today)
  if (todayKey.slice(0, 7) === month) return todayKey
  return localDateString(new Date(y, m, 0))
}

/**
 * Seven days of money sent ending on `to`, day by day, with what they came to, how that compares with the seven days before, and the
 * day that stood out. Only money sent should be passed in.
 */
export function weekView(expenses: Transaction[], to: string, today: Date = new Date()): WeekView {
  const from = addDays(to, -6)
  const prevFrom = addDays(from, -7)
  const prevTo = addDays(from, -1)
  const byDay = new Map<string, { minor: number; count: number }>()
  let previousMinor = 0
  for (const t of expenses) {
    if (t.date >= from && t.date <= to) {
      const cur = byDay.get(t.date) ?? { minor: 0, count: 0 }
      cur.minor += t.amountMinor
      cur.count += 1
      byDay.set(t.date, cur)
    } else if (t.date >= prevFrom && t.date <= prevTo) {
      previousMinor += t.amountMinor
    }
  }
  const todayKey = localDateString(today)
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(from, i)
    const got = byDay.get(date)
    return { date, minor: got?.minor ?? 0, count: got?.count ?? 0, today: date === todayKey }
  })
  const totalMinor = days.reduce((a, d) => a + d.minor, 0)
  let peak: WeekDay | null = null
  for (const d of days) if (d.minor > 0 && (peak === null || d.minor >= peak.minor)) peak = d
  return {
    days,
    from,
    to,
    totalMinor,
    averageMinor: Math.round(totalMinor / 7 / 100) * 100,
    peak,
    previousMinor,
    deltaPct: previousMinor > 0 ? Math.round(((totalMinor - previousMinor) / previousMinor) * 100) : null,
  }
}

/** Moves a week's end by whole weeks; negative goes back. */
export const shiftWeek = (to: string, weeks: number) => addDays(to, weeks * 7)
