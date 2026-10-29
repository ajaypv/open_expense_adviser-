import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatMoney, formatMoneyCompact } from '../db/money'
import { monthLabel, type MonthKey } from '../insights/aggregates'

interface Props {
  /** Spend per calendar day; index 0 is day 1. */
  values: number[]
  monthKey: MonthKey
  /** Last day that has happened (today's date for the current month, null for a finished month). */
  lastDay: number | null
  currency: string
}

/** Columns of daily spend. Touch or hover a column (or use the arrow keys) to read its day. */
export function DayChart({ values, monthKey, lastDay, currency }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const plot = useRef<HTMLDivElement>(null)
  const elapsed = lastDay ?? values.length
  const max = Math.max(...values, 1)
  const total = values.reduce((a, b) => a + b, 0)
  const average = Math.round(total / Math.max(elapsed, 1))
  const [year, month] = monthKey.split('-').map(Number)

  const dayName = (i: number) =>
    new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(
      new Date(year, month - 1, i + 1),
    )

  function indexAt(e: PointerEvent) {
    const box = plot.current!.getBoundingClientRect()
    const i = Math.floor(((e.clientX - box.left) / box.width) * values.length)
    return Math.min(values.length - 1, Math.max(0, i))
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const step = e.key === 'ArrowRight' ? 1 : -1
    setSelected((s) => Math.min(elapsed - 1, Math.max(0, (s ?? elapsed) + step)))
  }

  const readout =
    selected === null
      ? `${formatMoney(average, currency)} a day on average`
      : `${dayName(selected)}: ${formatMoney(values[selected], currency)}`

  return (
    <div>
      <p aria-live="polite" className="min-h-6 text-[0.9375rem] text-ink-2">
        {readout}
      </p>
      <div
        ref={plot}
        role="group"
        tabIndex={0}
        aria-label={`Daily spending in ${monthLabel(monthKey)}. Use left and right arrow keys to read each day.`}
        onKeyDown={onKeyDown}
        onBlur={() => setSelected(null)}
        onPointerMove={(e) => {
          const i = indexAt(e)
          if (i < elapsed) setSelected(i)
        }}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setSelected(null)}
        onPointerDown={(e) => {
          const i = indexAt(e)
          if (i < elapsed) setSelected((s) => (s === i && e.pointerType !== 'mouse' ? null : i))
        }}
        className="mt-2 flex h-32 touch-pan-y items-end gap-[2px] border-b border-axis"
      >
        {values.map((v, i) => {
          const future = i >= elapsed
          const height = future ? 0 : v === 0 ? 0 : Math.max((v / max) * 100, 3)
          return (
            <div key={i} className="flex h-full flex-1 items-end justify-center">
              {future ? (
                <div className="h-[2px] w-full max-w-6 bg-axis opacity-50" />
              ) : (
                <div
                  className="w-full max-w-6 rounded-t-[4px] transition-opacity duration-150"
                  style={{
                    height: `${height}%`,
                    background: 'var(--s1)',
                    opacity: selected === null || selected === i ? 1 : 0.4,
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-sm text-ink-2" aria-hidden="true">
        <span>1</span>
        <span>{Math.ceil(values.length / 2)}</span>
        <span>{values.length}</span>
      </div>
      <p className="mt-1 text-sm text-ink-2">Highest day {formatMoneyCompact(max === 1 ? 0 : max, currency)}</p>

      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-medium underline underline-offset-2">
          Show as table
        </summary>
        <table className="w-full text-sm">
          <caption className="sr-only">Spending by day in {monthLabel(monthKey)}</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Spent</th>
            </tr>
          </thead>
          <tbody>
            {values.map((v, i) =>
              v > 0 ? (
                <tr key={i} className="border-t border-line">
                  <th scope="row" className="py-2 text-left font-normal text-ink-2">
                    {dayName(i)}
                  </th>
                  <td className="py-2 text-right tabular-nums">{formatMoney(v, currency)}</td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
      </details>
    </div>
  )
}
