import { useMemo, useState } from 'react'
import { formatMoney, formatMoneyCompact, parseLocalDate } from '../db/money'
import type { WeekDay, WeekView } from '../insights/week'
import { Figures } from '../ui/Figures'
import { Icon } from '../ui/Icon'
import { useSeen } from '../ui/motion'
import { niceCeil } from './scale'

interface Props {
  view: WeekView
  currency: string
  /** Opens the expenses of one day, from the button beside its reading. */
  onPickDay?: (date: string) => void
}

/** The height of the columns at their tallest, in px; the amounts sit above them. */
const PLOT = 112

let long: Intl.DateTimeFormat | undefined
let short: Intl.DateTimeFormat | undefined
const longOf = (date: string) => (long ??= new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })).format(parseLocalDate(date))
let brief: Intl.DateTimeFormat | undefined
const briefOf = (date: string) => (brief ??= new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short' })).format(parseLocalDate(date))
const weekdayOf = (date: string) => (short ??= new Intl.DateTimeFormat(undefined, { weekday: 'short' })).format(parseLocalDate(date))

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Seven days of spending as columns, one for each day, the oldest at the left. The columns rise when the chart comes into view; a dashed line
 * marks the average day, today wears the accent colour in full and the other days a softer one, and the biggest day is the tallest. Touch or
 * tab to a day and it lifts, and below the chart it is read out in words: what was spent, how many expenses, and how it sits against the
 * average, with a button to open them. With nothing chosen it is today (or the last day of the week).
 */
export function WeekChart({ view, currency, onPickDay }: Props) {
  const [watch, seen] = useSeen()
  const lastDay = view.days[view.days.length - 1]
  const [picked, setPicked] = useState<string>(view.days.find((d) => d.today)?.date ?? lastDay.date)
  const chosen = view.days.find((d) => d.date === picked) ?? lastDay
  const money = (minor: number) => formatMoney(minor, currency)

  const ceil = useMemo(() => niceCeil(Math.max(view.peak?.minor ?? 0, view.averageMinor, 100)), [view])
  const high = (minor: number) => (minor > 0 ? Math.max(6, Math.round((minor / ceil) * PLOT)) : 0)

  const total = money(view.totalMinor)
  const average = money(view.averageMinor)

  return (
    <div>
      <p className="text-[1.0625rem] leading-[1.6] text-ink-2">
        {view.totalMinor === 0 ? (
          'Nothing spent in these 7 days.'
        ) : (
          <Figures text={`${total} in 7 days · about ${average} a day`} figures={[total, average]} />
        )}
      </p>
      {view.deltaPct !== null && view.totalMinor > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-ink-2">
          {view.deltaPct === 0 ? (
            'The same as the 7 days before.'
          ) : (
            <>
              <span className={`inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-2 pr-2.5 font-medium ${view.deltaPct > 0 ? 'text-critical' : 'text-good'}`}>
                <Icon name={view.deltaPct > 0 ? 'arrowUp' : 'arrowDown'} size={16} />
                {`${Math.abs(view.deltaPct)}% ${view.deltaPct > 0 ? 'more' : 'less'}`}
              </span>
              than the 7 days before
            </>
          )}
        </p>
      )}

      <div ref={watch} role="group" aria-label="Spending day by day, for 7 days" className="mt-5">
        <div className="relative" style={{ height: PLOT + 28 }}>
          {view.averageMinor > 0 && (
            <span
              aria-hidden="true"
              data-average
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-2/50"
              style={{ bottom: Math.round((view.averageMinor / ceil) * PLOT) }}
            />
          )}
          <ul className="absolute inset-0 grid grid-cols-7 gap-2">
            {view.days.map((d) => (
              <Column key={d.date} day={d} high={high(d.minor)} seen={seen} on={d.date === chosen.date} money={money} compact={formatMoneyCompact(d.minor, currency)} onPick={() => setPicked(d.date)} />
            ))}
          </ul>
        </div>
        <ul aria-hidden="true" className="mt-2 grid grid-cols-7 gap-2 text-center">
          {view.days.map((d) => (
            <li key={d.date} className={`text-xs ${d.today ? 'font-semibold text-ink' : 'text-ink-2'}`}>
              <span className="block">{weekdayOf(d.date)}</span>
              <span className={`num mt-0.5 inline-flex min-w-6 items-center justify-center rounded-full px-1 ${d.today ? 'bg-btn text-btn-ink' : ''}`}>{parseLocalDate(d.date).getDate()}</span>
            </li>
          ))}
        </ul>
      </div>

      <div aria-live="polite" data-reading className="mt-5 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
          <Icon name="bars" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold leading-tight">{chosen.today ? 'Today' : briefOf(chosen.date)}</span>
          <span className="block text-[1.0625rem] leading-[1.5] text-ink-2">
            {chosen.minor === 0 ? (
              'Nothing spent'
            ) : (
              <Figures text={`${money(chosen.minor)} · ${plural(chosen.count, 'expense')}`} figures={[money(chosen.minor), String(chosen.count)]} />
            )}
          </span>
        </span>
        {chosen.count > 0 && onPickDay && (
          <button type="button" onClick={() => onPickDay(chosen.date)} className="min-h-11 shrink-0 rounded-full bg-surface px-4 font-medium shadow-[0_0_0_1px_var(--ring)] active:opacity-70">
            See them
          </button>
        )}
      </div>
    </div>
  )
}

function Column({ day, high, seen, on, money, compact, onPick }: { day: WeekDay; high: number; seen: boolean; on: boolean; money: (m: number) => string; compact: string; onPick: () => void }) {
  const spent = money(day.minor)
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onPick}
        aria-pressed={on}
        aria-label={`${longOf(day.date)}: ${day.minor === 0 ? 'nothing spent' : `${spent}, ${plural(day.count, 'expense')}`}`}
        className="flex h-full w-full flex-col items-center justify-end gap-1 rounded-xl outline-offset-2"
      >
        <span aria-hidden="true" className={`num text-[0.6875rem] leading-none ${day.minor === 0 ? 'invisible' : on ? 'text-ink' : 'text-ink-2'}`}>
          {compact}
        </span>
        <span
          aria-hidden="true"
          data-bar={day.date}
          className="block w-full max-w-9 rounded-t-lg rounded-b-sm transition-[height,opacity] duration-700 ease-out motion-reduce:transition-none"
          style={{
            height: seen ? Math.max(high, 4) : 4,
            background: day.minor === 0 ? 'var(--surface-2)' : day.today ? 'var(--accent)' : 'color-mix(in oklab, var(--accent) 58%, var(--surface-2))',
            boxShadow: on ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)' : undefined,
          }}
        />
      </button>
    </li>
  )
}
