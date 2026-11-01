import { localDateString, parseLocalDate } from '../db/money'
import type { Transaction } from '../db/schema'
import { daysInMonth, inMonth, monthOf, shiftMonth, sum, type MonthKey } from './aggregates'

export interface RepeatingSpend {
  /** The name as it is most often written. */
  name: string
  /** How many times in the month in view. */
  count: number
  /** What those came to. */
  totalMinor: number
  /** The usual amount (the middle one, so an odd large purchase does not drag it up). */
  typicalMinor: number
  /** What share of the month's spending it is, as a whole percent. */
  sharePct: number
  /** How it falls: most days, about weekly, once a month, or just several times. */
  pattern: 'daily' | 'weekly' | 'monthly' | 'regular'
}

/** A habit is something bought at least this many times in the month. */
const HABIT_MIN = 3
/** A monthly bill shows up in at least this many of the last few months... */
const MONTHLY_MIN = 3
/** ...counting back this many, the month in view included. */
const WINDOW = 4
/** "Almost every day" means this share of the days so far (and at least four purchases). */
const DAILY_SHARE = 0.4
/** "About every week" means a gap of between these many days. */
const WEEKLY_GAP = [5, 10] as const

const key = (merchant: string) => merchant.trim().toLowerCase().replace(/\s+/g, ' ')
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

/** How the name is most often written ("BMTC bus fare" over "bmtc Bus Fare"); on a tie, the latest. */
function usualSpelling(items: Transaction[]): string {
  const seen = new Map<string, { n: number; last: string }>()
  for (const t of items) {
    const name = t.merchant.trim()
    const s = seen.get(name) ?? { n: 0, last: '' }
    seen.set(name, { n: s.n + 1, last: t.date > s.last ? t.date : s.last })
  }
  return [...seen].sort(([, a], [, b]) => b.n - a.n || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0))[0][0]
}

/**
 * What you keep paying for, in the month in view: names bought at least three times (the tea, the bus fare, the
 * lunch), and bills that come once a month (rent, a subscription), seen in at least three of the last four months.
 * Matched by name, ignoring case. The ones bought most often come first, then monthly bills.
 */
export function repeatingSpend(expenses: Transaction[], month: MonthKey, today: Date, limit = 5): RepeatingSpend[] {
  const window = new Set(Array.from({ length: WINDOW }, (_, i) => shiftMonth(month, -i)))
  const groups = new Map<string, Transaction[]>()
  for (const t of expenses) {
    if (t.kind !== 'expense' || t.deletedAt !== undefined || !window.has(monthOf(t.date))) continue
    const k = key(t.merchant)
    if (!k) continue
    const g = groups.get(k)
    if (g) g.push(t)
    else groups.set(k, [t])
  }

  const monthTotal = sum(inMonth(expenses.filter((t) => t.kind === 'expense' && t.deletedAt === undefined), month))
  const finished = month < localDateString(today).slice(0, 7)
  const elapsed = finished ? daysInMonth(month) : Math.min(today.getDate(), daysInMonth(month))

  const found: RepeatingSpend[] = []
  for (const items of groups.values()) {
    const here = items.filter((t) => monthOf(t.date) === month)
    if (here.length === 0) continue
    const monthsSeen = new Set(items.map((t) => monthOf(t.date))).size
    const habit = here.length >= HABIT_MIN
    const monthly = monthsSeen >= MONTHLY_MIN
    if (!habit && !monthly) continue

    const days = [...new Set(here.map((t) => t.date))].sort()
    let pattern: RepeatingSpend['pattern'] = 'regular'
    if (!habit) {
      pattern = 'monthly'
    } else if (here.length >= 4 && days.length / elapsed >= DAILY_SHARE) {
      pattern = 'daily'
    } else if (days.length >= HABIT_MIN) {
      const gap = (parseLocalDate(days[days.length - 1]).getTime() - parseLocalDate(days[0]).getTime()) / 86_400_000 / (days.length - 1)
      if (gap >= WEEKLY_GAP[0] && gap <= WEEKLY_GAP[1]) pattern = 'weekly'
    }

    const totalMinor = sum(here)
    found.push({
      name: usualSpelling(here),
      count: here.length,
      totalMinor,
      typicalMinor: median(here.map((t) => t.amountMinor)),
      sharePct: monthTotal > 0 ? Math.round((totalMinor / monthTotal) * 100) : 0,
      pattern,
    })
  }
  return found.sort((a, b) => b.count - a.count || b.totalMinor - a.totalMinor).slice(0, limit)
}
