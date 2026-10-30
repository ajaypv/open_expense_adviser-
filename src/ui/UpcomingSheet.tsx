import { useMemo, useState } from 'react'
import type { useLedger } from '../data/useLedger'
import { formatMoney, localDateString } from '../db/money'
import type { Recurring } from '../db/schema'
import { monthLabel } from '../insights/aggregates'
import { describeRule } from '../insights/recurring'
import {
  describeWhen,
  forecast,
  forecastByAccount,
  restOfMonth,
  TAG_LABELS,
  tagOf,
  totalsOf,
  upcomingPayments,
  type UpcomingPayment,
} from '../insights/upcoming'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { paymentName, shortDay, shortfallPhrase, signedAmount } from './upcomingText'

type Ledger = ReturnType<typeof useLedger>

interface Props {
  open: boolean
  onClose: () => void
  ledger: Ledger
  today: Date
  onAdd: () => void
  onEdit: (rule: Recurring) => void
}

const HORIZONS = [30, 60, 90] as const
const card = 'rounded-3xl bg-surface-2/60'
const chip =
  'flex min-h-11 shrink-0 items-center rounded-full bg-surface px-4 font-medium shadow-[0_0_0_1px_var(--ring)] aria-pressed:bg-btn aria-pressed:text-btn-ink aria-pressed:shadow-none'

/**
 * Everything regular, in one place: what will leave and what will arrive and when, what is still to go this month,
 * and whether the balance is enough, overall and for each account. The app cannot see a bank or UPI app, so each
 * payment is added once by hand and the app keeps count from there.
 */
