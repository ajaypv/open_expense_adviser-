import { useMemo } from 'react'
import type { useLedger } from '../data/useLedger'
import { formatMoney, localDateString } from '../db/money'
import { planAhead, type AheadRow } from '../insights/ahead'
import { describeWhen, upcomingPayments } from '../insights/upcoming'
import { Icon, type IconName } from './Icon'
import { paymentName, shortDay, signedAmount } from './upcomingText'

type Ledger = ReturnType<typeof useLedger>

const HORIZON_DAYS = 30

const ICON: Record<AheadRow['kind'], IconName> = { emi: 'repeat', biggest: 'bolt', income: 'arrowDown' }

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * Under the Today, Yesterday and Last 7 days figures: what is worth knowing about the weeks ahead. The date of the
 * next loan EMI, the biggest payment coming and when, when money next arrives, and, when the balance will not stretch,
 * how much to save and about how much a day. Only for payments that are set up, and only for the month in progress.
 * It has no button of its own to open the full list: the Coming up card further down has it, and two would be read out alike.
 */
export function PlanAhead({ ledger, today }: { ledger: Ledger; today: Date }) {
  const todayKey = localDateString(today)
  const { recurring, currency, rates, balanceSet, estimatedBalanceMinor, categoryById } = ledger
  const plan = useMemo(() => {
    const items = upcomingPayments(recurring, todayKey, HORIZON_DAYS, { currency, rates })
    return planAhead(items, { set: balanceSet, minor: estimatedBalanceMinor }, todayKey, HORIZON_DAYS)
  }, [recurring, todayKey, currency, rates, balanceSet, estimatedBalanceMinor])

  if (!plan) return null
  const money = (minor: number) => formatMoney(minor, currency)
  const label = (r: AheadRow) =>
    r.kind === 'emi' ? (r.alsoBiggest ? 'Next EMI, and your biggest payment' : 'Next EMI') : r.kind === 'biggest' ? 'Biggest payment ahead' : 'Money coming in'
  const { setAside } = plan

  return (
    <section aria-label="Plan ahead" className="mt-4 border-t border-line pt-3">
      <h3 className="mb-1 text-[0.8125rem] font-medium text-ink-2">Plan ahead</h3>

      {plan.rows.length > 0 && (
        <ul className="divide-y divide-line">
          {plan.rows.map((r) => {
            const p = r.payment
            return (
              <li key={r.kind} data-kind={r.kind} className="flex items-center gap-3 py-2.5">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
                  <Icon name={ICON[r.kind]} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-2">{label(r)}</p>
                  <p className="truncate font-medium">{paymentName(p, categoryById.get(p.rule.categoryId)?.name)}</p>
                  <p className={`flex items-center gap-1.5 text-sm ${p.overdue ? 'font-medium text-critical' : 'text-ink-2'}`}>
                    {p.overdue && <Icon name="warn" size={14} />}
                    {`${shortDay(p.date, today)}, ${lowerFirst(describeWhen(p.daysLeft))}`}
                  </p>
                </div>
                <p className={`shrink-0 font-semibold tabular-nums ${p.kind === 'income' ? 'text-good' : ''}`}>{signedAmount(p, currency)}</p>
              </li>
            )
          })}
        </ul>
      )}

      {setAside && (
        <div data-tone={setAside.tone} className="mt-1 flex items-start gap-3 rounded-2xl bg-surface-2 p-3.5">
          <span aria-hidden="true" className={`mt-0.5 shrink-0 ${setAside.tone === 'short' ? 'text-critical' : 'text-ink-2'}`}>
            <Icon name={setAside.tone === 'short' ? 'warn' : 'flag'} size={20} />
          </span>
          <div className="min-w-0">
            {setAside.tone === 'short' ? (
              <>
                <p className="font-semibold text-critical">{`Save ${money(setAside.amountMinor)} more by ${shortDay(setAside.byDate!, today)}`}</p>
                <p className="text-sm text-ink-2">{`Your balance will not cover what is due. About ${money(setAside.perDayMinor)} a day gets you there.`}</p>
              </>
            ) : (
              <>
                <p className="font-semibold">{`${money(setAside.amountMinor)} to pay in the next ${HORIZON_DAYS} days`}</p>
                <p className="text-sm text-ink-2">{`Set aside about ${money(setAside.perDayMinor)} a day to be ready. Add your balance to check it is covered.`}</p>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
