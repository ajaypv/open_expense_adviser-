import { useState } from 'react'
import { monthLabel, shiftMonth, type MonthKey } from '../insights/aggregates'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { useSwipe } from './useSwipe'

interface Props {
  month: MonthKey
  currentMonth: MonthKey
  onChange: (month: MonthKey) => void
  /** Months that have at least one transaction; they get a dot in the picker. */
  activeMonths?: Set<MonthKey>
}

// Building an Intl formatter is slow, so it is made once, the first time the picker is drawn.
let shortMonth: Intl.DateTimeFormat | undefined
const shortName = (index: number) =>
  (shortMonth ??= new Intl.DateTimeFormat(undefined, { month: 'short' })).format(new Date(2026, index, 1))

const arrow = 'flex size-11 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-30'

/**
 * Previous and next month arrows, and a month name that opens a picker so any month is two taps away.
 * A way back to this month shows whenever another month is on screen. Swiping along this row moves a month too (to the
 * right for the one before, to the left for the one after, when there is one): the rest of the page keeps its sideways swipe
 * for the Timeline.
 */
export function MonthSwitcher({ month, currentMonth, onChange, activeMonths }: Props) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => Number(month.slice(0, 4)))
  const atCurrent = month >= currentMonth
  const currentYear = Number(currentMonth.slice(0, 4))
  // Back as far as there is something to look at (or the year being viewed), never into the future.
  let firstYear = Math.min(currentYear, Number(month.slice(0, 4)))
  for (const m of activeMonths ?? []) firstYear = Math.min(firstYear, Number(m.slice(0, 4)))

  const swipe = useSwipe({ onRight: () => onChange(shiftMonth(month, -1)), onLeft: atCurrent ? undefined : () => onChange(shiftMonth(month, 1)) })

  const pick = (key: MonthKey) => {
    onChange(key)
    setOpen(false)
  }

  return (
    <div className="py-1">
      <div role="group" aria-label="Month" {...swipe} className="flex touch-pan-y items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setYear(Number(month.slice(0, 4)))
            setOpen(true)
          }}
          aria-haspopup="dialog"
          aria-label={`${monthLabel(month)}. Choose a month`}
          className="-ml-3 flex min-h-11 min-w-0 items-center gap-1.5 rounded-full px-3 text-lg font-semibold tracking-tight hover:bg-surface-2"
        >
          <span className="truncate">{monthLabel(month)}</span>
          <Icon name="chevDown" size={16} />
        </button>
        <div className="flex shrink-0 items-center rounded-full bg-surface shadow-[0_0_0_1px_var(--ring)]">
          <button type="button" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month" className={arrow}>
            <Icon name="chevLeft" />
          </button>
          <span aria-hidden="true" className="h-5 w-px bg-line" />
          <button type="button" onClick={() => onChange(shiftMonth(month, 1))} disabled={atCurrent} aria-label="Next month" className={arrow}>
            <Icon name="chevRight" />
          </button>
        </div>
      </div>

      {!atCurrent && (
        <div className="flex justify-center">
          <button type="button" onClick={() => onChange(currentMonth)} className="min-h-11 rounded-full px-4 text-sm font-medium underline underline-offset-2">
            This month
          </button>
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} labelledBy="month-picker-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="month-picker-title" className="text-xl font-semibold">
            Choose a month
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <Icon name="close" />
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => setYear((y) => y - 1)} disabled={year <= firstYear} aria-label="Previous year" className={arrow}>
            <Icon name="chevLeft" />
          </button>
          <p className="text-lg font-semibold tabular-nums" aria-live="polite">
            {year}
          </p>
          <button type="button" onClick={() => setYear((y) => y + 1)} disabled={year >= currentYear} aria-label="Next year" className={arrow}>
            <Icon name="chevRight" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 12 }, (_, i) => {
            const key: MonthKey = `${year}-${String(i + 1).padStart(2, '0')}`
            const has = activeMonths?.has(key) ?? false
            return (
              <button
                key={key}
                type="button"
                onClick={() => pick(key)}
                aria-pressed={key === month}
                disabled={key > currentMonth}
                aria-label={`${monthLabel(key)}${has ? ', has transactions' : ''}`}
                className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl bg-surface-2 font-medium disabled:opacity-30 aria-pressed:bg-btn aria-pressed:text-btn-ink"
              >
                {shortName(i)}
                <span aria-hidden="true" className={`size-1.5 rounded-full ${has ? 'bg-current opacity-60' : ''}`} />
              </button>
            )
          })}
        </div>
      </Dialog>
    </div>
  )
}
