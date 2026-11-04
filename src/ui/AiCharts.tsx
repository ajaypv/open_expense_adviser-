import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'
import { niceCeil } from '../charts/scale'
import { formatMoney, formatMoneyCompact } from '../db/money'
import type { AiSummary } from '../insights/ai'
import { useCountWhen, useSeen } from './motion'

/** Whether the part of the page around something has come into view yet, so numbers inside it count up only then. */
const Seen = createContext(true)

/**
 * A part of the page that rises into place when it is scrolled to, and holds everything animated inside it (lines,
 * bars, counting numbers) until that moment. Each time the page is opened it is drawn afresh, so each is seen again.
 */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const [watch, seen] = useSeen(0.15)
  return (
    <Seen.Provider value={seen}>
      <div ref={watch} data-seen={seen} className={`when-seen reveal ${className}`} style={{ '--d': `${delay}ms` } as CSSProperties}>
        {children}
      </div>
    </Seen.Provider>
  )
}

/** An amount that counts up from nothing when its part of the page comes into view, and lands exactly on the figure. */
export function CountUp({ minor, currency, delay = 0, compact = false }: { minor: number; currency: string; delay?: number; compact?: boolean }) {
  const play = useContext(Seen)
  const value = useCountWhen(minor, play, delay)
  // Whole units while it runs, so the digits do not flicker with paise; the exact figure when it lands.
  const shown = value === minor ? minor : Math.round(value / 100) * 100
  return <>{compact ? formatMoneyCompact(shown, currency) : formatMoney(shown, currency)}</>
}

const W = 320
const H = 112
const PAD = { l: 6, r: 12, t: 14, b: 18 }
const TICK_DAYS = [1, 8, 15, 22, 29]

/**
 * The month as a line: what has been spent so far, drawn along its length, last month faint behind it for comparison,
 * and, for a month in progress, a dashed run to the end at the recent pace. A dashed red line is the budget. Today is
 * marked with a ring that slowly breathes. What it shows is said in words next to it, so it is never only a picture.
 */
