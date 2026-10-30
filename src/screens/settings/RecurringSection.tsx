import { useMemo } from 'react'
import { formatMoney, localDateString, parseLocalDate } from '../../db/money'
import { addRecurring, deleteRecurring, updateRecurring } from '../../db/repo'
import { describeRule, detectRecurring, type DetectedRecurring } from '../../insights/recurring'
import { Icon } from '../../ui/Icon'
import { useToast } from '../../ui/toast'
import { card, Group, Status, Switch, type Ledger } from './parts'

let shortDate: Intl.DateTimeFormat | undefined
const nextOn = (date: string) =>
  (shortDate ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(parseLocalDate(date))

/** Things that repeat, such as rent or a subscription, and ones the app has noticed in your history. */
export function RecurringSection({ ledger }: { ledger: Ledger }) {
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
      hint="Rent, subscriptions and salary. When one comes due, Home offers to add it with one tap. Set one up with Repeat in the add form."
      status={<Status on={recurring.length > 0}>{recurring.length === 0 ? 'None' : `${recurring.length}`}</Status>}
    >
      {recurring.length > 0 && (
        <ul className={`${card} divide-y divide-line`}>
          {recurring.map((r) => {
            const name = r.merchant || categoryById.get(r.categoryId)?.name || (r.kind === 'income' ? 'Income' : 'Expense')
            return (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{name}</p>
                    <p className="text-sm text-ink-2">
                      {r.kind === 'income' ? '+' : ''}
                      {formatMoney(r.amountMinor, r.currency || currency)}. {describeRule(r)}.
                    </p>
                    <p className="text-sm text-ink-2">{r.active ? `Next: ${nextOn(r.nextDue)}` : 'Paused'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Stop repeating “${name}”? Transactions already added stay.`)) void deleteRecurring(r.id)
                    }}
                    aria-label={`Delete recurring ${name}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-critical"
                  >
                    <Icon name="trash" size={20} />
                  </button>
                </div>
                <Switch label="Active" checked={r.active} onChange={(active) => void updateRecurring(r.id, { active })} />
              </li>
            )
          })}
        </ul>
      )}

      {found.length > 0 && (
        <div className={`${card} ${recurring.length > 0 ? 'mt-3' : ''}`}>
          <p className="px-4 pt-4 font-medium">Found in your history</p>
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
