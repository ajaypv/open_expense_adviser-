import { formatMoney, parseLocalDate } from '../db/money'
import type { Category, Transaction } from '../db/schema'

interface Props {
  tx: Transaction
  category: Category | undefined
  currency: string
  /** Show the date under the amount (not needed when rows are grouped by day). */
  showDate?: boolean
  onClick: (tx: Transaction) => void
}

const shortDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(parseLocalDate(date))

export function TxRow({ tx, category, currency, showDate, onClick }: Props) {
  const received = tx.kind === 'income'
  const title = tx.merchant || category?.name || (received ? 'Income' : 'Expense')
  const color = category?.color ?? 'var(--other)'
  return (
    <button
      type="button"
      onClick={() => onClick(tx)}
      className="flex min-h-16 w-full items-center gap-3 py-2 text-left"
      aria-label={`Edit ${received ? 'received' : 'sent'} ${title}, ${formatMoney(tx.amountMinor, currency)}`}
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full font-semibold"
        style={{ background: `color-mix(in oklab, ${color} 22%, var(--surface))` }}
      >
        {title.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="flex items-center gap-1.5 text-sm text-ink-2">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ background: color }}
          />
          <span className="truncate">{category?.name ?? 'Uncategorised'}</span>
        </span>
      </span>
      <span className="shrink-0 text-right">
        {/* Received money gets a leading + (and the green text token), so it isn't marked by color alone. */}
        <span className={`block font-semibold tabular-nums ${received ? 'text-good' : ''}`}>
          {received ? '+' : ''}
          {formatMoney(tx.amountMinor, currency)}
        </span>
        {showDate && <span className="block text-sm text-ink-2">{shortDate(tx.date)}</span>}
      </span>
    </button>
  )
}
