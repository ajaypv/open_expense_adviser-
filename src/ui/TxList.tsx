import { memo } from 'react'
import type { LedgerTx } from '../data/buildLedger'
import type { Account, Category } from '../db/schema'
import { TxRow } from './TxRow'

interface Props {
  rows: LedgerTx[]
  categoryById: Map<number, Category>
  accountById?: Map<number, Account>
  currency: string
  showDate?: boolean
  showTime?: boolean
  onEdit: (tx: LedgerTx) => void
  /** Select mode: a tap ticks a row instead of opening it, and swiping is switched off. */
  selection?: { ids: Set<number>; onToggle: (id: number) => void } | null
  /** Swipe a row left to reveal these. Leave out for a list that doesn't swipe. */
  swipe?: { onCopy: (tx: LedgerTx) => void; onDelete: (tx: LedgerTx) => void }
}

/**
 * Rows in one rounded card. The card clips its children so a pressed row's highlight follows the
 * corners, and each divider starts after the avatar (4.5rem in) instead of cutting the full width.
 *
 * Swiping is plain horizontal scrolling with snap points, not gesture code: the row fills the
 * width and the actions sit just past its right edge. The swipe is a shortcut; Copy and Delete
 * are also in the edit form, which is why the buttons are hidden from screen readers.
 */
export const TxList = memo(function TxList({ rows, categoryById, accountById, currency, showDate, showTime, onEdit, selection, swipe }: Props) {
  return (
    <ul className="overflow-hidden rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]">
      {rows.map((t) => {
        const row = (
          <TxRow
            tx={t}
            category={categoryById.get(t.categoryId)}
            accountById={accountById}
            currency={currency}
            showDate={showDate}
            showTime={showTime}
            selecting={selection != null}
            selected={selection?.ids.has(t.id)}
            onClick={selection ? () => selection.onToggle(t.id) : onEdit}
          />
        )
        return (
          <li
            key={t.id}
            className="relative [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:left-[4.5rem] [&:not(:first-child)]:before:right-0 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line"
          >
            {swipe && !selection ? (
              <div className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
                <div className="w-full shrink-0 snap-start">{row}</div>
                <div className="flex shrink-0 snap-end" aria-hidden="true">
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.currentTarget.parentElement?.parentElement?.scrollTo({ left: 0 })
                      swipe.onCopy(t)
                    }}
                    className="w-20 bg-surface-2 text-sm font-semibold"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => swipe.onDelete(t)}
                    className="w-20 bg-[var(--critical)] text-sm font-semibold text-white"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              row
            )}
          </li>
        )
      })}
    </ul>
  )
})