export function UpcomingSheet({ open, onClose, ledger, today, onAdd, onEdit }: Props) {
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]>(30)
  const todayKey = localDateString(today)
  const { recurring, currency, rates, categoryById } = ledger
  const money = useMemo(() => ({ currency, rates }), [currency, rates])

  const items = useMemo(() => upcomingPayments(recurring, todayKey, horizon, money), [recurring, todayKey, horizon, money])
  // "This month" does not depend on how far ahead the list looks.
  const monthItems = useMemo(() => restOfMonth(upcomingPayments(recurring, todayKey, 62, money), todayKey), [recurring, todayKey, money])
  const paused = recurring.filter((r) => !r.active)
  const active = recurring.filter((r) => r.active)

  const month = monthLabel(todayKey.slice(0, 7)).split(' ')[0]
  const monthTotals = totalsOf(monthItems)
  const ahead = totalsOf(items)
  const overall = forecast(ledger.estimatedBalanceMinor, items, todayKey)
  const overallShort = shortfallPhrase(overall, currency, today)
  const accountChecks = useMemo(
    () => forecastByAccount(items, ledger.accounts, ledger.balances, todayKey).filter((a) => ledger.accounts.find((x) => x.id === a.accountId)?.openingMinor != null),
    [items, ledger.accounts, ledger.balances, todayKey],
  )
  const anyAccountShort = accountChecks.some((a) => a.forecast.shortfallMinor > 0)
  const noRate = [...new Set(items.filter((p) => p.unconverted).map((p) => p.rule.currency))]
  const money$ = (m: number) => formatMoney(m, currency)

  const row = (p: UpcomingPayment) => {
    const name = paymentName(p, categoryById.get(p.rule.categoryId)?.name)
    const type = TAG_LABELS[tagOf(p.rule)]
    const when = describeWhen(p.daysLeft)
    const direction = p.kind === 'income' ? 'coming in' : 'going out'
    return (
      <li key={p.key}>
        <button
          type="button"
          onClick={() => onEdit(p.rule)}
          aria-label={`Edit ${name}, ${type}, ${when}, ${formatMoney(p.amountMinor, currency)} ${direction}, due ${shortDay(p.date, today)}`}
          className="flex min-h-16 w-full items-center justify-between gap-3 py-2.5 text-left"
        >
          <span className="min-w-0">
            <span className="block truncate font-medium">{name}</span>
            <span className="block text-sm text-ink-2">{`${type}, ${shortDay(p.date, today)}`}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className={`block font-semibold tabular-nums ${p.kind === 'income' ? 'text-good' : ''}`}>{signedAmount(p, currency)}</span>
            <span className={`flex items-center justify-end gap-1 text-sm ${p.overdue ? 'font-medium text-critical' : 'text-ink-2'}`}>
              {p.overdue && <Icon name="warn" size={14} />}
              <span>{when}</span>
            </span>
          </span>
        </button>
      </li>
    )
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="upcoming-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="upcoming-title" className="min-w-0 text-2xl font-semibold tracking-tight">
          Upcoming payments
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onAdd} className="min-h-11 rounded-full bg-btn px-4 font-semibold text-btn-ink">
            Add
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <Icon name="close" />
          </button>
        </div>
      </div>

      {recurring.length === 0 ? (
        <div className={`${card} mt-4 p-5`}>
          <p className="text-lg font-semibold">Nothing set up yet</p>
          <p className="mt-1 text-ink-2">Add the payments that repeat, such as Loan EMIs, UPI AutoPay, subscriptions and bills, and the salary that comes in. The app then shows what is due, when, and whether your balance covers it.</p>
          <p className="mt-2 text-ink-2">The app can’t see your bank or UPI apps, so you add each one once and it keeps count from there.</p>
          <button type="button" onClick={onAdd} className="mt-4 min-h-12 rounded-full bg-btn px-5 font-semibold text-btn-ink">
            Add a payment
          </button>
        </div>
      ) : (
        <>
          <section aria-label={month} className={`${card} mt-4 p-5`}>
            <h3 className="font-semibold">{month}</h3>
            {monthItems.length === 0 ? (
              <p className="mt-1 text-ink-2">Nothing else is due this month.</p>
            ) : (
              <>
                <dl className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-sm text-ink-2">Still to go out</dt>
                    <dd className="text-xl font-bold tabular-nums">{money$(monthTotals.outMinor)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ink-2">Still to come in</dt>
                    <dd className="text-xl font-bold tabular-nums">{money$(monthTotals.inMinor)}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-ink-2">{`${monthTotals.count} ${monthTotals.count === 1 ? 'payment' : 'payments'} left this month`}</p>
              </>
            )}
          </section>

          <div role="group" aria-label="Look ahead" className="mt-4 flex gap-2">
            {HORIZONS.map((h) => (
              <button key={h} type="button" aria-pressed={horizon === h} onClick={() => setHorizon(h)} className={chip}>
                {`${h} days`}
              </button>
            ))}
          </div>

          <section aria-label={`Next ${horizon} days`} className={`${card} mt-3 p-5`}>
            <h3 className="font-semibold">{`Next ${horizon} days`}</h3>
            <dl className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <dt className="text-sm text-ink-2">Going out</dt>
                <dd className="text-xl font-bold tabular-nums">{money$(ahead.outMinor)}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-2">Coming in</dt>
                <dd className="text-xl font-bold tabular-nums">{money$(ahead.inMinor)}</dd>
              </div>
            </dl>
          </section>

          <section aria-label="Is your balance enough?" className={`${card} mt-3 p-5`}>
            <h3 className="font-semibold">Is your balance enough?</h3>
            {!ledger.balanceSet ? (
              <p className="mt-1 text-ink-2">Set your balance in Settings to check these are covered. Until then the app only knows what you have logged.</p>
            ) : items.length === 0 ? (
              <p className="mt-1 text-ink-2">Nothing is due in this time.</p>
            ) : overallShort ? (
              <p className="mt-1 flex items-start gap-2 font-medium text-critical">
                <span className="mt-0.5 shrink-0">
                  <Icon name="warn" size={20} />
                </span>
                {`You will be ${overallShort}. Add at least ${money$(overall.shortfallMinor)} before then.`}
              </p>
            ) : (
              <>
                <p className="mt-1 flex items-start gap-2 font-medium">
                  <span className="mt-0.5 shrink-0 text-good">
                    <Icon name="check" size={20} />
                  </span>
                  Your balance covers these payments.
                </p>
                <p className="mt-1 text-ink-2">
                  {overall.lowestDate
                    ? `The lowest it gets is ${money$(overall.lowestMinor)} on ${shortDay(overall.lowestDate, today)}.`
                    : `It stays at ${money$(overall.endMinor)} or more.`}
                </p>
              </>
            )}

            {ledger.balanceSet && accountChecks.length > 1 && (
              <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                {accountChecks.map((a) => {
                  const phrase = shortfallPhrase(a.forecast, currency, today)
                  return (
                    <li key={a.accountId} className={phrase ? 'font-medium text-critical' : 'text-ink-2'}>
                      {`${a.name}: ${phrase ?? 'enough'}`}
                    </li>
                  )
                })}
              </ul>
            )}
            {anyAccountShort && accountChecks.length > 1 && <p className="mt-2 text-ink-2">Move or add money to those accounts before the payments leave.</p>}
            {ledger.balanceSet && <p className="mt-3 text-sm text-ink-2">{`Counts your balance now of ${money$(ledger.estimatedBalanceMinor)}, and what goes out before money arrives on the same day.`}</p>}
            {noRate.length > 0 && (
              <p className="mt-2 text-sm text-ink-2">{`Some payments are in ${noRate.join(', ')}, which has no exchange rate yet, so they are counted at face value.`}</p>
            )}
          </section>

          <section aria-labelledby="upcoming-list-h" className="mt-6">
            <h3 id="upcoming-list-h" className="mb-1 px-1 text-xl font-bold tracking-tight">
              Coming up
            </h3>
            {items.length === 0 ? (
              <p className="px-1 text-ink-2">{`Nothing is due in the next ${horizon} days.`}</p>
            ) : (
              <ul className="divide-y divide-line rounded-3xl bg-surface px-4 shadow-[0_0_0_1px_var(--ring)]">{items.map(row)}</ul>
            )}
          </section>

          {paused.length > 0 && (
            <section aria-label="Paused" className="mt-6">
              <h3 className="mb-1 px-1 text-xl font-bold tracking-tight">Paused</h3>
              <ul className="divide-y divide-line rounded-3xl bg-surface px-4 shadow-[0_0_0_1px_var(--ring)]">
                {paused.map((r) => {
                  const name = r.merchant || categoryById.get(r.categoryId)?.name || 'Payment'
                  return (
                    <li key={r.id}>
                      <button type="button" onClick={() => onEdit(r)} aria-label={`Edit ${name}, paused`} className="flex min-h-14 w-full items-center justify-between gap-3 py-2.5 text-left">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{name}</span>
                          <span className="block text-sm text-ink-2">{`${TAG_LABELS[tagOf(r)]}. ${describeRule(r)}.`}</span>
                        </span>
                        <span className="shrink-0 text-sm text-ink-2">Paused</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
          {active.length === 0 && paused.length > 0 && <p className="mt-3 text-ink-2">Everything is paused, so nothing is counted.</p>}
        </>
      )}
    </Dialog>
  )
}
