import { useMemo } from 'react'
import type { useLedger } from '../data/useLedger'
import { localDateString } from '../db/money'
import { describeWhen, forecast, upcomingPayments } from '../insights/upcoming'
import { Icon } from './Icon'
import { paymentName, shortfallPhrase, signedAmount } from './upcomingText'

type Ledger = ReturnType<typeof useLedger>

const card = 'rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]'
const SHOWN = 3
const HORIZON_DAYS = 30

/**
 * On Home: the next few payments that will leave or arrive, how many days away each is, and in one line whether
 * the balance covers the next 30 days. Opens the full view. With nothing set up it is a single quiet line.
 */
export function UpcomingCard({ ledger, today, onOpen }: { ledger: Ledger; today: Date; onOpen: () => void }) {
  const todayKey = localDateString(today)
  const { recurring, currency, rates } = ledger
  const items = useMemo(() => upcomingPayments(recurring, todayKey, HORIZON_DAYS, { currency, rates }), [recurring, todayKey, currency, rates])

  if (!recurring.some((r) => r.active)) {
    return (
      <button type="button" onClick={onOpen} className={`${card} mt-3 flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left`}>
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
          <Icon name="repeat" size={18} />
        </span>
        <span className="min-w-0 flex-1 font-medium">Track loans, auto-payments and salary</span>
        <span aria-hidden="true" className="text-ink-2">
          <Icon name="chevRight" size={20} />
        </span>
      </button>
    )
  }

  const shown = items.slice(0, SHOWN)
  const more = items.length - shown.length
  const f = forecast(ledger.estimatedBalanceMinor, items, todayKey)
  // With no balance set the estimate starts from zero, so every payment would look like a shortfall: say nothing then.
  const short = ledger.balanceSet ? shortfallPhrase(f, currency, today) : null

  return (
    <section aria-label="Coming up" className={`${card} mt-3 p-4`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Icon name="repeat" size={18} />
          Coming up
        </h2>
        <button type="button" onClick={onOpen} aria-label="See all upcoming payments" className="-mr-2 min-h-11 rounded-full px-3 font-medium underline underline-offset-2">
          See all
        </button>
      </div>

      {items.length === 0 ? (
        <p className="mt-1 text-ink-2">Nothing due in the next {HORIZON_DAYS} days.</p>
      ) : (
        <>
          <ul className="mt-1 divide-y divide-line">
            {shown.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{paymentName(p, ledger.categoryById.get(p.rule.categoryId)?.name)}</p>
                  <p className={`flex items-center gap-1.5 text-sm ${p.overdue ? 'font-medium text-critical' : 'text-ink-2'}`}>
                    {p.overdue && <Icon name="warn" size={14} />}
                    {describeWhen(p.daysLeft)}
                  </p>
                </div>
                <p className={`shrink-0 font-semibold tabular-nums ${p.kind === 'income' ? 'text-good' : ''}`}>{signedAmount(p, currency)}</p>
              </li>
            ))}
          </ul>
          {more > 0 && <p className="text-sm text-ink-2">{`${more} more in the next ${HORIZON_DAYS} days`}</p>}

          <p className={`mt-3 flex items-center gap-2 border-t border-line pt-3 ${short ? 'font-semibold text-critical' : ledger.balanceSet ? 'text-ink' : 'text-ink-2'}`}>
            {short ? (
              <>
                <Icon name="warn" size={18} />
                {`Short by ${short.slice('short by '.length)}`}
              </>
            ) : ledger.balanceSet ? (
              <>
                <span className="text-good">
                  <Icon name="check" size={18} />
                </span>
                {`Your balance covers the next ${HORIZON_DAYS} days`}
              </>
            ) : (
              'Set your balance to check these are covered.'
            )}
          </p>
        </>
      )}
    </section>
  )
}
