import { useEffect, useRef } from 'react'
import { formatMoney, formatMoneyCompact } from '../db/money'
import { monthLabel, type MonthKey } from '../insights/aggregates'

export interface StripMonth {
  key: MonthKey
  /** What was spent in the month, in minor units; zero for a quiet month. */
  totalMinor: number
}

interface Props {
  /** Oldest first. */
  months: StripMonth[]
  selected: MonthKey
  currency: string
  onSelect: (month: MonthKey) => void
}

// Building an Intl formatter is slow, so it is made once, the first time the strip is drawn.
let shortMonth: Intl.DateTimeFormat | undefined
const shortName = (key: MonthKey) => {
  const [y, m] = key.split('-').map(Number)
  return (shortMonth ??= new Intl.DateTimeFormat(undefined, { month: 'short' })).format(new Date(y, m - 1, 1))
}

/**
 * A row of months to swipe along: each shows what it came to, and a tap moves the screen to it. It scrolls
 * sideways with a finger or the wheel, snaps month by month, and keeps the chosen one in view. The year is
 * shown only on months from another year than the chosen one.
 */
export function MonthStrip({ months, selected, currency, onSelect }: Props) {
  const row = useRef<HTMLDivElement>(null)
  const chosen = useRef<HTMLButtonElement>(null)
  const shown = useRef(false)

  // Bring the chosen month to the middle of the row, along the row only so the page itself never jumps. It glides
  // when the month changes, but is simply there the first time the row is drawn.
  useEffect(() => {
    const box = row.current
    const chip = chosen.current
    if (!box || !chip) return
    const left = chip.offsetLeft - (box.clientWidth - chip.clientWidth) / 2
    const calm = !shown.current || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    shown.current = true
    if (typeof box.scrollTo === 'function') box.scrollTo({ left, behavior: calm ? 'auto' : 'smooth' })
    else box.scrollLeft = left
  }, [selected])

  if (months.length === 0) return null
  const year = selected.slice(0, 4)

  return (
    <div
      ref={row}
      role="group"
      aria-label="Choose the month to look at"
      className="-mx-4 mb-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {months.map((m) => {
        const on = m.key === selected
        const label = `${shortName(m.key)}${m.key.slice(0, 4) === year ? '' : ` ${m.key.slice(2, 4)}`}`
        return (
          <button
            key={m.key}
            ref={on ? chosen : undefined}
            type="button"
            aria-pressed={on}
            aria-label={`${monthLabel(m.key)}, ${m.totalMinor > 0 ? formatMoney(m.totalMinor, currency) : 'nothing spent'}`}
            onClick={() => !on && onSelect(m.key)}
            className={`flex min-h-11 shrink-0 snap-center flex-col items-center justify-center rounded-2xl px-3.5 py-1 transition-colors motion-reduce:transition-none ${
              on ? 'bg-btn text-btn-ink' : 'bg-surface-2 text-ink [@media(hover:hover)]:hover:bg-line'
            }`}
          >
            <span className="text-sm font-semibold leading-tight">{label}</span>
            <span className={`text-xs leading-tight tabular-nums ${on ? 'opacity-80' : 'text-ink-2'}`}>
              {m.totalMinor > 0 ? formatMoneyCompact(m.totalMinor, currency) : '–'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
