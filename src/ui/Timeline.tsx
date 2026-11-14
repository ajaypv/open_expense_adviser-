import { memo, useCallback, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import { formatShare } from '../charts/share'
import { useDisplay } from '../data/display'
import { formatMoney, parseLocalDate } from '../db/money'
import type { Category, Transaction } from '../db/schema'
import { monthLabel } from '../insights/aggregates'
import { buildTimeline, timelineRows, type DayPart, type TimelineDay, type TimelineRow } from '../insights/timeline'
import { categoryIcon, spendIcon } from './categoryIcon'
import { DuckPond } from './DuckPond'
import { Icon } from './Icon'
import { useCountWhen, useSeen } from './motion'
import { riverPath, widthFor } from './river'
import { useLineScroll } from './useLineScroll'
import { Bottle } from './Water'

interface Props {
  /** Money sent, in the main currency. */
  expenses: Transaction[]
  /** Money received, told on its day. */
  received?: Transaction[]
  categoryById: Map<number, Category>
  currency: string
  today: Date
  /** Opens the expenses of one day, from the button inside it. */
  onPickDay: (date: string) => void
}

/** How many days it shows to begin with, and how many more each press of the button adds. */
const STEP = 30
/** Where the dot sits down the row, so the line runs from dot to dot. */
const DOT_Y = '1.7rem'
/** How far below the top of the scrolling area a date stops when its day is scrolled past, and stays until the next day takes its place. */
const STICK_TOP = '0.5rem'

/**
 * The colour of a day by how much was spent on it, against the biggest day shown: a calm teal for little or nothing, through amber,
 * to a warm coral for the most. Cool to warm, so more reads as hotter without being a traffic light. Every figure beside it is
 * written out, so the colour only backs the words up.
 */
const LOW = 'var(--heat-low)'
/** The line between days is one calm grey; only the ring of each date carries the colour of the day. */
const LINE = 'color-mix(in oklab, var(--ink-2) 45%, var(--bg))'
/** No money received, when none is given. */
const NONE: Transaction[] = []
const mix = (from: string, to: string, share: number) => `color-mix(in oklab, ${to} ${Math.round(share * 100)}%, ${from})`
function spendColor(share: number): string {
  if (share <= 0) return LOW
  if (share < 0.5) return mix(LOW, 'var(--heat-mid)', share / 0.5)
  return mix('var(--heat-mid)', 'var(--heat-high)', Math.min((share - 0.5) / 0.5, 1))
}

let dayFormat: Intl.DateTimeFormat | undefined
let shortFormat: Intl.DateTimeFormat | undefined
const dayLabel = (date: string) => (dayFormat ??= new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })).format(parseLocalDate(date))
const shortLabel = (date: string) => (shortFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(parseLocalDate(date))

/** "Today", "Yesterday", otherwise the day and date. */
const titleOf = (d: TimelineDay) => (d.daysAgo === 0 ? 'Today' : d.daysAgo === 1 ? 'Yesterday' : dayLabel(d.date))
const agoOf = (n: number) => (n <= 1 ? null : `${n} days ago`)

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** An amount that counts up when its row is reached, and lands exactly on the figure. */
function Amount({ minor, currency, seen, delay = 0 }: { minor: number; currency: string; seen: boolean; delay?: number }) {
  const value = useCountWhen(minor, seen, delay)
  const shown = value === minor ? minor : Math.round(value / 100) * 100
  return <>{formatMoney(shown, currency)}</>
}

const delayOf = (ms: number): CSSProperties => ({ '--d': `${ms}ms` }) as CSSProperties

interface Look {
  colorOf: (categoryId: number) => string
  nameOf: (categoryId: number) => string
  currency: string
}

/** One stacked bar, each category a piece sized by its share, with a gap between, drawn from the left when seen. */
function Pieces({ parts, look, delay = 0, still = false }: { parts: DayPart[]; look: Look; delay?: number; still?: boolean }) {
  return (
    <div className="flex h-full gap-0.5">
      {parts.map((p, i) => (
        <span
          key={p.categoryId}
          data-piece={p.categoryId}
          className={`${still ? '' : 'ai-bar-right '}h-full min-w-1 rounded-full`}
          style={{ flexGrow: p.minor, flexBasis: 0, background: look.colorOf(p.categoryId), ...delayOf(delay + i * 90) }}
        />
      ))}
    </div>
  )
}

/**
 * Today's bar, the one bar that moves. It is the day's bar as it always is (the categories side by side, as long as the day is
 * against the biggest), but as a little bottle of water: poured in when it comes into view, then level against the world as the phone
 * is tilted. No icons on it: the colour on the end is the category of the expense added last.
 */
function TodayBar({ day, look, width }: { day: TimelineDay; look: Look; width: number }) {
  const last = day.txs[0]
  // The category of the expense added last is the end of the bar, so the colour on the end is what was just spent on.
  const parts = useMemo(() => [...day.parts.filter((p) => p.categoryId !== last.categoryId), ...day.parts.filter((p) => p.categoryId === last.categoryId)], [day.parts, last.categoryId])
  return (
    <span aria-hidden="true" data-today-bar className="today-bar relative mt-3 block h-8 overflow-hidden rounded-full bg-surface-2">
      <span className="relative block h-full" style={{ width: `${width}%` }}>
        <Bottle>
          <Pieces parts={parts} look={look} still />
        </Bottle>
      </span>
    </span>
  )
}

/** One stretch of the line, from the dot of one day to the next, straight down and as wide as the money on it. */
function RiverBase({ from, to, wFrom, wTo, edge, top = DOT_Y, left = '50%' }: { from: string; to: string; wFrom: number; wTo: number; edge?: boolean; top?: string; left?: string }) {
  const id = useId().replace(/:/g, '')
  const d = riverPath(wFrom, edge ? wFrom : wTo)
  const end = edge ? from : to
  return (
    <span
      data-seg
      className="tl-river absolute w-6 -translate-x-1/2"
      style={{ top, left, bottom: edge ? 0 : `calc(${DOT_Y} * -1)`, '--from': from, '--to': end } as CSSProperties}
    >
      <svg aria-hidden="true" viewBox="0 0 24 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <path d={d} fill="var(--edge)" opacity="0.5" />
      </svg>
      {/* The coloured river is shown from the top down as far as the page has been scrolled; a bead of light rides its edge. */}
      <svg aria-hidden="true" viewBox="0 0 24 100" preserveAspectRatio="none" className="tl-fill absolute inset-0 size-full">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: from }} />
            <stop offset="1" style={{ stopColor: end }} />
          </linearGradient>
        </defs>
        <path d={d} fill={`url(#${id})`} />
      </svg>
      <span className="tl-head absolute size-3 rounded-full" />
    </span>
  )
}

