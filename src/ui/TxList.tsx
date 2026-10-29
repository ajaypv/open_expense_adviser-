import { memo } from 'react'
import type { Category, Transaction } from '../db/schema'
import { TxRow } from './TxRow'

interface Props {
  rows: Transaction[]
  categoryById: Map<number, Category>
  currency: string
  showDate?: boolean
  showTime?: boolean
  onEdit: (tx: Transaction) => void
}

/**
 * Rows in one rounded card. The card clips its children so a pressed row's highlight follows the
 * corners, and each divider starts after the avatar (4.5rem in) instead of cutting the full width.
 */
export const TxList = memo(function TxList({ rows, categoryById, currency, showDate, showTime, onEdit }: Props) {
  return (
    <ul className="overflow-hidden rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]">
      {rows.map((t) => (
        <li
          key={t.id}
          className="relative [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:left-[4.5rem] [&:not(:first-child)]:before:right-0 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line"
        >
          <TxRow
            tx={t}
            category={categoryById.get(t.categoryId)}
            currency={currency}
            showDate={showDate}
            showTime={showTime}
            onClick={onEdit}
          />
        </li>
      ))}
    </ul>
  )
})
