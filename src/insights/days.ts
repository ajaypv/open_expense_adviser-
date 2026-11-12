import { parseLocalDate } from '../db/money'
import type { Transaction } from '../db/schema'
import { daysInMonth, monthOf, type MonthKey } from './aggregates'

/** A share of one day's spending; `categoryId` is null for the categories folded together as "everything else". */
export interface DaySlice {
  categoryId: number | null
  minor: number
}

export interface DayInfo {
  /** Day of the month, from 1. */
  day: number
  /** YYYY-MM-DD. */
  date: string
  minor: number
  /** What the day was made of, in the order of the legend, so every day stacks the same way. */
  slices: DaySlice[]
  /** That day's expenses, biggest first. */
  txs: Transaction[]
  /** Saturday or Sunday. */
  weekend: boolean
  /** A day that has not happened yet. */
  future: boolean
}

export interface DaysView {
  days: DayInfo[]
  /** Days that have happened: today's date for the month in progress, the whole month otherwise. */
  elapsed: number
  totalMinor: number
  /** Over the days that have happened. */
  averageMinor: number
  /** The biggest day (the latest, on a tie); null when nothing was spent. */
  peak: DayInfo | null
  /** Days that have happened with nothing spent. */
  quietDays: number
  /** Days in a row with nothing spent, counting back from the last day that has happened. */
  quietNow: number
  /** What a weekend day costs against a weekday; null without at least two of each, or if either was free. */
  weekendRatio: number | null
  /** The daily share of the budget; null with no budget. */
  limitMinor: number | null
  /** Days that have happened above that share. */
  overDays: number
  /** The biggest categories of the month, biggest first, then the rest folded together: the stack's colours. */
  legend: DaySlice[]
}

const LEGEND_SIZE = 5

/**
 * One entry per calendar day of the month with what was spent, what it was spent on and the expenses behind it, and
 * the facts worth saying about the pattern: the biggest day, quiet days, how weekends compare, and how the days sit
 * against the daily share of the budget. Only money sent should be passed in.
 */
export function dayView(monthTxs: Transaction[], month: MonthKey, lastDay: number | null, budgetMinor: number | null): DaysView {
  const n = daysInMonth(month)
  const elapsed = Math.min(lastDay ?? n, n)
  const [year, mon] = month.split('-').map(Number)

  const mine = monthTxs.filter((t) => monthOf(t.date) === month)
  const byCat = new Map<number, number>()
  for (const t of mine) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amountMinor)
  const ranked = [...byCat].sort((a, b) => b[1] - a[1] || a[0] - b[0])
  const top = ranked.slice(0, LEGEND_SIZE)
  const topIds = new Set(top.map(([id]) => id))
  const restMinor = ranked.slice(LEGEND_SIZE).reduce((a, [, m]) => a + m, 0)
  const legend: DaySlice[] = [...top.map(([categoryId, minor]) => ({ categoryId, minor })), ...(restMinor > 0 ? [{ categoryId: null, minor: restMinor }] : [])]

  const buckets: Transaction[][] = Array.from({ length: n }, () => [])
  for (const t of mine) buckets[parseLocalDate(t.date).getDate() - 1].push(t)

  const days = buckets.map((list, i): DayInfo => {
    const sorted = [...list].sort((a, b) => b.amountMinor - a.amountMinor || b.createdAt - a.createdAt)
    const bySlice = new Map<number | null, number>()
    for (const t of sorted) {
      const key = topIds.has(t.categoryId) ? t.categoryId : null
      bySlice.set(key, (bySlice.get(key) ?? 0) + t.amountMinor)
    }
    const slices = legend.filter((l) => bySlice.has(l.categoryId)).map((l) => ({ categoryId: l.categoryId, minor: bySlice.get(l.categoryId)! }))
    const dow = new Date(year, mon - 1, i + 1).getDay()
    const date = `${month}-${String(i + 1).padStart(2, '0')}`
    return { day: i + 1, date, minor: sorted.reduce((a, t) => a + t.amountMinor, 0), slices, txs: sorted, weekend: dow === 0 || dow === 6, future: i >= elapsed }
  })

  const past = days.slice(0, elapsed)
  const totalMinor = past.reduce((a, d) => a + d.minor, 0)
  const peak = past.reduce<DayInfo | null>((best, d) => (d.minor > 0 && (best === null || d.minor >= best.minor) ? d : best), null)

  let quietNow = 0
  for (let i = elapsed - 1; i >= 0 && past[i].minor === 0; i--) quietNow++

  const weekend = past.filter((d) => d.weekend)
  const weekday = past.filter((d) => !d.weekend)
  const perDay = (list: DayInfo[]) => list.reduce((a, d) => a + d.minor, 0) / Math.max(list.length, 1)
  const weekendRatio = weekend.length >= 2 && weekday.length >= 2 && perDay(weekend) > 0 && perDay(weekday) > 0 ? perDay(weekend) / perDay(weekday) : null

  const limitMinor = budgetMinor !== null && budgetMinor > 0 ? Math.round(budgetMinor / n) : null

  return {
    days,
    elapsed,
    totalMinor,
    averageMinor: Math.round(totalMinor / Math.max(elapsed, 1)),
    peak,
    quietDays: past.filter((d) => d.minor === 0).length,
    quietNow,
    weekendRatio,
    limitMinor,
    overDays: limitMinor === null ? 0 : past.filter((d) => d.minor > limitMinor).length,
    legend,
  }
}

