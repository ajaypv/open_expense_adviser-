import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { formatMoney, formatMoneyCompact, parseLocalDate } from '../db/money'
import type { Category, Transaction } from '../db/schema'
import { monthLabel, type MonthKey } from '../insights/aggregates'
import { dayInsights, dayView, versusAverage, type DayInfo, type DaySlice } from '../insights/days'
import { Icon } from '../ui/Icon'
import { useSeen } from '../ui/motion'
import { niceCeil } from './scale'
import { TableDisclosure } from './TableDisclosure'

interface Props {
  /** Money sent in this month. */
  txs: Transaction[]
  categoryById: Map<number, Category>
  monthKey: MonthKey
  /** Last day that has happened (today's date for the current month, null for a finished month). */
  lastDay: number | null
  currency: string
  budgetMinor?: number | null
  /** Opens the expenses of one day, from the button beside its reading. */
  onPickDay?: (date: string) => void
}

type Mode = 'total' | 'category'

const LABEL_DAYS = [1, 8, 15, 22, 29]
const DETAIL_ROWS = 3

let dayName: Intl.DateTimeFormat | undefined
const labelOf = (date: string) =>
  (dayName ??= new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })).format(parseLocalDate(date))

/**
 * Spend for each day of the month, made to be read and played with. The columns rise when the chart comes into view;
 * a dashed line marks the average day (and another the daily share of the budget), weekends sit on a light band, and a
 * day above its budget share wears a red cap. Touch, drag across, hover or use the arrow keys: the chosen day lifts, its
 * amount floats above it, and below the chart you see how it compares with your average and the expenses it was made of,
 * with a button to open them. "By category" turns each column into a stack, so you can see what every day was spent on.
 * With nothing chosen, a few short sentences say what the pattern is, and the ones about a day can be tapped to show it.
 */