let weekdayFormat: Intl.DateTimeFormat | undefined
const weekdayOf = (date: string) => (weekdayFormat ??= new Intl.DateTimeFormat(undefined, { weekday: 'short' })).format(parseLocalDate(date))
let longWeekdayFormat: Intl.DateTimeFormat | undefined
const longWeekdayOf = (date: string) => (longWeekdayFormat ??= new Intl.DateTimeFormat(undefined, { weekday: 'long' })).format(parseLocalDate(date))
/** The day of the month, as a number. */
const dateOf = (date: string) => parseLocalDate(date).getDate()

/** A date as it sits in its dot: the weekday small over the number. */
function DateChip({ date }: { date: string }) {
  return (
    <>
      <span data-weekday className="text-xs font-medium opacity-80">
        {weekdayOf(date)}
      </span>
      <span data-date className="mt-0.5 text-[1.0625rem] font-semibold tabular-nums">
        {dateOf(date)}
      </span>
    </>
  )
}

/**
 * The river and the dot beside a row. The dot is the date of the day, weekday over number. It is unlit until the line reaches
 * it as the page is scrolled, then fills in the colour for how much was spent on it; today's gives out a ring now and then, as a
 * ping. The river runs from this dot to the next, from one colour into the next's, and stops at the foot of the row when a month
 * heading comes next, which carries it on.
 *
 * The dot sticks: as the day is scrolled past (a long one, opened, can be taller than the screen) it stays at the top, riding the line,
 * until the next day's dot comes up and pushes it off. While it is stuck a pill opens out behind it with the date and the weekday in
 * words, so you can tell which day you are in (a browser that cannot tell when a thing is stuck leaves the dot as it is).
 */
