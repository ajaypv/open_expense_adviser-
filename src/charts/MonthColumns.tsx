import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatMoney } from '../db/money'
import { monthLabel } from '../insights/aggregates'
import type { MonthTotal } from '../insights/trends'
import { TableDisclosure } from './TableDisclosure'

let shortMonth: Intl.DateTimeFormat | undefined
const short = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return (shortMonth ??= new Intl.DateTimeFormat(undefined, { month: 'short' })).format(new Date(y, m - 1, 1))
}

/** One column per month. Touch or hover a column (or use the arrow keys) to read that month. */
export function MonthColumns({ totals, currency }: { totals: MonthTotal[]; currency: string }) {
  const [selected, setSelected] = useState<number | null>(null)
  const plot = useRef<HTMLDivElement>(null)
  const max = Math.max(...totals.map((t) => t.totalMinor), 1)
  const active = totals.filter((t) => t.totalMinor > 0)
  const average = active.length ? Math.round(active.reduce((n, t) => n + t.totalMinor, 0) / active.length) : 0

  function indexAt(e: PointerEvent) {
    const box = plot.current!.getBoundingClientRect()
    return Math.min(totals.length - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * totals.length)))
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const step = e.key === 'ArrowRight' ? 1 : -1
    setSelected((s) => Math.min(totals.length - 1, Math.max(0, (s ?? totals.length) + step)))
  }

  const readout =
    selected === null
      ? `${formatMoney(average, currency)} a month on average`
      : `${monthLabel(totals[selected].month)}: ${formatMoney(totals[selected].totalMinor, currency)}`

  return (
    <div>
      <p aria-live="polite" className="min-h-6 text-[0.9375rem] text-ink-2">
        {readout}
      </p>
      <div
        ref={plot}
        role="group"
        tabIndex={0}
        aria-label="Spending in each of the last months. Use left and right arrow keys to read each month."
        onKeyDown={onKeyDown}
        onBlur={() => setSelected(null)}
        onPointerMove={(e) => setSelected(indexAt(e))}
        onPointerDown={(e) => setSelected((s) => (s === indexAt(e) && e.pointerType !== 'mouse' ? null : indexAt(e)))}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setSelected(null)}
        className="mt-2 flex h-32 touch-pan-y items-end gap-1.5 border-b border-axis"
      >
        {totals.map((t, i) => (
          <div key={t.month} className="flex h-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-6 rounded-t-[4px] transition-opacity duration-150"
              style={{
                height: t.totalMinor === 0 ? '2px' : `${Math.max((t.totalMinor / max) * 100, 3)}%`,
                background: t.totalMinor === 0 ? 'var(--axis)' : 'var(--s1)',
                opacity: selected === null || selected === i ? 1 : 0.4,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-sm text-ink-2" aria-hidden="true">
        <span>{short(totals[0].month)}</span>
        <span>{short(totals[totals.length - 1].month)}</span>
      </div>

      <TableDisclosure>
        <table className="w-full text-sm">
          <caption className="sr-only">Spending by month</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Spent</th>
            </tr>
          </thead>
          <tbody>
            {[...totals].reverse().map((t) => (
              <tr key={t.month} className="border-t border-line">
                <th scope="row" className="py-2 text-left font-normal text-ink-2">
                  {monthLabel(t.month)}
                </th>
                <td className="py-2 text-right tabular-nums">{t.totalMinor === 0 ? '–' : formatMoney(t.totalMinor, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableDisclosure>
    </div>
  )
}