export function DayChart({ txs, categoryById, monthKey, lastDay, currency, budgetMinor = null, onPickDay }: Props) {
  const [mode, setMode] = useState<Mode>('total')
  // A tap or the keys keep a day; a mouse only looks and goes back when it leaves.
  const [picked, setPicked] = useState<number | null>(null)
  const [looking, setLooking] = useState<number | null>(null)
  const [watch, seen] = useSeen()
  const plot = useRef<HTMLDivElement>(null)
  const lastPointer = useRef<number | null>(null)

  const view = useMemo(() => dayView(txs, monthKey, lastDay, budgetMinor), [txs, monthKey, lastDay, budgetMinor])
  const { days, elapsed, averageMinor, limitMinor, peak } = view
  const n = days.length
  const money = (minor: number) => formatMoney(minor, currency)
  const nameOf = (id: number | null) => (id === null ? 'Everything else' : (categoryById.get(id)?.name ?? 'No category'))
  const colorOf = (s: DaySlice) => (s.categoryId === null ? 'var(--other)' : (categoryById.get(s.categoryId)?.color ?? 'var(--other)'))

  const axisMax = niceCeil(Math.max(peak?.minor ?? 0, 1))
  const heightOf = (minor: number) => (minor === 0 ? 0 : Math.max((minor / axisMax) * 100, 3))
  const showLimit = limitMinor !== null && limitMinor <= axisMax
  const shown = looking ?? picked
  const day: DayInfo | null = shown === null ? null : days[shown]
  const insights = dayInsights(view, money, labelOf)

  function indexAt(e: PointerEvent): number | null {
    const box = plot.current?.getBoundingClientRect()
    if (!box || box.width === 0) return null
    const i = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * n)))
    return i < elapsed ? i : null
  }

  const step = (delta: number) => setPicked((p) => Math.min(elapsed - 1, Math.max(0, (p ?? elapsed) + delta)))

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') return setPicked(null)
    if (e.key === 'Home') return void (e.preventDefault(), setPicked(0))
    if (e.key === 'End') return void (e.preventDefault(), setPicked(elapsed - 1))
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    step(e.key === 'ArrowRight' ? 1 : -1)
  }

  const stagger = Math.min(18, 500 / Math.max(n, 1))

  return (
    <div ref={watch} data-seen={seen} className="when-seen">
      <div className="flex items-start justify-between gap-3">
        <div aria-live="polite" className="min-w-0">
          <div key={day ? day.date : 'average'} className="day-read">
            {day ? (
              <>
                <p className="text-sm text-ink-2">{`${labelOf(day.date)}${lastDay !== null && day.day === lastDay ? ', today' : ''}`}</p>
                <p className="text-2xl font-bold tabular-nums tracking-tight">{money(day.minor)}</p>
                <p className="text-sm text-ink-2">{versusAverage(day.minor, averageMinor)}</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold tabular-nums tracking-tight">{money(averageMinor)}</p>
                <p className="text-sm text-ink-2">a day on average</p>
                <p className="text-sm text-ink-2">{`${money(view.totalMinor)} over ${elapsed} ${elapsed === 1 ? 'day' : 'days'}`}</p>
              </>
            )}
          </div>
        </div>

        <div role="group" aria-label="How to colour the columns" className="flex shrink-0 gap-0.5 rounded-full bg-surface-2 p-0.5">
          {(
            [
              ['total', 'Total'],
              ['category', 'By category'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
              className={`min-h-9 rounded-full px-3 text-sm font-medium transition-colors motion-reduce:transition-none ${mode === id ? 'bg-btn text-btn-ink' : 'text-ink-2'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={plot}
        data-testid="day-plot"
        role="group"
        tabIndex={0}
        aria-label={`Daily spending in ${monthLabel(monthKey)}. Use left and right arrow keys to read each day.`}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          const i = indexAt(e)
          if (i === null) return
          lastPointer.current = i
          setPicked((p) => (p === i ? null : i))
        }}
        onPointerMove={(e) => {
          const i = indexAt(e)
          if (i === null) return
          if (e.pointerType === 'mouse') return setLooking(i)
          // A finger dragging across follows it, but a wobble inside one column must not undo a tap.
          if (i !== lastPointer.current) {
            lastPointer.current = i
            setPicked(i)
          }
        }}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setLooking(null)}
        className="relative mt-3 h-48 touch-pan-y rounded-xl outline-offset-2"
      >
        <div className="absolute inset-x-0 bottom-0 top-7 border-b border-axis">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-line">
            <span className="absolute left-0 top-0 -translate-y-full text-xs text-ink-2">{formatMoneyCompact(axisMax, currency)}</span>
          </div>
          <div aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-line" />

          <div className="absolute inset-0 flex items-end gap-[2px]">
            {days.map((d, i) => {
              const selected = shown === i
              const over = !d.future && limitMinor !== null && d.minor > limitMinor
              const above = d.minor >= averageMinor
              const total = d.minor
              return (
                <div
                  key={d.date}
                  data-day={d.day}
                  data-weekend={d.weekend ? 'true' : undefined}
                  data-over={over ? 'true' : undefined}
                  data-selected={selected ? 'true' : undefined}
                  className="relative flex h-full flex-1 items-end justify-center"
                >
                  {d.weekend && <span aria-hidden="true" className="absolute inset-0 rounded-sm bg-surface-2/70" />}
                  <span aria-hidden="true" className={`absolute inset-0 rounded-sm bg-line/60 transition-opacity duration-150 motion-reduce:transition-none ${selected ? 'opacity-100' : 'opacity-0'}`} />
                  {d.future ? (
                    <div className="relative h-[2px] w-full max-w-6 bg-axis opacity-50" />
                  ) : (
                    <div
                      data-bar
                      className="day-bar relative flex w-full max-w-6 flex-col-reverse overflow-hidden rounded-t-[3px] transition-[height,opacity] duration-500 motion-reduce:transition-none"
                      style={{ height: `${heightOf(total)}%`, opacity: shown === null || selected ? 1 : 0.35, '--d': `${i * stagger}ms` } as CSSProperties}
                    >
                      {d.slices.map((s) => (
                        <span
                          key={String(s.categoryId)}
                          data-slice={s.categoryId ?? 'rest'}
                          className="block w-full flex-none transition-[background-color,box-shadow] duration-500 motion-reduce:transition-none"
                          style={{
                            height: `${(s.minor / total) * 100}%`,
                            background: mode === 'category' ? colorOf(s) : above ? 'var(--s1)' : 'color-mix(in oklab, var(--s1) 55%, var(--surface))',
                            boxShadow: mode === 'category' ? '0 -1px 0 var(--surface)' : '0 0 0 transparent',
                          }}
                        />
                      ))}
                      {over && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'var(--critical)' }} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div
            aria-hidden="true"
            data-testid="day-average"
            className="day-line pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-2 transition-[bottom] duration-500 motion-reduce:transition-none"
            style={{ bottom: `${heightOf(averageMinor)}%` }}
          >
            <span className="absolute right-0 top-0 -translate-y-1/2 rounded bg-surface px-1 text-xs text-ink-2">average</span>
          </div>
          {showLimit && (
            <div
              aria-hidden="true"
              data-testid="day-limit"
              className="day-line pointer-events-none absolute inset-x-0 border-t border-dashed transition-[bottom] duration-500 motion-reduce:transition-none"
              style={{ bottom: `${heightOf(limitMinor!)}%`, borderColor: 'var(--critical)' }}
            >
              <span className="absolute left-0 top-0 -translate-y-1/2 rounded bg-surface px-1 text-xs" style={{ color: 'var(--critical-text)' }}>
                budget
              </span>
            </div>
          )}

          {day && !day.future && day.minor > 0 && (
            <span
              aria-hidden="true"
              data-testid="day-tag"
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-full bg-btn px-2 py-0.5 text-xs font-semibold tabular-nums text-btn-ink transition-[left,bottom] duration-150 motion-reduce:transition-none"
              style={{ left: `clamp(1.5rem, ${((shown! + 0.5) / n) * 100}%, calc(100% - 1.5rem))`, bottom: `calc(${heightOf(day.minor)}% + 6px)` }}
            >
              {formatMoneyCompact(day.minor, currency)}
            </span>
          )}
        </div>
      </div>

      <div aria-hidden="true" className="relative mt-1.5 h-5 text-sm text-ink-2">
        {LABEL_DAYS.filter((d) => d <= n).map((d) => (
          <span key={d} className="absolute -translate-x-1/2" style={{ left: `${((d - 0.5) / n) * 100}%` }}>
            {d}
          </span>
        ))}
        {lastDay !== null && <span className="absolute top-0 size-1.5 -translate-x-1/2 -translate-y-2 rounded-full bg-ink" style={{ left: `${((Math.min(lastDay, n) - 0.5) / n) * 100}%` }} />}
      </div>

      {mode === 'category' && view.legend.length > 0 && (
        <ul aria-label="Colours by category" className="row-in mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {view.legend.map((s) => (
            <li key={String(s.categoryId)} className="flex items-center gap-1.5 text-sm text-ink-2">
              <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: colorOf(s) }} />
              {nameOf(s.categoryId)}
            </li>
          ))}
        </ul>
      )}

      {day ? (
        <div key={day.date} className="day-read mt-3 rounded-2xl bg-surface-2 p-3.5">
          {day.txs.length === 0 ? (
            <p className="text-[0.9375rem] text-ink-2">Nothing spent on this day.</p>
          ) : (
            <ul className="space-y-1.5">
              {day.txs.slice(0, DETAIL_ROWS).map((t) => (
                <li key={t.id} className="flex items-center gap-2.5 text-[0.9375rem]">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: categoryById.get(t.categoryId)?.color ?? 'var(--other)' }} />
                  <span className="min-w-0 flex-1 truncate">{t.merchant || categoryById.get(t.categoryId)?.name || 'Expense'}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{money(t.amountMinor)}</span>
                </li>
              ))}
              {day.txs.length > DETAIL_ROWS && <li className="text-sm text-ink-2">{`and ${day.txs.length - DETAIL_ROWS} more`}</li>}
            </ul>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <button type="button" aria-label="Previous day" disabled={day.day === 1} onClick={() => setPicked(Math.max(0, day.day - 2))} className="flex size-11 items-center justify-center rounded-full bg-surface disabled:opacity-40">
                <Icon name="chevLeft" size={20} />
              </button>
              <button type="button" aria-label="Next day" disabled={day.day >= elapsed} onClick={() => setPicked(Math.min(elapsed - 1, day.day))} className="flex size-11 items-center justify-center rounded-full bg-surface disabled:opacity-40">
                <Icon name="chevRight" size={20} />
              </button>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPicked(null)} className="min-h-11 rounded-full px-3 text-sm font-medium">
                Close
              </button>
              {onPickDay && day.minor > 0 && (
                <button type="button" onClick={() => onPickDay(day.date)} className="min-h-11 rounded-full bg-btn px-4 text-sm font-semibold text-btn-ink">
                  See these
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        insights.length > 0 && (
          <ul aria-label="What the days say" className="mt-3 divide-y divide-line">
            {insights.map((s, i) => {
              const row = { '--d': `${600 + i * 90}ms` } as CSSProperties
              const body = (
                <>
                  <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-ink-2" />
                  <span className="min-w-0 flex-1 text-left text-[0.9375rem]">{s.text}</span>
                </>
              )
              return (
                <li key={s.key} className="row-in" style={row}>
                  {s.day !== undefined ? (
                    <button type="button" onClick={() => setPicked(s.day! - 1)} aria-label={`${s.text}. Show this day`} className="flex min-h-11 w-full items-center gap-2.5 py-2">
                      {body}
                      <Icon name="chevRight" size={18} />
                    </button>
                  ) : (
                    <p className="flex min-h-11 items-center gap-2.5 py-2">{body}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )
      )}

      <TableDisclosure>
        <table className="w-full text-sm">
          <caption className="sr-only">Spending by day in {monthLabel(monthKey)}</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Spent</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) =>
              d.minor > 0 ? (
                <tr key={d.date} className="border-t border-line">
                  <th scope="row" className="py-2 text-left font-normal text-ink-2">
                    {labelOf(d.date)}
                  </th>
                  <td className="py-2 text-right tabular-nums">{money(d.minor)}</td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
      </TableDisclosure>
    </div>
  )
}
