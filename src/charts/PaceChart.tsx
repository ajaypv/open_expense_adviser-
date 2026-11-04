import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatMoney, formatMoneyCompact } from '../db/money'
import { niceCeil } from './scale'
import { TableDisclosure } from './TableDisclosure'

/** An earlier month, drawn for comparison: a full month of running totals. */
export interface OlderMonth {
  label: string
  series: (number | null)[]
}

interface Props {
  /** Running total per day for the month being viewed; null after the last elapsed day. */
  current: (number | null)[]
  /** Running total per day for the previous month (a full month). */
  previous: (number | null)[]
  /** The months before the previous one, newest first. With any, the chart can compare several months at once. */
  older?: OlderMonth[]
  /** The month in view, YYYY-MM; used to name each weekday in the table. */
  monthKey: string
  currentLabel: string
  previousLabel: string
  budgetMinor: number | null
  /** Last day (1-based) that has data: today for the current month, the month length otherwise. */
  lastDay: number
  currency: string
}

/**
 * Cumulative spend this month against last month, on one axis. The blue line is the month in
 * view; the gray line is the previous month for reference. Touch, hover or arrow keys move a
 * crosshair, and the legend rows double as the readout for the chosen day.
 */
/** How each earlier month's line is dashed, so the months can be told apart by more than shade. */
const DASHES: (string | undefined)[] = [undefined, '6 4', '2 4']

function Swatch({ color, dash }: { color: string; dash: string | undefined }) {
  if (!dash) return <span aria-hidden="true" className="h-0.5 w-5 rounded-full" style={{ background: color }} />
  return (
    <svg aria-hidden="true" width="20" height="2" className="shrink-0">
      <line x1="1" y1="1" x2="19" y2="1" stroke={color} strokeWidth="2" strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  )
}

const listOf = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