function Spine({ color, next, wFrom, wTo, today, edge, label, children }: { color: string; next: string | null; wFrom: number; wTo: number; today?: boolean; edge?: boolean; label?: { main: string; sub?: string }; children: React.ReactNode }) {
  return (
    <div aria-hidden="true" className="relative">
      {next !== null && <River from={LINE} to={LINE} wFrom={wFrom} wTo={wTo} edge={edge} />}
      <span data-stick className="tl-stick sticky z-10 mx-auto block size-[2.625rem]" style={{ top: STICK_TOP, marginTop: `calc(${DOT_Y} - 1.3125rem)` }}>
        {label && (
          <span data-pill className="tl-pill pointer-events-none absolute -inset-y-1 -left-1 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface/90 pl-[3.25rem] pr-4 shadow-[0_0_0_1px_var(--ring)] backdrop-blur-md">
            <span className="font-semibold">{label.main}</span>
            {label.sub && <span className="text-ink-2">{label.sub}</span>}
          </span>
        )}
        {today && <span className="tl-ping absolute inset-0 rounded-full" style={{ color }} />}
        <span data-dot className="tl-dot relative flex size-[2.625rem] flex-col items-center justify-center rounded-full leading-none" style={{ '--c': color } as CSSProperties}>
          {children}
        </span>
      </span>
    </div>
  )
}

/** What the pill says for a day: the date, then the weekday, like "18 Feb Wednesday". */
const pillOf = (date: string) => ({ main: shortLabel(date), sub: longWeekdayOf(date) })

interface DayProps {
  day: TimelineDay
  look: Look
  max: number
  color: string
  next: string | null
  /** A month heading comes next, so the line stops at the foot of this row. */
  edge: boolean
  /** How wide the line is where it leaves this day and where it meets the next. */
  wFrom: number
  wTo: number
  open: boolean
  /** Opens the day, or shuts it if it is open. Keeps its identity, so a row is not redrawn for another one being opened. */
  onToggle: (date: string) => void
  onPickDay: (date: string) => void
  categoryById: Map<number, Category>
}

