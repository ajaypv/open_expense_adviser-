import { formatMoney, parseLocalDate } from '../db/money'
import type { Recurring } from '../db/schema'
import type { Bill } from '../insights/bills'
import { describeWhen, TAG_LABELS } from '../insights/upcoming'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { PaymentBadge } from './PaymentBadge'

interface Props {
  /** The bill to show; null while nothing is open. */
  bill: Bill | null
  /** The regular payment behind it, when it is known, so it can be changed. */
  rule?: Recurring
  currency: string
  /** What the payment is paid from, when there is more than one account. */
  accountName?: string
  /** The last time the same payment went through before this one, if it has. */
  lastPaid?: Bill
  onClose: () => void
  /** Opens the regular payment to change it; this closes first. */
  onEdit: (rule: Recurring) => void
}

let fullFormat: Intl.DateTimeFormat | undefined
let shortFormat: Intl.DateTimeFormat | undefined
let weekdayFormat: Intl.DateTimeFormat | undefined
const fullDay = (date: string) => (fullFormat ??= new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })).format(parseLocalDate(date))
const shortDay = (date: string) => (shortFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })).format(parseLocalDate(date))
const weekdayOf = (date: string) => (weekdayFormat ??= new Intl.DateTimeFormat(undefined, { weekday: 'long' })).format(parseLocalDate(date))

/** "Every month, on day 20" or "Every week, on Friday". */
function repeats(rule: Recurring): string {
  if (rule.frequency === 'weekly') return `Every week, on ${weekdayOf(rule.nextDue)}`
  return `Every month, on day ${rule.anchorDay ?? parseLocalDate(rule.nextDue).getDate()}`
}

/** A line of the details: what it is, then its value, in the soft tile style used elsewhere. */
function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-[0.9375rem] font-medium text-ink-2">{label}</dt>
      <dd className="min-w-0 text-right text-[1.0625rem] font-semibold">{children}</dd>
    </div>
  )
}

/**
 * One regular payment opened from the calendar or its list: who it is (the logo or icon, the name and kind), the amount and where it stands
 * (how many days away, how late, or paid), then the details: the day it is due or went, how often it repeats, what it is filed under, what it
 * is paid from and with, the note, and when it last went through. Edit opens the payment to change it, when it is known; a payment that was
 * added from one that has since been removed can only be read.
 */
export function BillDetails({ bill: b, rule, currency, accountName, lastPaid, onClose, onEdit }: Props) {
  const status = b ? (b.state === 'paid' ? (b.kind === 'income' ? 'Received' : 'Paid') : describeWhen(b.daysLeft ?? 0)) : ''
  const tone = b?.state === 'late' ? 'text-critical' : b?.state === 'paid' ? 'text-good' : 'text-ink-2'
  return (
    <Dialog open={b !== null} onClose={onClose} labelledBy="bill-title">
      {b && (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <PaymentBadge tag={b.tag} name={b.name} categoryName={b.categoryName} size={52} />
              <div className="min-w-0">
                <h2 id="bill-title" className="type-title truncate">
                  {b.name}
                </h2>
                <p className="truncate text-[0.9375rem] font-medium text-ink-2">{TAG_LABELS[b.tag]}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-2">
              <Icon name="close" />
            </button>
          </div>

          <p data-testid="bill-amount" className={`type-figure mt-4 text-[2rem] ${b.kind === 'income' ? 'text-good' : ''}`}>
            {`${b.kind === 'income' ? '+' : ''}${formatMoney(b.amountMinor, currency)}`}
          </p>
          <p data-testid="bill-status" className={`mt-0.5 flex items-center gap-1.5 text-[1.0625rem] font-semibold ${tone}`}>
            {b.state === 'late' && <Icon name="warn" size={16} />}
            {b.state === 'paid' && <Icon name="check" size={16} />}
            {status}
          </p>

          <dl className="mt-4 divide-y divide-line overflow-hidden rounded-2xl bg-surface-2">
            <Line label={b.state === 'paid' ? (b.kind === 'income' ? 'Received on' : 'Paid on') : 'Due on'}>{fullDay(b.date)}</Line>
            {rule && <Line label="Repeats">{repeats(rule)}</Line>}
            {b.categoryName && <Line label="Filed under">{b.categoryName}</Line>}
            {accountName && <Line label={b.kind === 'income' ? 'Paid into' : 'Paid from'}>{accountName}</Line>}
            {rule?.paymentMethod && <Line label="Paid with">{rule.paymentMethod}</Line>}
            {lastPaid && <Line label="Last time">{`${shortDay(lastPaid.date)}, ${formatMoney(lastPaid.amountMinor, currency)}`}</Line>}
            {rule?.note && <Line label="Note">{rule.note}</Line>}
          </dl>

          {!rule && <p className="mt-3 text-[0.9375rem] leading-snug text-ink-2">This was added from a regular payment that has since been changed or removed, so it can only be read here.</p>}

          <div className="mt-5 flex gap-2">
            {rule && (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onEdit(rule)
                }}
                className="min-h-12 flex-1 rounded-full bg-btn px-5 font-semibold text-btn-ink"
              >
                Edit
              </button>
            )}
            <button type="button" onClick={onClose} className={`min-h-12 rounded-full bg-surface-2 px-5 font-semibold ${rule ? '' : 'flex-1'}`}>
              Done
            </button>
          </div>
        </>
      )}
    </Dialog>
  )
}
