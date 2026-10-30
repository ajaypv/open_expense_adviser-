import { memo } from 'react'
import type { LedgerTx } from '../data/buildLedger'
import { useDisplay } from '../data/display'
import { formatMoney, localDateString, parseLocalDate } from '../db/money'
import type { Account, Category } from '../db/schema'
import { Icon } from './Icon'

interface Props {
  tx: LedgerTx
  category: Category | undefined
  /** The main currency; amounts recorded in another one are shown as paid, with this beneath. */
  currency: string
  /** Names for a transfer's two accounts. */
  accountById?: Map<number, Account>
  /** Show the date under the amount (not needed when rows are grouped by day). */
  showDate?: boolean
  /** Show the time under the amount, when it is known to be the time of the transaction itself. */
  showTime?: boolean
  /** In select mode a tap ticks the row instead of opening it. */
  selecting?: boolean
  selected?: boolean
  onClick: (tx: LedgerTx) => void
}

// Intl formatters are slow to build, so each is made once, on first use, and shared by every row.
let dateFormat: Intl.DateTimeFormat | undefined
let timeFormat: Intl.DateTimeFormat | undefined

const shortDate = (date: string) =>
  (dateFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(parseLocalDate(date))

/**
 * The moment of entry stands in for the time of the transaction, which is only right when it
 * was logged on the day it is dated. A backdated entry has no meaningful time, so none is shown.
 */
function timeOf(tx: LedgerTx): string | null {
  if (localDateString(new Date(tx.createdAt)) !== tx.date) return null
  return (timeFormat ??= new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })).format(tx.createdAt)
}

export const TxRow = memo(function TxRow({ tx, category, currency, accountById, showDate, showTime, selecting, selected, onClick }: Props) {
  useDisplay() // amounts are masked or regrouped by display settings, so redraw when they change
  const received = tx.kind === 'income'
  const transfer = tx.kind === 'transfer'
  const categoryName = category?.name ?? 'Uncategorised'
  const route = transfer
    ? `${accountById?.get(tx.accountId ?? -1)?.name ?? 'Account'} to ${accountById?.get(tx.toAccountId ?? -1)?.name ?? 'account'}`
    : null
  const title = transfer ? 'Transfer' : tx.merchant || category?.name || (received ? 'Income' : 'Expense')
  const color = category?.color ?? 'var(--other)'
  // When the title is already the category (no merchant given), don't say it twice.
  const showCategory = !transfer && title !== categoryName
  const time = showTime ? timeOf(tx) : null

  // What was actually paid, in the currency it was paid in; the converted figure goes beneath it.
  const paid = formatMoney(tx.originalMinor ?? tx.amountMinor, tx.originalCurrency ?? tx.currency)
  const foreign = tx.originalCurrency !== undefined && tx.originalCurrency !== currency
  const converted = foreign && !tx.unconverted ? `≈ ${formatMoney(tx.amountMinor, currency)}` : null

  const spoken = `${selecting ? (selected ? 'Selected' : 'Select') : 'Edit'} ${transfer ? 'transfer' : received ? 'received' : 'sent'} ${title}, ${paid}${tx.location ? ', added with location' : ''}`

  return (
    <button
      type="button"
      role={selecting ? 'checkbox' : undefined}
      aria-checked={selecting ? selected : undefined}
      onClick={() => onClick(tx)}
      // The focus ring is drawn inside the row: the list card clips anything outside its rounded edge.
      className={`flex min-h-[4.5rem] w-full items-center gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-offset-[-2px] motion-reduce:transition-none [@media(hover:hover)]:hover:bg-surface-2 ${selected ? 'bg-surface-2' : 'active:bg-surface-2'}`}
      aria-label={spoken}
    >
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold"
        style={{ background: selecting ? undefined : `color-mix(in oklab, ${transfer ? 'var(--other)' : color} 22%, var(--surface))` }}
      >
        {selecting ? (
          <span className={`flex size-6 items-center justify-center rounded-full ${selected ? 'bg-btn text-btn-ink' : 'shadow-[inset_0_0_0_1.5px_var(--axis)] text-transparent'}`}>
            <Icon name="check" size={16} />
          </span>
        ) : transfer ? (
          <Icon name="swap" size={22} />
        ) : received ? (
          // Money received gets an arrow in, so it reads differently from a purchase at a glance.
          <Icon name="arrowDown" size={22} />
        ) : (
          title.charAt(0).toUpperCase()
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="mt-0.5 flex items-center gap-2 text-sm text-ink-2">
          {route && <span className="truncate">{route}</span>}
          {showCategory && (
            <span className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: color }} />
              <span className="truncate">{categoryName}</span>
            </span>
          )}
          {tx.paymentMethod && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-px text-xs">{tx.paymentMethod}</span>}
          {tx.location && (
            <>
              <span aria-hidden="true" className="shrink-0">
                <Icon name="pin" size={14} />
              </span>
              <span className="sr-only">Added with location</span>
            </>
          )}
        </span>
        {tx.note && <span className="mt-0.5 block truncate text-sm text-muted">{tx.note}</span>}
        {foreign && tx.unconverted && <span className="mt-0.5 block text-sm text-critical">No {tx.originalCurrency} rate set</span>}
      </span>
      <span className="shrink-0 self-start text-right">
        {/* Received money gets a leading + (and the green text token), so it isn't marked by color alone. */}
        <span className={`block text-[1.0625rem] font-semibold tabular-nums ${received ? 'text-good' : ''}`}>
          {received ? '+' : ''}
          {paid}
        </span>
        {converted && <span className="block text-sm text-ink-2 tabular-nums">{converted}</span>}
        {showDate && <span className="block text-sm text-ink-2">{shortDate(tx.date)}</span>}
        {time && <span className="block text-sm text-ink-2 tabular-nums">{time}</span>}
      </span>
    </button>
  )
})
