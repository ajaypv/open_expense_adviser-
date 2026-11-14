import { useMemo, useState } from 'react'
import { DayChart } from '../charts/DayChart'
import { WeekChart } from '../charts/WeekChart'
import { localDateString, parseLocalDate } from '../db/money'
import type { Category, Transaction } from '../db/schema'
import { monthLabel } from '../insights/aggregates'
import { shiftWeek, weekEndFor, weekView } from '../insights/week'
import { Dialog } from './Dialog'
import { Icon } from './Icon'

interface Props {
  open: boolean
  onClose: () => void
  /** All the money sent, in the main currency: a week can reach back into the month before. */
  expenses: Transaction[]
  /** Money sent in the month in view, for the month's chart. */
  monthTxs: Transaction[]
  categoryById: Map<number, Category>
  /** The month in view (YYYY-MM). */
  month: string
  today: Date
  currency: string
  budgetMinor: number | null
  /** Opens the expenses of one day, which closes this first. */
  onPickDay: (date: string) => void
}

type Graph = 'week' | 'month'

let rangeFormat: Intl.DateTimeFormat | undefined
const dayMonth = (date: string) => (rangeFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(parseLocalDate(date))

/**
 * What the spending card on Home opens: the same money as a graph, a week first and the month if asked. The week is seven columns, one a day,
 * for the last seven days (or the last seven of a month that is over), with arrows to go back a week at a time; the month is the same day by
 * day chart that Home shows, with its average, budget line and each day's categories. A switch at the top changes between them, and the one
 * chosen is the one it opens on next time while the app stays open.
 */
export function SpendingGraphSheet({ open, onClose, expenses, monthTxs, categoryById, month, today, currency, budgetMinor, onPickDay }: Props) {
  const [graph, setGraph] = useState<Graph>('week')
  // How many weeks back from the end of the month in view.
  const [back, setBack] = useState(0)
  const end = useMemo(() => shiftWeek(weekEndFor(month, today), -back), [month, today, back])
  const view = useMemo(() => weekView(expenses, end, today), [expenses, end, today])
  const earliest = useMemo(() => expenses.reduce((m, t) => (t.date < m ? t.date : m), '9999-99-99'), [expenses])
  const isCurrent = month === localDateString(today).slice(0, 7)
  const atNow = back === 0
  const canGoBack = view.from > earliest
  const monthName = monthLabel(month)

  const label = atNow && isCurrent ? 'Last 7 days' : `${dayMonth(view.from)} to ${dayMonth(view.to)}`
  const pick = (date: string) => {
    onClose()
    onPickDay(date)
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="spend-graph-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="spend-graph-title" className="type-title">
          Spending
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
          <Icon name="close" />
        </button>
      </div>

      <div role="radiogroup" aria-label="Graph" className="mt-3 grid grid-cols-2 gap-1 rounded-[1.75rem] bg-surface-2 p-1">
        {(['week', 'month'] as const).map((g) => (
          <label
            key={g}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-full text-sm font-medium has-[:checked]:bg-btn has-[:checked]:text-btn-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
          >
            <input type="radio" name="spend-graph" className="sr-only" checked={graph === g} onChange={() => setGraph(g)} />
            {g === 'week' ? 'Week' : 'Month'}
          </label>
        ))}
      </div>

      {graph === 'week' ? (
        <section aria-label="Week" className="mt-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="type-title text-[1.25rem]">{label}</p>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setBack((b) => b + 1)}
                disabled={!canGoBack}
                aria-label="The week before"
                className="flex size-11 items-center justify-center rounded-full bg-surface-2 active:opacity-70 disabled:opacity-35"
              >
                <Icon name="chevLeft" size={20} />
              </button>
              <button
                type="button"
                onClick={() => setBack((b) => Math.max(0, b - 1))}
                disabled={atNow}
                aria-label="The week after"
                className="flex size-11 items-center justify-center rounded-full bg-surface-2 active:opacity-70 disabled:opacity-35"
              >
                <Icon name="chevRight" size={20} />
              </button>
            </div>
          </div>
          {/* Keyed by the week, so each week's columns rise afresh and a day chosen in one does not carry to the next. */}
          <WeekChart key={view.to} view={view} currency={currency} onPickDay={pick} />
        </section>
      ) : (
        <section aria-label="Month" className="mt-5">
          <p className="type-title mb-4 text-[1.25rem]">{monthName}</p>
          <DayChart
            key={month}
            txs={monthTxs}
            categoryById={categoryById}
            monthKey={month}
            lastDay={isCurrent ? today.getDate() : null}
            currency={currency}
            budgetMinor={budgetMinor}
            onPickDay={pick}
          />
        </section>
      )}
    </Dialog>
  )
}
