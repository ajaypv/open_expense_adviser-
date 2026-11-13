import { localDateString, parseLocalDate } from '../db/money'
import type { Transaction } from '../db/schema'

/** What one category took on one day. */
export interface DayPart {
  categoryId: number
  minor: number
  count: number
}

export interface TimelineDay {
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  /** Zero today, one yesterday. */
  daysAgo: number
  totalMinor: number
  count: number
  /** By category, biggest first. */
  parts: DayPart[]
  /** The expenses themselves, the latest added first. */
  txs: Transaction[]
  /** Money received on the day, and what it was, the latest added first. */
  receivedMinor: number
  received: Transaction[]
}

export interface Timeline {
  /** Every calendar day from today back, newest first, the quiet ones too. */
  days: TimelineDay[]
  /** The biggest single day shown, to scale the bars against. */
  maxMinor: number
  /** There are expenses from before the earliest day shown. */
  earlier: boolean
}

const DAY_MS = 86_400_000

/** Whole days from one date to another, counted on the calendar so a clock change does not shift it. */
export function daysBetween(from: string, to: string): number {
  const a = parseLocalDate(from)
  const b = parseLocalDate(to)
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS)
}

const keyDaysAgo = (today: Date, n: number) => localDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n))

function partsOf(txs: Transaction[]): DayPart[] {
  const by = new Map<number, DayPart>()
  for (const t of txs) {
    const p = by.get(t.categoryId) ?? { categoryId: t.categoryId, minor: 0, count: 0 }
    p.minor += t.amountMinor
    p.count += 1
    by.set(t.categoryId, p)
  }
  return [...by.values()].sort((a, b) => b.minor - a.minor || a.categoryId - b.categoryId)
}

const sumOf = (txs: Transaction[]) => txs.reduce((a, t) => a + t.amountMinor, 0)

/**
 * The days behind us, for the Timeline: what was spent on each, and on what, and what was received. The bars and the scale are of money
 * sent only; money received is told on its day. Nothing dated after today counts. `span` is how many days back to go; it stops sooner at
 * the first day anything was spent or received.
 */
export function buildTimeline(expenses: Transaction[], today: Date, span: number, received: Transaction[] = []): Timeline {
  const todayKey = localDateString(today)
  const byDate = new Map<string, Transaction[]>()
  let first: string | null = null
  for (const t of expenses) {
    if (t.kind !== 'expense' || t.deletedAt !== undefined || t.date > todayKey) continue
    const list = byDate.get(t.date)
    if (list) list.push(t)
    else byDate.set(t.date, [t])
    if (first === null || t.date < first) first = t.date
  }

  const inByDate = new Map<string, Transaction[]>()
  for (const t of received) {
    if (t.kind !== 'income' || t.deletedAt !== undefined || t.date > todayKey) continue
    const list = inByDate.get(t.date)
    if (list) list.push(t)
    else inByDate.set(t.date, [t])
    if (first === null || t.date < first) first = t.date
  }

  const available = first === null ? 0 : daysBetween(first, todayKey) + 1
  const count = Math.min(span, available)
  const days: TimelineDay[] = []
  for (let n = 0; n < count; n++) {
    const date = keyDaysAgo(today, n)
    const txs = [...(byDate.get(date) ?? [])].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
    const incoming = [...(inByDate.get(date) ?? [])].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
    days.push({ date, daysAgo: n, totalMinor: sumOf(txs), count: txs.length, parts: partsOf(txs), txs, receivedMinor: sumOf(incoming), received: incoming })
  }

  return {
    days,
    maxMinor: days.reduce((a, d) => Math.max(a, d.totalMinor), 0),
    earlier: available > count,
  }
}

export type TimelineRow =
  | { kind: 'month'; key: string; month: string }
  | { kind: 'day'; key: string; day: TimelineDay }
  /** A run of days with nothing spent, folded into one line. */
  | { kind: 'quiet'; key: string; from: string; to: string; count: number }

/**
 * The days as the rows the Timeline draws: a heading where a new month starts, a row for each day something was spent or received
 * (and for today, either or not), and one line for each run of quiet days, so a quiet fortnight does not take a screen.
 */
export function timelineRows(days: TimelineDay[]): TimelineRow[] {
  const rows: TimelineRow[] = []
  let month = ''
  let i = 0
  while (i < days.length) {
    const d = days[i]
    if (d.date.slice(0, 7) !== month) {
      month = d.date.slice(0, 7)
      rows.push({ kind: 'month', key: `m-${month}`, month })
    }
    if (d.totalMinor > 0 || d.receivedMinor > 0 || d.daysAgo === 0) {
      rows.push({ kind: 'day', key: d.date, day: d })
      i++
      continue
    }
    // A quiet run goes on to the next day that has something, or the end of the month.
    let j = i
    while (j + 1 < days.length && days[j + 1].totalMinor === 0 && days[j + 1].receivedMinor === 0 && days[j + 1].date.slice(0, 7) === month) j++
    rows.push({ kind: 'quiet', key: `q-${d.date}`, from: days[j].date, to: d.date, count: j - i + 1 })
    i = j + 1
  }
  return rows
}