/** How a day compares with the average day, in words: "Nothing spent", "40% above your average", "2.3× your average". */
export function versusAverage(minor: number, averageMinor: number): string {
  if (minor === 0) return 'Nothing spent'
  if (averageMinor <= 0) return ''
  const r = minor / averageMinor
  if (r >= 2) return `${Math.round(r * 10) / 10}× your average`
  if (r >= 1.1) return `${Math.round((r - 1) * 100)}% above your average`
  if (r >= 0.9) return 'About your average'
  return `${Math.round((1 - r) * 100)}% below your average`
}

export interface DayInsight {
  key: string
  text: string
  /** The day it is about, to show it on the chart when tapped. */
  day?: number
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "about 40% more than weekdays"; from three times up, "about 15× what weekdays do", since 1488% is hard to read. */
function timesMore(ratio: number, other: string): string {
  if (ratio < 3) return `about ${Math.round((ratio - 1) * 100)}% more than ${other}`
  const n = ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10
  return `about ${n}× what ${other} do`
}

/** What the pattern says, in short sentences; at most four, the ones tied to a day first. */
export function dayInsights(view: DaysView, money: (minor: number) => string, dayLabel: (date: string) => string): DayInsight[] {
  if (view.totalMinor <= 0) return []
  const out: DayInsight[] = []
  if (view.peak) out.push({ key: 'peak', text: `Biggest day: ${dayLabel(view.peak.date)}, ${money(view.peak.minor)}`, day: view.peak.day })

  if (view.limitMinor !== null) {
    out.push({
      key: 'budget',
      text: view.overDays > 0 ? `${plural(view.overDays, 'day', 'days')} above your daily budget of ${money(view.limitMinor)}` : `No day above your daily budget of ${money(view.limitMinor)}`,
    })
  }

  const r = view.weekendRatio
  if (r !== null && r >= 1.25) out.push({ key: 'weekend', text: `Weekend days cost you ${timesMore(r, 'weekdays')}` })
  else if (r !== null && r <= 0.8) out.push({ key: 'weekday', text: `Weekdays cost you ${timesMore(1 / r, 'weekend days')}` })

  if (view.quietNow >= 2) out.push({ key: 'quiet-now', text: `Nothing spent for the last ${view.quietNow} days` })
  else if (view.quietDays > 0) out.push({ key: 'quiet', text: `${plural(view.quietDays, 'day', 'days')} with nothing spent` })

  return out.slice(0, 4)
}