export function TrajectoryChart({ summary, currency }: { summary: AiSummary; currency: string }) {
  const { trajectory: t, days, elapsed } = summary
  const money = (m: number) => formatMoney(m, currency)
  const peak = Math.max(...t.actual.map((v) => v ?? 0), t.projectedMinor ?? 0, t.previous.at(-1) ?? 0, t.budgetMinor ?? 0, 1)
  const yMax = niceCeil(peak)
  const x = (i: number) => PAD.l + (i / Math.max(days - 1, 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b)
  const path = (pts: [number, number][]) => pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)} ${b.toFixed(1)}`).join(' ')

  const actual = t.actual.flatMap((v, i) => (v === null ? [] : [[x(i), y(v)] as [number, number]]))
  const last = actual.at(-1)
  const previous = t.previous.map((v, i) => [x(i), y(v)] as [number, number])
  const base = y(0)
  const end = t.projectedMinor === null ? null : ([x(days - 1), y(t.projectedMinor)] as [number, number])

  const label = `Running total of spending in ${summary.monthName}: ${money(summary.spentMinor)} so far${
    t.projectedMinor !== null ? `, heading for about ${money(t.projectedMinor)} by the end of the month` : ''
  }${t.previous.length ? `. Last month ended at ${money(t.previous.at(-1)!)}` : ''}.`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="mt-1 w-full overflow-visible">
      <line x1={PAD.l} x2={W - PAD.r} y1={y(yMax)} y2={y(yMax)} stroke="var(--line)" strokeWidth="1" />
      <line x1={PAD.l} x2={W - PAD.r} y1={y(yMax / 2)} y2={y(yMax / 2)} stroke="var(--line)" strokeWidth="1" />
      <line x1={PAD.l} x2={W - PAD.r} y1={base} y2={base} stroke="var(--axis, var(--line))" strokeWidth="1" />
      <text x={PAD.l} y={y(yMax) - 4} fontSize="10" fill="var(--ink-2)">
        {formatMoneyCompact(yMax, currency)}
      </text>

      {previous.length > 1 && (
        <path d={path(previous)} fill="none" stroke="var(--other)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" pathLength={1} className="ai-draw" />
      )}

      {t.budgetMinor !== null && (
        <g className="ai-fade" style={{ '--d': '300ms' } as CSSProperties}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t.budgetMinor)} y2={y(t.budgetMinor)} stroke="var(--critical)" strokeWidth="1.5" strokeDasharray="5 4" />
          <text x={W - PAD.r} y={y(t.budgetMinor) - 4} fontSize="10" textAnchor="end" fill="var(--critical-text)">
            budget
          </text>
        </g>
      )}

      {actual.length > 1 && (
        <>
          <path d={`${path(actual)} L${last![0].toFixed(1)} ${base.toFixed(1)} L${x(0).toFixed(1)} ${base.toFixed(1)} Z`} fill="var(--accent)" opacity="0.12" className="ai-fade" style={{ '--d': '700ms' } as CSSProperties} />
          <path d={path(actual)} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="ai-draw" style={{ '--d': '150ms' } as CSSProperties} />
        </>
      )}

      {last && end && (
        <g className="ai-fade" style={{ '--d': '1000ms' } as CSSProperties}>
          <path d={path([last, end])} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
          <circle cx={end[0]} cy={end[1]} r="4" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
        </g>
      )}

      {last && (
        <g className="ai-fade" style={{ '--d': '900ms' } as CSSProperties}>
          <circle cx={last[0]} cy={last[1]} r="4" fill="var(--accent)" className="ai-pulse" />
          <circle cx={last[0]} cy={last[1]} r="4.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
        </g>
      )}

      {TICK_DAYS.filter((d) => d <= days).map((d) => (
        <text key={d} x={x(d - 1)} y={H - 4} fontSize="10" textAnchor="middle" fill={d === elapsed ? 'var(--ink)' : 'var(--ink-2)'}>
          {d}
        </text>
      ))}
    </svg>
  )
}

/**
 * The last five months as columns that grow from the baseline one after another. The month in view is the last; while
 * it is still going it is drawn hatched, since its height is where it is heading, not where it is. Each column has its
 * amount above it and its month below, and is read out as both.
 */
export function MonthBars({ months, currency }: { months: AiSummary['months']; currency: string }) {
  const max = Math.max(...months.map((m) => m.totalMinor), 1)
  return (
    <ul aria-label="Spending by month" className="mt-2 flex h-28 items-end gap-2.5">
      {months.map((m, i) => {
        const height = m.totalMinor === 0 ? 0 : Math.max((m.totalMinor / max) * 100, 4)
        const style: CSSProperties = m.projected
          ? { background: 'repeating-linear-gradient(135deg, var(--accent) 0 3px, transparent 3px 7px)', boxShadow: 'inset 0 0 0 1.5px var(--accent)' }
          : { background: i === months.length - 1 ? 'var(--accent)' : 'color-mix(in oklab, var(--accent) 45%, var(--surface))' }
        return (
          <li key={m.month} aria-label={`${m.label}: ${formatMoney(m.totalMinor, currency)}${m.projected ? ', where it is heading' : ''}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span aria-hidden="true" className="ai-fade mb-0.5 text-[0.6875rem] font-medium tabular-nums text-ink-2" style={{ '--d': `${500 + i * 90}ms` } as CSSProperties}>
              {m.totalMinor === 0 ? '' : formatMoneyCompact(m.totalMinor, currency)}
            </span>
            <span aria-hidden="true" className="flex w-full flex-1 items-end justify-center">
              <span className="ai-bar-up block w-full max-w-9 rounded-t-md" style={{ ...style, height: `${height}%`, '--d': `${i * 90}ms` } as CSSProperties} />
            </span>
            <span aria-hidden="true" className="mt-1 text-xs text-ink-2">
              {m.label}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
