import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatMoney, formatMoneyCompact } from '../db/money'
import { TableDisclosure } from './TableDisclosure'

interface Props {
  /** Running total per day for the month being viewed; null after the last elapsed day. */
  current: (number | null)[]
  /** Running total per day for the previous month (a full month). */
  previous: (number | null)[]
  /** The month in view, YYYY-MM; used to name each weekday in the table. */
  monthKey: string
  currentLabel: string
  previousLabel: string
  budgetMinor: number | null
  /** Last day (1-based) that has data: today for the current month, the month length otherwise. */
  lastDay: number
  currency: string
}

/** Rounds up to a tidy axis maximum (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10 × a power of ten). */
function niceCeil(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value))
  const m = value / power
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => m <= s) ?? 10
  return step * power
}

/**
 * Cumulative spend this month against last month, on one axis. The blue line is the month in
 * view; the gray line is the previous month for reference. Touch, hover or arrow keys move a
 * crosshair, and the legend rows double as the readout for the chosen day.
 */
export function PaceChart({ current, previous, monthKey, currentLabel, previousLabel, budgetMinor, lastDay, currency }: Props) {
  const plot = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const n = current.length
  const day = selected ?? lastDay - 1
  // With no previous month (first month of use) the chart shows only the month in view.
  const hasPrevious = previous.length > 0

  const at = (series: (number | null)[], i: number) => series[Math.min(i, series.length - 1)] ?? 0
  const currentNow = at(current, day)
  const previousNow = at(previous, day)

  const dataMax = Math.max(at(current, lastDay - 1), at(previous, previous.length - 1), 1)
  const showBudget = budgetMinor !== null && budgetMinor <= dataMax * 1.5
  const yMax = niceCeil(Math.max(dataMax, showBudget ? budgetMinor : 0))

  const x = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * 100)
  const y = (v: number) => 100 - (v / yMax) * 100
  const path = (series: (number | null)[]) =>
    series
      .flatMap((v, i) => (v === null ? [] : [`${x(i).toFixed(2)} ${y(v).toFixed(2)}`]))
      .map((p, k) => `${k ? 'L' : 'M'}${p}`)
      .join(' ')

  const currentPath = path(current)
  const areaPath = `${currentPath} L${x(lastDay - 1).toFixed(2)} 100 L0 100 Z`

  function indexAt(e: PointerEvent) {
    const box = plot.current!.getBoundingClientRect()
    const i = Math.round(((e.clientX - box.left) / box.width) * (n - 1))
    return Math.min(lastDay - 1, Math.max(0, i))
  }

  function onKeyDown(e: KeyboardEvent) {
    const moves: Record<string, (s: number) => number> = {
      ArrowLeft: (s) => s - 1,
      ArrowRight: (s) => s + 1,
      Home: () => 0,
      End: () => lastDay - 1,
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    setSelected((s) => Math.min(lastDay - 1, Math.max(0, move(s ?? lastDay - 1))))
  }

  const diff = currentNow - previousNow
  const comparison =
    diff === 0
      ? `Level with ${previousLabel}`
      : `${formatMoney(Math.abs(diff), currency)} ${diff > 0 ? 'more' : 'less'} than ${previousLabel}`

  const lines = [
    { key: 'current', label: currentLabel, value: currentNow, color: 'var(--s1)' },
    ...(hasPrevious ? [{ key: 'previous', label: previousLabel, value: previousNow, color: 'var(--other)' }] : []),
  ]

  return (
    <div>
      <p className="text-sm text-ink-2">{selected === null ? `Through day ${lastDay}` : `Day ${selected + 1}`}</p>
      <ul className="mt-1.5 space-y-1">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-ink-2">
              <span aria-hidden="true" className="h-0.5 w-5 rounded-full" style={{ background: l.color }} />
              {l.label}
            </span>
            <span className="text-xl font-semibold">{formatMoney(l.value, currency)}</span>
          </li>
        ))}
      </ul>
      {hasPrevious && (
        <p aria-live="polite" className="mt-1.5 text-[0.9375rem] text-ink-2">
          {comparison}
        </p>
      )}

      {/* mt-6 leaves room for the top axis label; the container includes the x-axis band below. */}
      <div className="mt-6">
        <div
          ref={plot}
          role="group"
          tabIndex={0}
          aria-label={`Cumulative spending in ${currentLabel}${hasPrevious ? `, against ${previousLabel}` : ''}. Use the arrow keys to read each day.`}
          onKeyDown={onKeyDown}
          onBlur={() => setSelected(null)}
          onPointerMove={(e) => setSelected(indexAt(e))}
          onPointerDown={(e) => setSelected(indexAt(e))}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setSelected(null)}
          className="relative h-44 touch-pan-y border-b border-axis"
        >
          {/* Hairline gridlines with their value labels sitting just above the line. */}
          {[0, 50].map((top) => (
            <div key={top} className="absolute inset-x-0 border-t border-line" style={{ top: `${top}%` }}>
              <span className="absolute left-0 -translate-y-full pb-0.5 text-xs text-ink-2">
                {formatMoneyCompact(top === 0 ? yMax : yMax / 2, currency)}
              </span>
            </div>
          ))}

          {showBudget && (
            <div className="absolute inset-x-0 border-t border-ink-2" style={{ top: `${y(budgetMinor)}%` }}>
              <span className="absolute right-0 -translate-y-full pb-0.5 text-xs text-ink-2">
                Budget {formatMoneyCompact(budgetMinor, currency)}
              </span>
            </div>
          )}

          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <path d={areaPath} fill="var(--s1)" opacity="0.1" />
            {hasPrevious && (
              <path d={path(previous)} fill="none" stroke="var(--other)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            )}
            <path d={currentPath} fill="none" stroke="var(--s1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>

          {selected !== null && (
            <div className="absolute inset-y-0 w-px bg-ink-2" style={{ left: `${x(selected)}%` }} aria-hidden="true" />
          )}

          {/* Markers are HTML so they stay round while the SVG stretches. 2px surface ring. */}
          {[
            { v: previousNow, color: 'var(--other)', show: selected !== null && hasPrevious },
            { v: currentNow, color: 'var(--s1)', show: true },
          ].map(
            (m, k) =>
              m.show && (
                <span
                  key={k}
                  aria-hidden="true"
                  className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${x(day)}%`,
                    top: `${y(m.v)}%`,
                    background: m.color,
                    boxShadow: '0 0 0 2px var(--surface)',
                  }}
                />
              ),
          )}
        </div>
        <div className="mt-1.5 flex justify-between text-sm text-ink-2" aria-hidden="true">
          <span>1</span>
          <span>{Math.ceil(n / 2)}</span>
          <span>{n}</span>
        </div>
      </div>

      <TableDisclosure>
        <PaceTable
          current={current}
          previous={previous}
          lastDay={lastDay}
          monthKey={monthKey}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          currency={currency}
        />
      </TableDisclosure>
    </div>
  )
}

const FIRST_ROWS = 10

// Building an Intl formatter is slow, so make it once and only when the table is first opened.
let weekdayFormat: Intl.DateTimeFormat | undefined

interface TableProps {
  current: (number | null)[]
  previous: (number | null)[]
  lastDay: number
  monthKey: string
  currentLabel: string
  previousLabel: string
  currency: string
}

/**
 * The chart's data, one row per day, newest first. Each row gives what was spent that day and
 * the running total, and sets that total against the same day last month in words ("more" or
 * "less"), so the comparison never depends on colour alone.
 */
export function PaceTable({ current, previous, lastDay, monthKey, currentLabel, previousLabel, currency }: TableProps) {
  const [showAll, setShowAll] = useState(false)
  const hasPrevious = previous.length > 0
  const [year, month] = monthKey.split('-').map(Number)
  weekdayFormat ??= new Intl.DateTimeFormat(undefined, { weekday: 'short' })

  const rows = Array.from({ length: lastDay }, (_, i) => {
    const total = current[i] ?? 0
    const before = i > 0 ? (current[i - 1] ?? 0) : 0
    const prevTotal = hasPrevious ? (previous[Math.min(i, previous.length - 1)] ?? 0) : null
    return { day: i + 1, spent: total - before, total, prevTotal, diff: prevTotal === null ? 0 : total - prevTotal }
  }).reverse()

  const shown = showAll ? rows : rows.slice(0, FIRST_ROWS)

  return (
    <div>
      <table className="w-full text-sm">
        <caption className="sr-only">
          Spending by day in {currentLabel}, newest first, with the running total
          {hasPrevious ? ` and the running total for ${previousLabel}` : ''}
        </caption>
        <thead>
          <tr className="text-left text-xs text-ink-2">
            <th scope="col" className="pb-2 pr-2 font-normal">Day</th>
            <th scope="col" className="pb-2 pr-2 text-right font-normal">That day</th>
            <th scope="col" className="pb-2 pr-2 text-right font-normal">{currentLabel} total</th>
            {hasPrevious && <th scope="col" className="pb-2 text-right font-normal">{previousLabel} total</th>}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.day} className="border-t border-line align-top">
              <th scope="row" className="whitespace-nowrap py-2 pr-2 text-left font-normal">
                <span className="font-medium">{r.day}</span>{' '}
                <span className="text-ink-2">{weekdayFormat!.format(new Date(year, month - 1, r.day))}</span>
              </th>
              <td className={`py-2 pr-2 text-right tabular-nums ${r.spent === 0 ? 'text-ink-2' : ''}`}>
                {r.spent === 0 ? '–' : formatMoney(r.spent, currency)}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">
                <span className="block font-medium">{formatMoney(r.total, currency)}</span>
                {hasPrevious && r.diff !== 0 && (
                  <span className={`block text-xs ${r.diff > 0 ? 'text-critical' : 'text-good'}`}>
                    {formatMoney(Math.abs(r.diff), currency)} {r.diff > 0 ? 'more' : 'less'}
                  </span>
                )}
              </td>
              {hasPrevious && (
                <td className="py-2 text-right tabular-nums text-ink-2">{formatMoney(r.prevTotal ?? 0, currency)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > FIRST_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 min-h-11 w-full rounded-full bg-surface-2 font-medium"
        >
          {showAll ? 'Show fewer days' : `Show all ${rows.length} days`}
        </button>
      )}
    </div>
  )
}
