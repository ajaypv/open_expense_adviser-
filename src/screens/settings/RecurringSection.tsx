import { useMemo } from 'react'
import { formatMoney, localDateString, parseLocalDate } from '../../db/money'
import { addRecurring, deleteRecurring, updateRecurring } from '../../db/repo'
import { describeRule, detectRecurring, type DetectedRecurring } from '../../insights/recurring'
import { tagOf } from '../../insights/upcoming'
import { Icon } from '../../ui/Icon'
import { PaymentBadge } from '../../ui/PaymentBadge'
import { useToast } from '../../ui/toast'
import { card, cardTitle, Group, IconCircle, Status, Switch, type Ledger } from './parts'

let shortDate: Intl.DateTimeFormat | undefined
const nextOn = (date: string) =>
  (shortDate ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(parseLocalDate(date))

/** Things that repeat, such as rent or a subscription, and ones the app has noticed in your history. */
export function RecurringSection({ ledger, onOpenUpcoming }: { ledger: Ledger; onOpenUpcoming?: () => void }) {
  const toast = useToast()
  const { recurring, categoryById, currency } = ledger
  const today = localDateString()

  const found = useMemo(() => detectRecurring(ledger.txs, recurring, today), [ledger.txs, recurring, today])

  async function adopt(d: DetectedRecurring) {
    await addRecurring({
      kind: d.kind,
      amountMinor: d.amountMinor,
      currency: d.currency,
      categoryId: d.categoryId,
      merchant: d.merchant,
      note: '',
      paymentMethod: d.paymentMethod,
      accountId: d.accountId,
      frequency: d.frequency,
      nextDue: d.nextDue,
      active: true,
    })
    toast({ message: `${d.merchant} will now repeat every month` })
  }

  return (
    <Group
      id="recurring-h"
      title="Recurring"
      hint="Loans, auto-payments, subscriptions, rent and salary. When one comes due, Home offers to add it with one tap."
      status={<Status on={recurring.length > 0}>{recurring.length === 0 ? 'None' : `${recurring.length}`}</Status>}
    >
      {onOpenUpcoming && (
        <button type="button" onClick={onOpenUpcoming} className={`${card} mb-3 flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left font-semibold`}>
          <IconCircle icon="bell" />
          <span className="min-w-0 flex-1">See what is coming up, or add a payment</span>
          <span aria-hidden="true" className="text-ink-2">
            <Icon name="chevRight" size={20} />
          </span>
        </button>
      )}

      {recurring.length > 0 && (
        <ul className={`${card} divide-y divide-line`}>
          {recurring.map((r) => {
            const name = r.merchant || categoryById.get(r.categoryId)?.name || (r.kind === 'income' ? 'Income' : 'Expense')
            return (
              <li key={r.id} className="px-4 py-3">
                {/* The same row as Plan ahead: the round icon, the name and its rule, the amount in bold. */}
                <div className="flex items-center gap-3">
                  <PaymentBadge tag={tagOf(r)} name={name} categoryName={categoryById.get(r.categoryId)?.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{name}</p>
                    <p className="text-sm text-ink-2">{describeRule(r)}</p>
                  </div>
                  <p className={`num shrink-0 text-base ${r.kind === 'income' ? 'text-good' : ''}`}>
                    {r.kind === 'income' ? '+' : ''}
                    {formatMoney(r.amountMinor, r.currency || currency)}
                  </p>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 pl-[3.25rem]">
                  <p className="text-sm text-ink-2">{r.active ? `Next: ${nextOn(r.nextDue)}` : 'Paused'}</p>
                  <div className="flex items-center gap-1">
                    <Switch label="Active" labelHidden checked={r.active} onChange={(active) => void updateRecurring(r.id, { active })} />
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Stop repeating “${name}”? Transactions already added stay.`)) void deleteRecurring(r.id)
                      }}
                      aria-label={`Delete recurring ${name}`}
                      className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-surface-2"
                    >
                      <Icon name="trash" size={20} />
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {found.length > 0 && (
        <div className={`${card} ${recurring.length > 0 ? 'mt-3' : ''}`}>
          <p className={`px-4 pt-4 ${cardTitle}`}>Found in your history</p>
          <p className="px-4 pb-2 text-sm text-ink-2">These happen about the same time every month.</p>
          <ul className="divide-y divide-line border-t border-line">
            {found.map((d) => (
              <li key={d.key} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.merchant}</p>
                  <p className="text-sm text-ink-2">
                    {d.kind === 'income' ? '+' : ''}
                    {formatMoney(d.amountMinor, d.currency || currency)}. Seen {d.count} times.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void adopt(d)}
                  className="min-h-11 shrink-0 rounded-full bg-btn px-4 text-sm font-semibold text-btn-ink"
                >
                  Repeat monthly
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recurring.length === 0 && found.length === 0 && (
        <p className={`${card} p-4 text-ink-2`}>
          Nothing repeats yet. Choose Repeat when you add rent or a subscription, or log it for a few months and the app will
          offer to repeat it.
        </p>
      )}
    </Group>
  )
}