function DayRowBase({ day, look, max, color, next, edge, wFrom, wTo, open, onToggle, onPickDay, categoryById }: DayProps) {
  const [watch, seen] = useSeen(0.2)
  const money = (m: number) => formatMoney(m, look.currency)
  const empty = day.totalMinor === 0 && day.receivedMinor === 0
  const onlyReceived = day.totalMinor === 0 && day.receivedMinor > 0
  const from = [...new Set(day.received.map((t) => t.merchant || 'Money received'))].slice(0, 2).join(', ')
  const title = titleOf(day)
  const ago = agoOf(day.daysAgo)
  const lead = day.parts[0]
  const shown = day.parts.slice(0, 3)
  const more = day.parts.length - shown.length

  return (
    <li ref={watch} data-seen={seen} data-day={day.date} className="when-seen grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2" style={delayOf(0)}>
      <Spine color={color} next={next} edge={edge} wFrom={wFrom} wTo={wTo} today={day.daysAgo === 0} label={pillOf(day.date)}>
        <DateChip date={day.date} />
      </Spine>
      <div className="pb-4">
        {empty ? (
          <div className="rounded-3xl bg-surface px-4 py-3.5 shadow-[0_0_0_1px_var(--ring)]">
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-ink-2">Nothing spent yet today.</p>
            {day.daysAgo === 0 && <DuckPond />}
          </div>
        ) : onlyReceived ? (
          <div role="group" aria-label={`${title}, received ${money(day.receivedMinor)}`} className="flex items-center gap-3 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]">
            <span aria-hidden="true" data-received-icon className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-good">
              <Icon name="arrowDown" size={20} weight={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-tight">{title}</span>
              <span className="block truncate text-sm text-ink-2">{from}</span>
            </span>
            <span className="num shrink-0 text-xl text-good">{`+${money(day.receivedMinor)}`}</span>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`tl-${day.date}`}
              aria-label={`${title}${ago ? `, ${ago}` : ''}, ${money(day.totalMinor)}, ${plural(day.count, 'expense')}${day.receivedMinor > 0 ? `, received ${money(day.receivedMinor)}` : ''}`}
              onClick={() => onToggle(day.date)}
              className="block w-full p-4 text-left active:bg-surface-2 [@media(hover:hover)]:hover:bg-surface-2"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-semibold leading-tight">{title}</span>
                  <span className="block text-sm text-ink-2">{ago ?? dayLabel(day.date)}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block text-xl leading-tight">
                    <Amount minor={day.totalMinor} currency={look.currency} seen={seen} delay={150} />
                  </span>
                  <span className="block text-sm text-ink-2">
                    <b className="num text-ink">{day.count}</b>
                    {day.count === 1 ? ' expense' : ' expenses'}
                  </span>
                </span>
              </span>

              {day.daysAgo === 0 ? (
                <TodayBar day={day} look={look} width={Math.max(30, (day.totalMinor / Math.max(max, 1)) * 100)} />
              ) : (
                <span aria-hidden="true" className="mt-3 block h-3.5 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full" style={{ width: `${Math.max(10, (day.totalMinor / Math.max(max, 1)) * 100)}%` }}>
                    <Pieces parts={day.parts} look={look} delay={250} />
                  </span>
                </span>
              )}

              <span className="mt-3 flex flex-wrap gap-1.5">
                {shown.map((p) => (
                  <span key={p.categoryId} data-chip={p.categoryId} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-1 pr-2.5 text-sm">
                    <span
                      aria-hidden="true"
                      data-icon={categoryIcon(look.nameOf(p.categoryId))}
                      className="flex size-5 shrink-0 items-center justify-center rounded-full text-ink"
                      style={{ background: `color-mix(in oklab, ${look.colorOf(p.categoryId)} 26%, var(--surface))` }}
                    >
                      <Icon name={categoryIcon(look.nameOf(p.categoryId))} size={12} />
                    </span>
                    <span className="truncate">{look.nameOf(p.categoryId)}</span>
                    <span className="num shrink-0">{money(p.minor)}</span>
                  </span>
                ))}
                {more > 0 && <span className="inline-flex items-center rounded-full px-2 py-1 text-sm text-ink-2">{`+${more} more`}</span>}
              </span>
              {day.receivedMinor > 0 && (
                <span className="mt-3 flex items-center gap-2 text-sm text-ink-2">
                  <span aria-hidden="true" data-received-icon className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-good">
                    <Icon name="arrowDown" size={13} weight={2.25} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{`Received · ${from}`}</span>
                  <b className="num shrink-0 text-good">{`+${money(day.receivedMinor)}`}</b>
                </span>
              )}
              <span className="sr-only">{`Mostly ${look.nameOf(lead.categoryId)}, ${formatShare(lead.minor / day.totalMinor)}.`}</span>
            </button>

            {/* The day's detail opens by growing from nothing, and is kept out of reach while it is shut. */}
            <div
              id={`tl-${day.date}`}
              className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
              style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
              inert={!open}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="border-t border-line px-4 pb-4 pt-3">
                  <ul aria-label={`${title}, by category`} className="space-y-2">
                    {day.parts.map((p) => (
                      <li key={p.categoryId} className="flex items-center gap-3 text-[0.9375rem]">
                        <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in oklab, ${look.colorOf(p.categoryId)} 24%, var(--surface))` }}>
                          <Icon name={categoryIcon(look.nameOf(p.categoryId))} size={15} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{look.nameOf(p.categoryId)}</span>
                        <span className="shrink-0 tabular-nums text-ink-2">{formatShare(p.minor / day.totalMinor)}</span>
                        <span className="num w-20 shrink-0 text-right">{money(p.minor)}</span>
                      </li>
                    ))}
                  </ul>
                  <ul aria-label={`${title}, each expense`} className="mt-3 divide-y divide-line border-t border-line">
                    {day.txs.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 py-2 text-[0.9375rem]">
                        <span aria-hidden="true" data-icon={spendIcon(t.merchant, categoryById.get(t.categoryId)?.name)} className="flex size-5 shrink-0 items-center justify-center text-ink-2">
                          <Icon name={spendIcon(t.merchant, categoryById.get(t.categoryId)?.name)} size={16} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{t.merchant || look.nameOf(t.categoryId)}</span>
                        <span className="num shrink-0">{money(t.amountMinor)}</span>
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => onPickDay(day.date)} className="mt-2 min-h-11 w-full rounded-full bg-surface-2 font-medium">
                    {`See ${title === 'Today' || title === 'Yesterday' ? title.toLowerCase() : 'this day'}’s expenses`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </li>
  )
}

/** Days with nothing spent are told in one plain line: one day has its date in the dot, a run of them a tick. */
function QuietRowBase({ row, color, next, edge, wFrom, wTo }: { row: Extract<TimelineRow, { kind: 'quiet' }>; color: string; next: string | null; edge: boolean; wFrom: number; wTo: number }) {
  const one = row.count === 1
  return (
    <li data-quiet={row.to} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2">
      <Spine color={color} next={next} edge={edge} wFrom={wFrom} wTo={wTo} label={one ? pillOf(row.to) : { main: `${shortLabel(row.from)} – ${shortLabel(row.to)}` }}>
        {one ? <DateChip date={row.to} /> : <Icon name="check" size={18} />}
      </Spine>
      <div className="pb-4 pt-3.5">
        <p className="flex items-center gap-2 px-1 text-[0.9375rem] leading-snug text-ink-2">
          <span aria-hidden="true" className="text-good">
            <Icon name="check" size={16} />
          </span>
          {one ? `No spending on ${dayLabel(row.to)}` : `${row.count} days with no spending, ${shortLabel(row.from)} to ${shortLabel(row.to)}`}
        </p>
      </div>
    </li>
  )
}

/*
 * Each of these is drawn again only when something about it has changed. Opening a day changes two rows (the one that opens and the one
 * that shuts), not the thirty or so on the page, and the line's drawing, which is dear (two pictures to a stretch), is not made again.
 */
const River = memo(RiverBase)
const DayRow = memo(DayRowBase)
const QuietRow = memo(QuietRowBase)

/**
 * The days behind you, newest first, down a line of dots, each dot the date of its day, ringed in a colour for how much was
 * spent on it (green for nothing, through amber, to red for the most). Each day has its total, a bar of what it went on, in the
 * categories' own colours (the bar as long as the day is against the biggest),
 * and the top categories; tapping opens it to every category, every expense and a way into the list. The line takes the colour
 * of one day into the next, and as each is reached the dot lands, the line draws, a pulse of light runs down it, the bar fills
 * and the amount counts up. Quiet days fold into a single line.
 */
export function Timeline({ expenses, received = NONE, categoryById, currency, today, onPickDay }: Props) {
  useDisplay() // amounts are masked or regrouped by display settings, so redraw when they change
  const [span, setSpan] = useState(STEP)
  const [open, setOpen] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  const tl = useMemo(() => buildTimeline(expenses, today, span, received), [expenses, received, today, span])
  const rows = useMemo(() => timelineRows(tl.days), [tl.days])
  const monthTotals = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of expenses) if (t.kind === 'expense' && t.deletedAt === undefined) m.set(t.date.slice(0, 7), (m.get(t.date.slice(0, 7)) ?? 0) + t.amountMinor)
    return m
  }, [expenses])

  // The line is drawn as the page scrolls; it looks again when the list gets longer (a day opening is seen by its size changing).
  useLineScroll(listRef, rows.length)

  // These keep their identity until the categories or the currency change, so the rows that are given them are not redrawn for nothing.
  const look = useMemo<Look>(
    () => ({
      colorOf: (id) => categoryById.get(id)?.color ?? 'var(--other)',
      nameOf: (id) => categoryById.get(id)?.name ?? 'No category',
      currency,
    }),
    [categoryById, currency],
  )
  const toggle = useCallback((date: string) => setOpen((o) => (o === date ? null : date)), [])
  const thisYear = today.getFullYear()

  if (tl.days.length === 0) {
    return (
      <div className="pb-6 pt-2">
        <p className="rounded-3xl bg-surface p-5 text-ink-2 shadow-[0_0_0_1px_var(--ring)]">No spending to show yet. Add an expense and it appears here, on its day.</p>
      </div>
    )
  }

  // The colour a row's dot and line start from, so the line can run on into the next row's: by how much was spent.
  const colorFor = (r: TimelineRow) => (r.kind === 'day' ? spendColor(r.day.totalMinor / Math.max(tl.maxMinor, 1)) : LOW)
  const colors = rows.map(colorFor)
  // How big each day is against the biggest, which is how wide the line is where it meets that day.
  const widths = rows.map((r) => widthFor(r.kind === 'day' ? r.day.totalMinor / Math.max(tl.maxMinor, 1) : 0))
  // The nearest row with a dot, before or after, skipping the month headings between.
  const dotted = (from: number, step: 1 | -1) => {
    for (let k = from + step; k >= 0 && k < rows.length; k += step) if (rows[k].kind !== 'month') return k
    return -1
  }

  return (
    <div className="pb-6 pt-2">
      <div className="mt-1 flex items-center gap-3 px-1 text-sm text-ink-2">
        <span>Spent less</span>
        <span aria-hidden="true" data-testid="spend-scale" className="h-2 flex-1 rounded-full" style={{ background: `linear-gradient(to right in oklab, var(--heat-low), var(--heat-mid), var(--heat-high))` }} />
        <span>Spent more</span>
      </div>

      <ol ref={listRef} aria-label="Spending, day by day" className="mt-4">
        {rows.map((r, i) => {
          const before = dotted(i, -1)
          const after = dotted(i, 1)
          if (r.kind === 'month') {
            const [y] = r.month.split('-')
            const label = monthLabel(r.month).split(' ')[0] + (Number(y) === thisYear ? '' : ` ${y}`)
            return (
              <li key={r.key} className="relative flex items-baseline justify-between gap-3 pb-3 pl-[3.5rem] pr-1 pt-2">
                {/* The river goes on behind the heading, from one day's colour and width to the next's. */}
                {before !== -1 && after !== -1 && (
                  <River from={LINE} to={LINE} wFrom={widths[before]} wTo={widths[after]} top="0px" left="1.5rem" />
                )}
                <h3 className="text-lg font-bold tracking-tight">{label}</h3>
                <span className="text-sm text-ink-2">
                  <b className="num text-ink">{formatMoney(monthTotals.get(r.month) ?? 0, currency)}</b>
                  {' spent'}
                </span>
              </li>
            )
          }
          const next = after === -1 ? null : colors[after]
          const edge = rows[i + 1]?.kind === 'month'
          const wTo = after === -1 ? widths[i] : widths[after]
          if (r.kind === 'quiet') return <QuietRow key={r.key} row={r} color={colors[i]} next={next} edge={edge} wFrom={widths[i]} wTo={wTo} />
          return (
            <DayRow
              key={r.key}
              day={r.day}
              look={look}
              max={tl.maxMinor}
              color={colors[i]}
              next={next}
              edge={edge}
              wFrom={widths[i]}
              wTo={wTo}
              open={open === r.day.date}
              onToggle={toggle}
              onPickDay={onPickDay}
              categoryById={categoryById}
            />
          )
        })}
      </ol>

      {tl.earlier && (
        <button type="button" onClick={() => setSpan((s) => s + STEP)} className="mt-1 min-h-12 w-full rounded-full bg-surface font-medium shadow-[0_0_0_1px_var(--ring)]">
          Show earlier days
        </button>
      )}
    </div>
  )
}
