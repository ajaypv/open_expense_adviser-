import { useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import { formatShare } from '../charts/share'
import { useDisplay } from '../data/display'
import { formatMoney, parseLocalDate } from '../db/money'
import type { Category, Transaction } from '../db/schema'
import { monthLabel } from '../insights/aggregates'
import { buildTimeline, timelineRows, type DayPart, type TimelineDay, type TimelineRow } from '../insights/timeline'
import { categoryIcon, spendIcon } from './categoryIcon'
import { Icon } from './Icon'
import { useCountWhen, useSeen } from './motion'
import { riverPath, widthFor } from './river'
import { useLineScroll } from './useLineScroll'

interface Props {
  /** Money sent, in the main currency. */
  expenses: Transaction[]
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

/**
 * The colour of a day by how much was spent on it, against the biggest day shown: a calm teal for little or nothing, through amber,
 * to a warm coral for the most. Cool to warm, so more reads as hotter without being a traffic light. Every figure beside it is
 * written out, so the colour only backs the words up.
 */
const LOW = 'var(--heat-low)'
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
function Pieces({ parts, look, delay = 0 }: { parts: DayPart[]; look: Look; delay?: number }) {
  return (
    <div className="flex h-full gap-0.5">
      {parts.map((p, i) => (
        <span
          key={p.categoryId}
          data-piece={p.categoryId}
          className="ai-bar-right h-full min-w-1 rounded-full"
          style={{ flexGrow: p.minor, flexBasis: 0, background: look.colorOf(p.categoryId), ...delayOf(delay + i * 90) }}
        />
      ))}
    </div>
  )
}

/** The last seven days at a glance: the total, against the week before, one bar of what it went on, and the biggest day. */
function WeekCard({ week, look }: { week: ReturnType<typeof buildTimeline>['week']; look: Look }) {
  const [watch, seen] = useSeen()
  const money = (m: number) => formatMoney(m, look.currency)
  const { totalMinor, previousMinor, perDayMinor, peak, parts, quietDays } = week
  if (totalMinor <= 0) {
    return (
      <section aria-labelledby="tl-week-h" className="rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_var(--ring)]">
        <h2 id="tl-week-h" className="text-xl font-bold tracking-tight">
          Last 7 days
        </h2>
        <p className="mt-1 text-ink-2">Nothing spent in the last 7 days.</p>
      </section>
    )
  }
  const diff = previousMinor === null ? null : totalMinor - previousMinor
  const shown = parts.slice(0, 4)
  const rest = parts.slice(4).reduce((a, p) => a + p.minor, 0)
  return (
    <section ref={watch} data-seen={seen} aria-labelledby="tl-week-h" className="when-seen rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_var(--ring)]">
      <h2 id="tl-week-h" className="text-xl font-bold tracking-tight">
        Last 7 days
      </h2>
      <p data-testid="week-total" className="font-ai-display mt-1 text-5xl font-medium leading-none tracking-tight">
        <Amount minor={totalMinor} currency={look.currency} seen={seen} />
      </p>
      <p className="mt-2 text-[0.9375rem] leading-snug text-ink-2">
        {`${money(perDayMinor)} a day${diff === null || diff === 0 ? '' : `, ${money(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than the 7 days before`}.`}
      </p>

      <div role="img" aria-label={parts.map((p) => `${look.nameOf(p.categoryId)} ${formatShare(p.minor / totalMinor)}`).join(', ')} className="mt-4 h-4 overflow-hidden rounded-full bg-surface-2">
        <Pieces parts={parts} look={look} delay={200} />
      </div>
      <ul aria-label="Last 7 days, by category" className="mt-3 space-y-1.5">
        {shown.map((p) => (
          <li key={p.categoryId} className="flex items-center gap-3 text-[0.9375rem]">
            <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: look.colorOf(p.categoryId) }} />
            <span className="min-w-0 flex-1 truncate">{look.nameOf(p.categoryId)}</span>
            <span className="shrink-0 tabular-nums text-ink-2">{formatShare(p.minor / totalMinor)}</span>
            <span className="w-20 shrink-0 text-right font-semibold tabular-nums">{money(p.minor)}</span>
          </li>
        ))}
        {rest > 0 && (
          <li className="flex items-center gap-3 text-[0.9375rem]">
            <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: 'var(--other)' }} />
            <span className="min-w-0 flex-1 truncate">Everything else</span>
            <span className="shrink-0 tabular-nums text-ink-2">{formatShare(rest / totalMinor)}</span>
            <span className="w-20 shrink-0 text-right font-semibold tabular-nums">{money(rest)}</span>
          </li>
        )}
      </ul>
      <div className="mt-3 space-y-2">
        {quietDays > 0 && (
          <p data-testid="week-quiet" className="flex items-center gap-2 rounded-2xl bg-surface-2 p-3 text-[0.9375rem] leading-snug">
            <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in oklab, ${LOW} 22%, var(--surface))`, color: LOW }}>
              <Icon name="check" size={14} />
            </span>
            <span>{`${plural(quietDays, 'day')} of the 7 with no spending. Nicely done.`}</span>
          </p>
        )}
        {peak && <p className="rounded-2xl bg-surface-2 p-3 text-[0.9375rem] leading-snug text-ink-2">{`The biggest day was ${dayLabel(peak.date)}, ${money(peak.minor)}.`}</p>}
      </div>
    </section>
  )
}

/** One stretch of the line, from the dot of one day to the next, straight down and as wide as the money on it. */
function River({ from, to, wFrom, wTo, edge, top = DOT_Y, left = '50%' }: { from: string; to: string; wFrom: number; wTo: number; edge?: boolean; top?: string; left?: string }) {
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
/** The day of the month, as a number. */
const dateOf = (date: string) => parseLocalDate(date).getDate()

/** A date as it sits in its dot: the weekday small over the number. */
function DateChip({ date }: { date: string }) {
  return (
    <>
      <span data-weekday className="text-[0.6875rem] font-medium opacity-80">
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
 */
function Spine({ color, next, wFrom, wTo, today, edge, children }: { color: string; next: string | null; wFrom: number; wTo: number; today?: boolean; edge?: boolean; children: React.ReactNode }) {
  return (
    <div aria-hidden="true" className="relative">
      {next !== null && <River from={color} to={next} wFrom={wFrom} wTo={wTo} edge={edge} />}
      <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: DOT_Y }}>
        {today && <span className="tl-ping absolute inset-0 rounded-full" style={{ color }} />}
        <span data-dot className="tl-dot relative flex size-[2.625rem] flex-col items-center justify-center rounded-full leading-none" style={{ '--c': color } as CSSProperties}>
          {children}
        </span>
      </span>
    </div>
  )
}

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
  onToggle: () => void
  onPickDay: (date: string) => void
  categoryById: Map<number, Category>
}

function DayRow({ day, look, max, color, next, edge, wFrom, wTo, open, onToggle, onPickDay, categoryById }: DayProps) {
  const [watch, seen] = useSeen(0.2)
  const money = (m: number) => formatMoney(m, look.currency)
  const empty = day.totalMinor === 0
  const title = titleOf(day)
  const ago = agoOf(day.daysAgo)
  const lead = day.parts[0]
  const shown = day.parts.slice(0, 3)
  const more = day.parts.length - shown.length

  return (
    <li ref={watch} data-seen={seen} data-day={day.date} className="when-seen grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2" style={delayOf(0)}>
      <Spine color={color} next={next} edge={edge} wFrom={wFrom} wTo={wTo} today={day.daysAgo === 0}>
        <DateChip date={day.date} />
      </Spine>
      <div className="pb-4">
        {empty ? (
          <div className="rounded-3xl bg-surface px-4 py-3.5 shadow-[0_0_0_1px_var(--ring)]">
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-ink-2">Nothing spent yet today. A good start.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`tl-${day.date}`}
              aria-label={`${title}${ago ? `, ${ago}` : ''}, ${money(day.totalMinor)}, ${plural(day.count, 'expense')}`}
              onClick={onToggle}
              className="block w-full p-4 text-left active:bg-surface-2 [@media(hover:hover)]:hover:bg-surface-2"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-semibold leading-tight">{title}</span>
                  <span className="block text-sm text-ink-2">{ago ?? dayLabel(day.date)}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xl font-semibold tabular-nums leading-tight">
                    <Amount minor={day.totalMinor} currency={look.currency} seen={seen} delay={150} />
                  </span>
                  <span className="block text-sm text-ink-2">{plural(day.count, 'expense')}</span>
                </span>
              </span>

              <span aria-hidden="true" className="mt-3 block h-3.5 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full" style={{ width: `${Math.max(10, (day.totalMinor / Math.max(max, 1)) * 100)}%` }}>
                  <Pieces parts={day.parts} look={look} delay={250} />
                </span>
              </span>

              <span className="mt-3 flex flex-wrap gap-1.5">
                {shown.map((p) => (
                  <span key={p.categoryId} data-chip={p.categoryId} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-2 pr-2.5 text-sm">
                    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: look.colorOf(p.categoryId) }} />
                    <span className="truncate">{look.nameOf(p.categoryId)}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{money(p.minor)}</span>
                  </span>
                ))}
                {more > 0 && <span className="inline-flex items-center rounded-full px-2 py-1 text-sm text-ink-2">{`+${more} more`}</span>}
              </span>
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
                        <span className="w-20 shrink-0 text-right font-semibold tabular-nums">{money(p.minor)}</span>
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
                        <span className="shrink-0 font-medium tabular-nums">{money(t.amountMinor)}</span>
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

/** Days with nothing spent are good news, and are said so: one day has its date in the dot, a run of them a tick. */
function QuietRow({ row, color, next, edge, wFrom, wTo }: { row: Extract<TimelineRow, { kind: 'quiet' }>; color: string; next: string | null; edge: boolean; wFrom: number; wTo: number }) {
  const one = row.count === 1
  return (
    <li data-quiet={row.to} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2">
      <Spine color={color} next={next} edge={edge} wFrom={wFrom} wTo={wTo}>
        {one ? <DateChip date={row.to} /> : <Icon name="check" size={18} />}
      </Spine>
      <div className="pb-4 pt-3.5">
        <p className="rounded-2xl px-3 py-2 text-[0.9375rem] leading-snug" style={{ background: `color-mix(in oklab, ${LOW} 10%, var(--surface))` }}>
          <span className="text-ink-2">{one ? `No spending on ${dayLabel(row.to)}. ` : `${row.count} days with no spending, ${shortLabel(row.from)} to ${shortLabel(row.to)}. `}</span>
          <span className="inline-flex items-center gap-1 font-medium">
            <span aria-hidden="true" style={{ color: LOW }}>
              <Icon name="spark" size={14} />
            </span>
            {one ? 'Nicely done.' : 'Well done.'}
          </span>
        </p>
      </div>
    </li>
  )
}

/**
 * The days behind you, newest first, down a line of dots, each dot the date of its day, ringed in a colour for how much was
 * spent on it (green for nothing, through amber, to red for the most). Each day has its total, a bar of what it went on, in the
 * categories' own colours (the bar as long as the day is against the biggest),
 * and the top categories; tapping opens it to every category, every expense and a way into the list. The line takes the colour
 * of one day into the next, and as each is reached the dot lands, the line draws, a pulse of light runs down it, the bar fills
 * and the amount counts up. Quiet days fold into a single line.
 */
export function Timeline({ expenses, categoryById, currency, today, onPickDay }: Props) {
  useDisplay() // amounts are masked or regrouped by display settings, so redraw when they change
  const [span, setSpan] = useState(STEP)
  const [open, setOpen] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  const tl = useMemo(() => buildTimeline(expenses, today, span), [expenses, today, span])
  const rows = useMemo(() => timelineRows(tl.days), [tl.days])
  const monthTotals = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of expenses) if (t.kind === 'expense' && t.deletedAt === undefined) m.set(t.date.slice(0, 7), (m.get(t.date.slice(0, 7)) ?? 0) + t.amountMinor)
    return m
  }, [expenses])

  // The line is drawn as the page scrolls; it measures again when the list gets longer or a day is opened.
  useLineScroll(listRef, `${rows.length}:${open ?? ''}`)

  const look: Look = {
    colorOf: (id) => categoryById.get(id)?.color ?? 'var(--other)',
    nameOf: (id) => categoryById.get(id)?.name ?? 'No category',
    currency,
  }
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
      <WeekCard week={tl.week} look={look} />

      <div className="mt-8 flex items-center gap-3 px-1 text-sm text-ink-2">
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
                  <River from={colors[before]} to={colors[after]} wFrom={widths[before]} wTo={widths[after]} top="0px" left="1.5rem" />
                )}
                <h3 className="text-lg font-bold tracking-tight">{label}</h3>
                <span className="text-sm text-ink-2">{`${formatMoney(monthTotals.get(r.month) ?? 0, currency)} spent`}</span>
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
              onToggle={() => setOpen((o) => (o === r.day.date ? null : r.day.date))}
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
