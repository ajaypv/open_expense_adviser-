import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatMoney, formatMoneyCompact } from '../db/money'
import { monthLabel } from '../insights/aggregates'
import type { MonthTotal } from '../insights/trends'
import { niceCeil } from './scale'
import { TableDisclosure } from './TableDisclosure'

let shortMonth: Intl.DateTimeFormat | undefined
const short = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return (shortMonth ??= new Intl.DateTimeFormat(undefined, { month: 'short' })).format(new Date(y, m - 1, 1))
}
const monthName = (key: string) => monthLabel(key).split(' ')[0]

/**
 * A month for each pill: a hatched pill whose height is the month's spending, with a short cap line, and the month in
 * view picked out in solid colour with its change from the month before above it. The big figure above the bars is
 * that month's total, with the same change in words, so nothing depends on the colour. Tap a bar, drag a finger along
 * them, hover with a mouse (it is only looked at, not kept) or use the arrow keys.
 */
export function MonthColumns({ totals, currency }: { totals: MonthTotal[]; currency: string }) {
  // A tap or a drag is kept until another is made; a mouse hovering over a bar only looks at it.
  const [picked, setPicked] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const plot = useRef<HTMLDivElement>(null)
  const last = totals.length - 1
  const sel = hover ?? picked ?? last
  const money = (minor: number) => formatMoney(minor, currency)

  const top = Math.max(...totals.map((t) => t.totalMinor), 0)
  const scale = top > 0 ? niceCeil(top) : 100
  const active = totals.filter((t) => t.totalMinor > 0)
  const average = active.length ? Math.round(active.reduce((n, t) => n + t.totalMinor, 0) / active.length) : 0

  const now = totals[sel]
  const before = sel > 0 ? totals[sel - 1] : null
  // The change from the month before: none for the first month, or against a month with nothing in it.
  const change =
    before && before.totalMinor > 0 ? { pct: Math.round(((now.totalMinor - before.totalMinor) / before.totalMinor) * 100), name: monthName(before.month) } : null
  const direction = change === null || change.pct === 0 ? 'level' : change.pct > 0 ? 'up' : 'down'

  function indexAt(e: PointerEvent) {
    const box = plot.current!.getBoundingClientRect()
    if (box.width <= 0) return null
    return Math.min(last, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * totals.length)))
  }

  function onKeyDown(e: KeyboardEvent) {
    const moves: Record<string, (s: number) => number> = {
      ArrowLeft: (s) => s - 1,
      ArrowRight: (s) => s + 1,
      Home: () => 0,
      End: () => last,
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    setPicked(Math.min(last, Math.max(0, move(sel))))
  }

  const pill = (testId: string, className: string) =>
    change && (
      <span
        data-testid={testId}
        aria-label={direction === 'level' ? undefined : `${direction === 'up' ? 'Up' : 'Down'} ${Math.abs(change.pct)}% on ${change.name}`}
        className={className}
      >
        {direction === 'level' ? 'No change' : `${direction === 'up' ? '▲' : '▼'} ${Math.abs(change.pct)}%`}
      </span>
    )

  return (
    <div>
      <div aria-live="polite" aria-atomic="true">
        <p className="text-sm text-ink-2">{monthLabel(now.month)}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span data-testid="month-total" className="text-[clamp(1.75rem,8vw,2.25rem)] font-semibold leading-tight tracking-tight tabular-nums">
            {money(now.totalMinor)}
          </span>
          {pill(
            'month-change',
            `inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-sm font-semibold ${direction === 'up' ? 'text-critical' : direction === 'down' ? 'text-good' : 'text-ink-2'}`,
          )}
        </div>
        {before &&
          (before.totalMinor > 0 ? (
            <p className="mt-0.5 text-sm text-ink-2">{`vs ${money(before.totalMinor)} in ${monthName(before.month)}`}</p>
          ) : (
            <p className="mt-0.5 text-sm text-ink-2">{`Nothing was spent in ${monthName(before.month)}`}</p>
          ))}
        <p className="mt-0.5 text-sm text-ink-2">{`${money(average)} a month on average`}</p>
      </div>

      <div className="mt-5 flex gap-2">
        <div data-testid="month-axis" aria-hidden="true" className="flex h-44 w-10 shrink-0 flex-col justify-between text-right text-[0.6875rem] leading-none text-ink-2">
          <span>{formatMoneyCompact(scale, currency)}</span>
          <span>{formatMoneyCompact(scale / 2, currency)}</span>
          <span>{formatMoneyCompact(0, currency)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div
            ref={plot}
            role="group"
            tabIndex={0}
            aria-label="Spending in each of the last months. Use left and right arrow keys to read each month."
            onKeyDown={onKeyDown}
            onPointerMove={(e) => {
              const i = indexAt(e)
              if (i === null) return
              if (e.pointerType === 'mouse') setHover(i)
              else setPicked(i)
            }}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
            className="relative flex h-44 touch-pan-y items-stretch gap-1.5"
          >
            {/* Hairlines at the top, the middle and the bottom of the scale. */}
            {[0, 50, 100].map((p) => (
              <div key={p} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-line" style={{ top: `${p}%` }} />
            ))}
            {totals.map((t, i) => {
              const on = i === sel
              const quiet = t.totalMinor === 0
              return (
                <button
                  key={t.month}
                  type="button"
                  tabIndex={-1}
                  aria-pressed={i === sel}
                  aria-label={`${monthLabel(t.month)}, ${quiet ? 'nothing spent' : money(t.totalMinor)}`}
                  onClick={() => setPicked(i)}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(i)}
                  className="relative h-full min-w-0 flex-1 rounded-xl"
                >
                  <span
                    className={`pill-bar${on ? ' pill-bar-selected' : ''}${quiet ? ' pill-bar-quiet' : ''}`}
                    style={{ height: quiet ? '3px' : `${Math.max((t.totalMinor / scale) * 100, 4)}%` }}
                  />
                  {on && change && (
                    <span
                      data-testid="bar-badge"
                      aria-hidden="true"
                      className="absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-btn px-2 py-0.5 text-xs font-semibold text-btn-ink shadow-[0_0_0_2px_var(--surface)]"
                      style={{ bottom: `calc(${quiet ? '3px' : `${Math.max((t.totalMinor / scale) * 100, 4)}%`} + 6px)` }}
                    >
                      {direction === 'level' ? '=' : `${direction === 'up' ? '▲' : '▼'} ${Math.abs(change.pct)}%`}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div data-testid="month-labels" aria-hidden="true" className="mt-2 grid gap-1.5 text-center text-[0.6875rem] leading-none text-ink-2" style={{ gridTemplateColumns: `repeat(${totals.length}, minmax(0, 1fr))` }}>
            {totals.map((t, i) => (
              <span key={t.month} className={i === sel ? 'font-semibold text-ink' : undefined}>
                {short(t.month)}
              </span>
            ))}
          </div>
        </div>
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
                <td className="py-2 text-right tabular-nums">{t.totalMinor === 0 ? '–' : money(t.totalMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableDisclosure>
    </div>
  )
}
