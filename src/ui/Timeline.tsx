import { useMemo, useState, type CSSProperties } from 'react'
import { formatShare } from '../charts/share'
import { useDisplay } from '../data/display'
import { formatMoney, parseLocalDate } from '../db/money'
import type { Category, Transaction } from '../db/schema'
import { monthLabel } from '../insights/aggregates'
import { buildTimeline, timelineRows, type DayPart, type TimelineDay, type TimelineRow } from '../insights/timeline'
import { categoryIcon, spendIcon } from './categoryIcon'
import { Icon } from './Icon'
import { useCountWhen, useSeen } from './motion'

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
  const { totalMinor, previousMinor, perDayMinor, peak, parts } = week
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
      {peak && <p className="mt-3 rounded-2xl bg-surface-2 p-3 text-[0.9375rem] leading-snug text-ink-2">{`The biggest day was ${dayLabel(peak.date)}, ${money(peak.minor)}.`}</p>}
    </section>
  )
}

/** The line and the dot beside a row: the line runs from this dot to the next, from one day's colour into the next's. */
function Spine({ color, next, size, today, hollow }: { color: string; next: string | null; size: number; today?: boolean; hollow?: boolean }) {
  return (
    <div aria-hidden="true" className="relative">
      {next !== null && (
        <span
          className="tl-line absolute left-1/2 w-[3px] -translate-x-1/2 overflow-hidden rounded-full"
          style={{ top: DOT_Y, bottom: `calc(${DOT_Y} * -1)`, background: `linear-gradient(to bottom, ${color}, ${next})` }}
        >
          <span className="tl-flow absolute inset-x-0 top-0 h-2/5" />
        </span>
      )}
      <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: DOT_Y }}>
        {today && <span className="ai-pulse absolute inset-0 rounded-full" style={{ background: color }} />}
        <span
          data-dot
          className="ai-pop relative block rounded-full"
          style={{
            width: size,
            height: size,
            background: hollow ? 'var(--bg)' : color,
            boxShadow: hollow ? 'inset 0 0 0 2px var(--edge), 0 0 0 4px var(--bg)' : '0 0 0 4px var(--bg)',
          }}
        />
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
  open: boolean
  onToggle: () => void
  onPickDay: (date: string) => void
  categoryById: Map<number, Category>
}

function DayRow({ day, look, max, color, next, open, onToggle, onPickDay, categoryById }: DayProps) {
  const [watch, seen] = useSeen(0.2)
  const money = (m: number) => formatMoney(m, look.currency)
  const empty = day.totalMinor === 0
  const title = titleOf(day)
  const ago = agoOf(day.daysAgo)
  const size = empty ? 12 : Math.round(12 + 8 * Math.sqrt(day.totalMinor / Math.max(max, 1)))
  const lead = day.parts[0]
  const shown = day.parts.slice(0, 3)
  const more = day.parts.length - shown.length

  return (
    <li ref={watch} data-seen={seen} data-day={day.date} className="when-seen grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2" style={delayOf(0)}>
      <Spine color={color} next={next} size={size} today={day.daysAgo === 0} hollow={empty} />
      <div className="pb-4">
        {empty ? (
          <div className="rounded-3xl bg-surface px-4 py-3.5 shadow-[0_0_0_1px_var(--ring)]">
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-ink-2">Nothing spent yet today.</p>
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

function QuietRow({ row, color, next }: { row: Extract<TimelineRow, { kind: 'quiet' }>; color: string; next: string | null }) {
  const text = row.count === 1 ? `Nothing spent on ${dayLabel(row.to)}.` : `${row.count} quiet days, ${shortLabel(row.from)} to ${shortLabel(row.to)}.`
  return (
    <li data-quiet={row.to} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2">
      <Spine color={color} next={next} size={8} hollow />
      <p className="pb-4 pt-[1.15rem] text-sm leading-none text-ink-2">{text}</p>
    </li>
  )
}

/**
 * The days behind you, newest first, down a line of dots, one dot for each day, bigger the more was spent and coloured by what
 * most of it went on. Each day has its total, a bar of what it went on (the bar as long as the day is against the biggest),
 * and the top categories; tapping opens it to every category, every expense and a way into the list. The line takes the colour
 * of one day into the next, and as each is reached the dot lands, the line draws, a pulse of light runs down it, the bar fills
 * and the amount counts up. Quiet days fold into a single line.
 */
export function Timeline({ expenses, categoryById, currency, today, onPickDay }: Props) {
  useDisplay() // amounts are masked or regrouped by display settings, so redraw when they change
  const [span, setSpan] = useState(STEP)
  const [open, setOpen] = useState<string | null>(null)

  const tl = useMemo(() => buildTimeline(expenses, today, span), [expenses, today, span])
  const rows = useMemo(() => timelineRows(tl.days), [tl.days])
  const monthTotals = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of expenses) if (t.kind === 'expense' && t.deletedAt === undefined) m.set(t.date.slice(0, 7), (m.get(t.date.slice(0, 7)) ?? 0) + t.amountMinor)
    return m
  }, [expenses])

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

  // The colour a row's dot and line start from, so the line can run on into the next row's.
  const colorFor = (r: TimelineRow) => (r.kind === 'day' && r.day.parts[0] ? look.colorOf(r.day.parts[0].categoryId) : 'var(--edge)')
  const lined = rows.filter((r) => r.kind !== 'month')

  return (
    <div className="pb-6 pt-2">
      <WeekCard week={tl.week} look={look} />

      <ol aria-label="Spending, day by day" className="mt-8">
        {rows.map((r) => {
          if (r.kind === 'month') {
            const [y] = r.month.split('-')
            const label = monthLabel(r.month).split(' ')[0] + (Number(y) === thisYear ? '' : ` ${y}`)
            return (
              <li key={r.key} className="flex items-baseline justify-between gap-3 pb-3 pl-[2.75rem] pr-1 pt-2">
                <h3 className="text-lg font-bold tracking-tight">{label}</h3>
                <span className="text-sm text-ink-2">{`${formatMoney(monthTotals.get(r.month) ?? 0, currency)} spent`}</span>
              </li>
            )
          }
          const at = lined.indexOf(r)
          const nextRow = lined[at + 1]
          const next = nextRow ? colorFor(nextRow) : null
          if (r.kind === 'quiet') return <QuietRow key={r.key} row={r} color={colorFor(r)} next={next} />
          return (
            <DayRow
              key={r.key}
              day={r.day}
              look={look}
              max={tl.maxMinor}
              color={colorFor(r)}
              next={next}
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