export function PaceChart({ current, previous: previousMonth, older = [], monthKey, currentLabel, previousLabel, budgetMinor, lastDay, currency }: Props) {
  const plot = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [range, setRange] = useState<'last' | 'many'>('last')
  const n = current.length
  const previous = previousMonth
  // With no previous month (first month of use) the chart shows only the month in view.
  const hasPrevious = previous.length > 0
  const canCompareMany = hasPrevious && older.length > 0
  const many = canCompareMany && range === 'many'
  // The months drawn behind the one in view: last month, and with "Last 3 months" the ones before it too.
  const compared = hasPrevious ? [{ label: previousLabel, series: previous }, ...(many ? older : [])] : []
  // All lines share one x scale, wide enough for the longest month. Cutting a month short to fit (31 days against
  // 30) would drop its last day, and with it any spending on that day.
  const span = Math.max(n, ...compared.map((c) => c.series.length))
  const day = selected ?? lastDay - 1

  const at = (series: (number | null)[], i: number) => series[Math.min(i, series.length - 1)] ?? 0
  const currentNow = at(current, day)
  const previousNow = at(previous, day)

  const dataMax = Math.max(at(current, lastDay - 1), ...compared.map((c) => at(c.series, c.series.length - 1)), 1)
  const showBudget = budgetMinor !== null && budgetMinor <= dataMax * 1.5
  const yMax = niceCeil(Math.max(dataMax, showBudget ? budgetMinor : 0))

  const x = (i: number) => (span === 1 ? 0 : (i / (span - 1)) * 100)
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
    const i = Math.round(((e.clientX - box.left) / box.width) * (span - 1))
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

  // At rest the question is "where am I against last month?", so this month so far sits beside the whole of last
  // month. Comparing only the first day or two of each (last month's first days may well have been nothing) says
  // nothing useful. Pointing at a day switches to the fair comparison: the same days of both months.
  const whole = selected === null
  const previousTotal = at(previous, previous.length - 1)
  const diff = currentNow - previousNow
  const sameDay =
    diff === 0
      ? `Level with ${previousLabel}`
      : `${formatMoney(Math.abs(diff), currency)} ${diff > 0 ? 'more' : 'less'} than ${previousLabel}`
  const againstWhole =
    previousTotal === 0
      ? `${previousLabel} had no spending.`
      : currentNow === previousTotal
        ? `Level with what ${previousLabel} came to in all`
        : currentNow > previousTotal
          ? `${formatMoney(currentNow - previousTotal, currency)} more than ${previousLabel} came to in all`
          : `${Math.round((currentNow / previousTotal) * 100)}% of what ${previousLabel} came to in all`

  // With several months chosen, this month is set against their average: of the whole months at rest, or of the
  // same days when a day is chosen.
  const valueOf = (c: { series: (number | null)[] }) => (whole ? at(c.series, c.series.length - 1) : at(c.series, day))
  const k = compared.length
  const average = k === 0 ? 0 : Math.round(compared.reduce((sum, c) => sum + valueOf(c), 0) / k)
  const againstAverage =
    average === 0
      ? whole
        ? 'The earlier months had no spending.'
        : `Level with the ${k}-month average`
      : whole
        ? currentNow === average
          ? `Level with a usual month (the average of the last ${k})`
          : currentNow > average
            ? `${formatMoney(currentNow - average, currency)} more than a usual month (the average of the last ${k})`
            : `${Math.round((currentNow / average) * 100)}% of a usual month (the average of the last ${k})`
        : currentNow === average
          ? `Level with the ${k}-month average`
          : `${formatMoney(Math.abs(currentNow - average), currency)} ${currentNow > average ? 'more' : 'less'} than the ${k}-month average by then`
  const comparison = many ? againstAverage : whole ? againstWhole : sameDay

  const lines = [
    { key: 'current', label: whole && hasPrevious ? `${currentLabel} (so far)` : currentLabel, value: currentNow, color: 'var(--accent)', dash: undefined as string | undefined },
    ...compared.map((c, i) => ({
      key: i === 0 ? 'previous' : `older-${i}`,
      label: whole ? `${c.label} (whole month)` : c.label,
      value: valueOf(c),
      color: 'var(--other)',
      dash: DASHES[i],
    })),
  ]

  return (
    <div>
      {canCompareMany && (
        <div role="group" aria-label="Months to compare with" className="mb-3 flex gap-1 rounded-full bg-surface-2 p-1">
          {(
            [
              ['last', 'Last month'],
              ['many', `Last ${older.length + 1} months`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={range === id}
              onClick={() => setRange(id)}
              className={`min-h-11 flex-1 rounded-full px-3 text-sm font-medium transition-colors motion-reduce:transition-none ${range === id ? 'bg-btn text-btn-ink' : 'text-ink-2'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <p className="text-sm text-ink-2">{selected === null ? `Through day ${lastDay}` : `Day ${selected + 1}`}</p>
      <ul className="mt-1.5 space-y-1">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-ink-2">
              <Swatch color={l.color} dash={l.dash} />
              {l.label}
            </span>
            <span className="text-xl font-semibold">{formatMoney(l.value, currency)}</span>
          </li>
        ))}
      </ul>
      {hasPrevious && (
        <>
          <p aria-live="polite" className="mt-1.5 text-[0.9375rem] text-ink-2">
            {comparison}
          </p>
          {/* Beside a chosen day the figure for last month is for that day, which can be nothing yet: this says what it came to. */}
          {!whole && !many && <p className="text-[0.9375rem] text-ink-2">{`${previousLabel} came to ${formatMoney(previousTotal, currency)} in all.`}</p>}
        </>
      )}

      {/* mt-6 leaves room for the top axis label; the container includes the x-axis band below. */}
      <div className="mt-6">
        <div
          ref={plot}
          role="group"
          tabIndex={0}
          aria-label={`Cumulative spending in ${currentLabel}${hasPrevious ? `, against ${listOf(compared.map((c) => c.label))}` : ''}. Use the arrow keys to read each day.`}
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

          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pace-reveal absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <path d={areaPath} fill="var(--accent)" opacity="0.1" />
            {/* Oldest first, so the nearer months and the one in view are drawn on top. */}
            {compared
              .map((c, i) => ({ c, i }))
              .reverse()
              .map(({ c, i }) => (
                <path key={i} d={path(c.series)} fill="none" stroke="var(--other)" strokeWidth="2" strokeDasharray={DASHES[i]} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              ))}
            <path d={currentPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>

          {selected !== null && (
            <div className="absolute inset-y-0 w-px bg-ink-2" style={{ left: `${x(selected)}%` }} aria-hidden="true" />
          )}

          {/* Markers are HTML so they stay round while the SVG stretches. 2px surface ring. */}
          {[
            ...compared.map((c) => ({ v: at(c.series, day), color: 'var(--other)', show: selected !== null })),
            { v: currentNow, color: 'var(--accent)', show: true },
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
          <span>{Math.ceil(span / 2)}</span>
          <span>{span}</span>
        </div>
      </div>

      <TableDisclosure>
        <PaceTable
          current={current}
          previous={previous}
          older={many ? older : undefined}
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
  /** Months before the previous one; each gets a column and a whole-month row. */
  older?: OlderMonth[]
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
export function PaceTable({ current, previous, older = [], lastDay, monthKey, currentLabel, previousLabel, currency }: TableProps) {
  const [showAll, setShowAll] = useState(false)
  const hasPrevious = previous.length > 0
  const [year, month] = monthKey.split('-').map(Number)
  weekdayFormat ??= new Intl.DateTimeFormat(undefined, { weekday: 'short' })

  const rows = Array.from({ length: lastDay }, (_, i) => {
    const total = current[i] ?? 0
    const before = i > 0 ? (current[i - 1] ?? 0) : 0
    const prevTotal = hasPrevious ? (previous[Math.min(i, previous.length - 1)] ?? 0) : null
    const olderTotals = older.map((o) => o.series[Math.min(i, o.series.length - 1)] ?? 0)
    return { day: i + 1, spent: total - before, total, prevTotal, olderTotals, diff: prevTotal === null ? 0 : total - prevTotal }
  }).reverse()

  const shown = showAll ? rows : rows.slice(0, FIRST_ROWS)

  return (
    <div>
      {/* With extra months the columns keep their width and the table scrolls sideways, instead of squeezing the figures. */}
      <div className={older.length > 0 ? 'overflow-x-auto' : undefined}>
      <table className={`w-full text-sm ${older.length > 0 ? 'min-w-[28rem]' : ''}`}>
        <caption className="sr-only">
          Spending by day in {currentLabel}, newest first, with the running total
          {hasPrevious ? ` and the running total for ${listOf([previousLabel, ...older.map((o) => o.label)])}` : ''}
        </caption>
        <thead>
          <tr className="text-left text-xs text-ink-2">
            <th scope="col" className="pb-2 pr-2 font-normal">Day</th>
            <th scope="col" className="pb-2 pr-2 text-right font-normal">That day</th>
            <th scope="col" className="pb-2 pr-2 text-right font-normal">{currentLabel} total</th>
            {hasPrevious && <th scope="col" className={`pb-2 text-right font-normal ${older.length > 0 ? 'pr-2' : ''}`}>{`${previousLabel} by then`}</th>}
            {older.map((o, i) => (
              <th key={o.label} scope="col" className={`pb-2 text-right font-normal ${i < older.length - 1 ? 'pr-2' : ''}`}>{`${o.label} by then`}</th>
            ))}
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
                <td className={`py-2 text-right tabular-nums text-ink-2 ${older.length > 0 ? 'pr-2' : ''}`}>{formatMoney(r.prevTotal ?? 0, currency)}</td>
              )}
              {r.olderTotals.map((v, i) => (
                <td key={older[i].label} className={`py-2 text-right tabular-nums text-ink-2 ${i < older.length - 1 ? 'pr-2' : ''}`}>{formatMoney(v, currency)}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {hasPrevious && (
          <tfoot>
            {[{ label: previousLabel, series: previous }, ...older].map((m) => (
              <tr key={m.label} className="border-t border-line">
                <th scope="row" colSpan={3} className="pr-2 pt-3 text-left text-sm font-medium text-ink-2">
                  {`${m.label}, whole month`}
                </th>
                <td colSpan={1 + older.length} className="pt-3 text-right font-semibold tabular-nums">
                  {formatMoney(m.series[m.series.length - 1] ?? 0, currency)}
                </td>
              </tr>
            ))}
          </tfoot>
        )}
      </table>
      </div>
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
