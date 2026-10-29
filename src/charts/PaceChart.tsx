import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatMoney, formatMoneyCompact } from '../db/money'

interface Props {
  /** Running total per day for the month being viewed; null after the last elapsed day. */
  current: (number | null)[]
  /** Running total per day for the previous month (a full month). */
  previous: (number | null)[]
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
export function PaceChart({ current, previous, currentLabel, previousLabel, budgetMinor, lastDay, currency }: Props) {
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

      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium underline underline-offset-2">
          Show as table
        </summary>
        <table className="w-full text-sm">
          <caption className="sr-only">
            Running total by day, {currentLabel}
            {hasPrevious ? ` and ${previousLabel}` : ''}
          </caption>
          <thead>
            <tr className="text-left text-ink-2">
              <th scope="col" className="py-2 font-normal">Day</th>
              <th scope="col" className="py-2 text-right font-normal">{currentLabel}</th>
              {hasPrevious && <th scope="col" className="py-2 text-right font-normal">{previousLabel}</th>}
            </tr>
          </thead>
          <tbody>
            {current.slice(0, lastDay).map((v, i) => (
              <tr key={i} className="border-t border-line">
                <th scope="row" className="py-2 text-left font-normal text-ink-2">{i + 1}</th>
                <td className="py-2 text-right tabular-nums">{formatMoney(v ?? 0, currency)}</td>
                {hasPrevious && (
                  <td className="py-2 text-right tabular-nums">
                    {i < previous.length ? formatMoney(previous[i] ?? 0, currency) : 'No data'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
