import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'
import { niceCeil } from '../charts/scale'
import { formatMoney, formatMoneyCompact } from '../db/money'
import type { AiDeductions, AiMonthBar, AiSummary } from '../insights/ai'
import { useCountWhen, useSeen } from './motion'

/** Whether the part of the page around something has come into view yet, so numbers inside it count up only then. */
const Seen = createContext(true)

/**
 * A stretch of the page that holds everything animated inside it (lines, bars, dots, counting numbers) until it is
 * scrolled to, so each plays when the person gets there and not before. It does not move itself: the page stays still and
 * the data is what draws. Each time the page is opened it is drawn afresh, so each is seen again.
 */
export function Scene({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [watch, seen] = useSeen(0.2)
  return (
    <Seen.Provider value={seen}>
      <div ref={watch} data-seen={seen} className={`when-seen ${className}`}>
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

/** A start delay for an animation, passed to the style sheet as a variable. */
const delay = (ms: number): CSSProperties => ({ '--d': `${ms}ms` }) as CSSProperties

const SEGMENTS = {
  everyday: { label: 'Spent so far', style: { background: 'var(--accent)' } },
  autoDone: { label: 'Already left on its own', style: { background: 'color-mix(in oklab, var(--accent) 52%, var(--surface))' } },
  autoDue: {
    label: 'Still to leave on its own',
    style: { background: 'repeating-linear-gradient(135deg, var(--accent) 0 2px, transparent 2px 6px)', boxShadow: 'inset 0 0 0 1.5px var(--accent)' },
  },
  expected: { label: 'Likely to spend', style: { background: 'color-mix(in oklab, var(--accent) 22%, var(--surface-2))' } },
  room: { label: 'Room left in the budget', style: { boxShadow: 'inset 0 0 0 1.5px var(--line)', background: 'transparent' } },
} satisfies Record<string, { label: string; style: CSSProperties }>

/**
 * The whole month as one bar, which is what the page is about. From the left: what you have spent, what has already left
 * on its own (EMIs, autopay, subscriptions), what is still to leave, and what you are likely to spend on top. A line
 * marks the budget and anything past it is struck through; room left under it is an empty outline. Each part is named with
 * its amount underneath, so the colours are never all there is.
 */
export function MonthBar({ bar, currency }: { bar: AiMonthBar; currency: string }) {
  const money = (m: number) => formatMoney(m, currency)
  const parts = [
    { key: 'everyday' as const, minor: bar.everydayMinor },
    { key: 'autoDone' as const, minor: bar.autoDoneMinor },
    { key: 'autoDue' as const, minor: bar.autoDueMinor },
    { key: 'expected' as const, minor: bar.expectedEverydayMinor },
  ].filter((p) => p.minor > 0)
  const room = Math.max(bar.scaleMinor - bar.totalMinor, 0)
  const budgetAt = bar.budgetMinor === null ? null : (bar.budgetMinor / bar.scaleMinor) * 100
  const over = bar.budgetMinor !== null && bar.totalMinor > bar.budgetMinor

  return (
    <div data-testid="month-bar">
      <div aria-hidden="true" className="relative pt-6">
        {budgetAt !== null && (
          <span
            data-testid="budget-marker"
            className="absolute top-0 flex flex-col items-center text-xs font-medium"
            style={{ left: `${budgetAt}%`, transform: budgetAt > 78 ? 'translateX(-100%)' : budgetAt < 22 ? 'none' : 'translateX(-50%)', alignItems: budgetAt > 78 ? 'flex-end' : budgetAt < 22 ? 'flex-start' : 'center' }}
          >
            <span className="mb-0.5 whitespace-nowrap text-ink-2">{`Budget ${formatMoneyCompact(bar.budgetMinor!, currency)}`}</span>
          </span>
        )}
        <div className="relative flex h-14 gap-0.5 overflow-hidden rounded-2xl">
          {parts.map((p, i) => (
            <span key={p.key} data-seg={p.key} className="ai-bar-right block h-full" style={{ flexGrow: p.minor, flexBasis: 0, ...SEGMENTS[p.key].style, ...delay(i * 170) }} />
          ))}
          {room > 0 && <span data-seg="room" className="ai-bar-right block h-full rounded-r-2xl" style={{ flexGrow: room, flexBasis: 0, ...SEGMENTS.room.style, ...delay(parts.length * 170) }} />}
          {over && budgetAt !== null && (
            <span
              data-testid="over-zone"
              className="ai-fade pointer-events-none absolute inset-y-0 right-0"
              style={{ left: `${budgetAt}%`, background: 'repeating-linear-gradient(135deg, color-mix(in oklab, var(--critical) 70%, transparent) 0 2px, transparent 2px 7px)', '--d': '900ms' } as CSSProperties}
            />
          )}
        </div>
        {budgetAt !== null && <span className="pointer-events-none absolute bottom-[-4px] top-5 w-0.5 rounded bg-ink" style={{ left: `calc(${budgetAt}% - 1px)` }} />}
      </div>

      <ul aria-label="What the month is made of" className="mt-3 space-y-1.5">
        {[...parts.map((p) => ({ ...p })), ...(room > 0 ? [{ key: 'room' as const, minor: room }] : [])].map((p) => (
          <li key={p.key} data-legend={p.key} className="flex items-center gap-2.5 text-[0.9375rem]">
            <span aria-hidden="true" className="h-3 w-5 shrink-0 rounded-[4px]" style={SEGMENTS[p.key].style} />
            <span className="min-w-0 flex-1">{SEGMENTS[p.key].label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{money(p.minor)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const TICKS = [1, 8, 15, 22, 29]

/**
 * The month as a line of days with each payment that leaves on its own set where it falls: filled once it has left, a ring
 * while it is still to come (red if it is late), the bigger the amount the bigger the dot. Money that comes in on its own is
 * a small mark above the line. Today is a thin rule. It is a picture; the list under it says every one in words.
 */
export function DeductionTimeline({ deductions, days, elapsed, isCurrent }: { deductions: AiDeductions; days: number; elapsed: number; isCurrent: boolean }) {
  const x = (day: number) => ((Math.min(Math.max(day, 1), days) - 0.5) / days) * 100
  const max = Math.max(...deductions.items.map((i) => i.amountMinor), 1)
  const seenOnDay = new Map<number, number>()
  return (
    <div aria-hidden="true" data-testid="deduction-timeline" className="relative mt-5 h-[4.5rem]">
      <span className="absolute inset-x-0 top-9 h-px bg-axis" />
      {isCurrent && (
        <>
          <span className="absolute top-3 h-12 w-px bg-ink-2" style={{ left: `${x(elapsed)}%` }} />
          <span className="absolute top-0 -translate-x-1/2 text-xs font-medium" style={{ left: `${x(elapsed)}%` }}>
            today
          </span>
        </>
      )}
      {deductions.income.map((m, i) => (
        <span
          key={`in-${i}`}
          data-mark={m.done ? 'income-done' : 'income-due'}
          className="ai-pop absolute top-5 size-2.5 -translate-x-1/2 rotate-45 rounded-[2px]"
          style={{ left: `${x(m.day)}%`, background: m.done ? 'var(--good-text)' : 'transparent', boxShadow: 'inset 0 0 0 1.5px var(--good-text)', '--d': `${i * 90}ms` } as CSSProperties}
        />
      ))}
      {deductions.items.map((d, i) => {
        const size = 10 + Math.round((d.amountMinor / max) * 12)
        // Two on the same day sit a little apart rather than on top of each other.
        const n = seenOnDay.get(d.day) ?? 0
        seenOnDay.set(d.day, n + 1)
        const tone = d.state === 'late' ? 'var(--critical)' : 'var(--accent)'
        return (
          <span
            key={d.key}
            data-mark={d.state}
            className="ai-pop absolute rounded-full"
            style={
              {
                left: `calc(${x(d.day)}% + ${n * (size * 0.7)}px)`,
                top: `calc(2.25rem - ${size / 2}px)`,
                width: size,
                height: size,
                translate: '-50% 0',
                background: d.state === 'done' ? tone : 'var(--surface)',
                boxShadow: d.state === 'done' ? 'none' : `inset 0 0 0 2px ${tone}`,
                '--d': `${150 + i * 90}ms`,
              } as CSSProperties
            }
          />
        )
      })}
      {TICKS.filter((d) => d <= days).map((d) => (
        <span key={d} className="absolute bottom-0 -translate-x-1/2 text-xs text-ink-2" style={{ left: `${x(d)}%` }}>
          {d}
        </span>
      ))}
    </div>
  )
}

/** The share of each of the biggest categories as one bar, in each category's own colour, drawn left to right. */
export function ShareBar({ parts }: { parts: { id: string; color: string; share: number }[] }) {
  return (
    <div aria-hidden="true" data-testid="share-bar" className="flex h-3 gap-0.5 overflow-hidden rounded-full">
      {parts.map((p, i) => (
        <span key={p.id} className="ai-bar-right block h-full" style={{ flexGrow: Math.max(p.share, 1), flexBasis: 0, background: p.color, '--d': `${i * 110}ms` } as CSSProperties} />
      ))}
    </div>
  )
}

const W = 320
const H = 120
const PAD = { l: 6, r: 12, t: 14, b: 18 }
const TICK_DAYS = [1, 8, 15, 22, 29]

/**
 * The month as a line: what has been spent so far, drawn along its length, last month faint behind it for comparison,
 * and, for a month in progress, a dotted run to the end at the recent pace. A dashed red line is the budget. Today is
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
  // Through each payment still to leave, on its day, so the line steps where the money does.
  const ahead = t.projected.flatMap((v, i) => (v === null ? [] : [[x(i), y(v)] as [number, number]]))
  const end = ahead.at(-1)

  const label = `Running total of spending in ${summary.monthName}: ${money(summary.spentMinor)} so far${
    t.projectedMinor !== null ? `, heading for about ${money(t.projectedMinor)} by the end of the month` : ''
  }${t.previous.length ? `. Last month ended at ${money(t.previous.at(-1)!)}` : ''}.`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="mt-2 w-full overflow-visible">
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

      {ahead.length > 1 && end && (
        <g className="ai-fade" style={{ '--d': '1000ms' } as CSSProperties}>
          <path d={path(ahead)} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" strokeLinejoin="round" />
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
    <ul aria-label="Spending by month" className="mt-3 flex h-32 items-end gap-3">
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
