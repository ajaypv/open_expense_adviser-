import type { CSSProperties } from 'react'
import { formatMoney } from '../db/money'
import { useSeen } from '../ui/motion'

export interface BarRow {
  key: string
  label: string
  color: string
  valueMinor: number
  /** Secondary text beside the amount, e.g. "38%" or "3 visits". */
  detail?: string
  onPick?: () => void
}

/**
 * Horizontal bars, largest first. Every bar sits beside its name, amount and detail, because
 * several hues are too light to carry meaning on their own against a light surface.
 * Bars are 8px thick with a flat baseline edge and a 4px rounded data end.
 */
export function BarList({ rows, currency }: { rows: BarRow[]; currency: string }) {
  const max = Math.max(...rows.map((r) => r.valueMinor), 1)
  // The rows arrive when the person can see them, not when the page was drawn.
  const [watch, seen] = useSeen()

  return (
    <ul ref={watch} data-seen={seen} className="when-seen">
      {rows.map((r, i) => {
        // Each row arrives a beat after the one above it; past the tenth they come together.
        const step = { '--d': `${Math.min(i, 9) * 50}ms` } as CSSProperties
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                <span className="truncate">{r.label}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {formatMoney(r.valueMinor, currency)}
                {r.detail && <span className="ml-2 text-ink-2">{r.detail}</span>}
              </span>
            </span>
            <span className="mt-1.5 block h-2 rounded-r-[4px] bg-surface-2">
              <span
                className="bar-grow block h-full rounded-r-[4px] transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.max((r.valueMinor / max) * 100, 2)}%`, background: r.color }}
              />
            </span>
          </>
        )
        return (
          <li key={r.key} className="row-in" style={step}>
            {r.onPick ? (
              <button
                type="button"
                onClick={r.onPick}
                className="block min-h-14 w-full py-2.5 text-left transition-transform active:scale-[0.985] motion-reduce:transition-none"
                aria-label={`${r.label}, ${formatMoney(r.valueMinor, currency)}. Show these expenses`}
              >
                {body}
              </button>
            ) : (
              <div className="py-2.5">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
