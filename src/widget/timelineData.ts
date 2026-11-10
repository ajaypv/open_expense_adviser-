import { parseLocalDate } from '../db/money'
import type { Transaction } from '../db/schema'
import { buildTimeline } from '../insights/timeline'

/** One day of the Timeline widget, as the text and the figures to put in its row. */
export interface TimelineWidgetRow {
  /** The day of the month, in the dot. */
  chip: string
  /** "Today · 3 expenses", "Sun 8 Nov · Nothing spent". */
  text: string
  amount: string
  /** How big the day is against the biggest shown, 0 to 1: the length of its bar. */
  share: number
  /** The colour of the dot and the bar, as #rrggbb. */
  color: string
}

/** What the Timeline widget shows. Everything is written out here, as the app writes it; the widget only lays it out. */
export interface TimelineWidgetData {
  /** "Last 6 days · ₹7,450". */
  title: string
  /** The days, newest first, the quiet ones too. Empty when there is no spending yet. */
  rows: TimelineWidgetRow[]
  /** When this was worked out: the widget only changes when the app is opened, and says so. */
  updated: string
}

/** How many days the widget shows. */
export const TIMELINE_WIDGET_DAYS = 6

/** The Timeline's own colours for a day, cool for little through amber to a warm coral for the most (the heat colours in index.css). */
const STOPS = { low: [0x13, 0x9a, 0xa6], mid: [0xb5, 0x76, 0x00], high: [0xd9, 0x45, 0x2e] } as const

const channel = (from: number, to: number, share: number) => Math.round(from + (to - from) * share)
const hex = (rgb: number[]) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
const blend = (from: readonly number[], to: readonly number[], share: number) => from.map((c, i) => channel(c, to[i], share))

/** The colour of a day by how much was spent on it against the biggest day shown, as the Timeline colours its dots. */
export function heatColor(share: number): string {
  if (share <= 0) return hex([...STOPS.low])
  if (share < 0.5) return hex(blend(STOPS.low, STOPS.mid, share / 0.5))
  return hex(blend(STOPS.mid, STOPS.high, Math.min((share - 0.5) / 0.5, 1)))
}

let dayFormat: Intl.DateTimeFormat | undefined
let timeFormat: Intl.DateTimeFormat | undefined
let shortFormat: Intl.DateTimeFormat | undefined

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

/** The last few days as the Timeline reads them: what was spent on each, the biggest setting the length of the bars. */
export function buildTimelineWidgetData(expenses: Transaction[], money: (minor: number) => string, now: Date): TimelineWidgetData {
  const day = (shortFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(now)
  const time = (timeFormat ??= new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })).format(now)
  const updated = `Updated ${day}, ${time}`

  const tl = buildTimeline(expenses, now, TIMELINE_WIDGET_DAYS)
  if (tl.days.length === 0) return { title: 'Timeline', rows: [], updated }

  const rows = tl.days.map((d): TimelineWidgetRow => {
    const label = d.daysAgo === 0 ? 'Today' : d.daysAgo === 1 ? 'Yesterday' : (dayFormat ??= new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })).format(parseLocalDate(d.date))
    const share = tl.maxMinor > 0 ? d.totalMinor / tl.maxMinor : 0
    return {
      chip: String(parseLocalDate(d.date).getDate()),
      text: `${label} · ${d.count === 0 ? 'Nothing spent' : plural(d.count, 'expense')}`,
      amount: money(d.totalMinor),
      share,
      color: heatColor(share),
    }
  })

  const total = tl.days.reduce((a, d) => a + d.totalMinor, 0)
  const title = tl.days.length === 1 ? `Today · ${money(total)}` : `Last ${tl.days.length} days · ${money(total)}`
  return { title, rows, updated }
}
