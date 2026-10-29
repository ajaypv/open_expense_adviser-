import { CategoryBars } from '../charts/CategoryBars'
import { DayChart } from '../charts/DayChart'
import { Meter } from '../charts/Meter'
import type { useLedger } from '../data/useLedger'
import { formatMoney, localDateString } from '../db/money'
import type { Transaction } from '../db/schema'
import {
  byCategory,
  byDay,
  compareToPrevious,
  inMonth,
  monthLabel,
  shiftMonth,
  sum,
  type MonthKey,
} from '../insights/aggregates'
import { MonthSwitcher } from '../ui/MonthSwitcher'
import { TxRow } from '../ui/TxRow'
import { WalletPanel } from '../ui/WalletPanel'

type Ledger = ReturnType<typeof useLedger>

interface Props {
  ledger: Ledger
  month: MonthKey
  onMonth: (month: MonthKey) => void
  today: Date
  onPickCategory: (categoryId: number) => void
  onEdit: (tx: Transaction) => void
  onExample: (text: string) => void
  onOpenSettings: () => void
  onSeeAll: () => void
  /** The estimated balance stays hidden until this is true; the app owns it so it survives tab changes. */
  balanceShown: boolean
  onToggleBalance: () => void
}

const EXAMPLES = ['450 lunch at Cafe', 'Uber 230 yesterday', 'Salary 80,000']

export function Home({
  ledger,
  month,
  onMonth,
  today,
  onPickCategory,
  onEdit,
  onExample,
  onOpenSettings,
  onSeeAll,
  balanceShown,
  onToggleBalance,
}: Props) {
  const { txs, expenses, income, categoryById, currency, budgetMinor, loading } = ledger
  const currentMonth = localDateString(today).slice(0, 7)
  // Spending charts and totals use money sent only; the latest list shows both directions.
  const monthTxs = inMonth(expenses, month)
  const total = sum(monthTxs)
  const received = sum(inMonth(income, month))
  const isCurrent = month === currentMonth
  const comparison = compareToPrevious(expenses, month, today)
  const recent = inMonth(txs, month)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .slice(0, 5)

  if (loading) return <h1 className="sr-only">Home</h1>

  if (txs.length === 0) {
    return (
      <div className="pt-16">
        <h1 className="text-3xl font-semibold tracking-tight">Nothing logged yet.</h1>
        <p className="mt-3 max-w-sm text-lg text-ink-2">
          Type what you spent or received in the bar below, as you would say it. Tap an example to try it.
        </p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <li key={e}>
              <button
                type="button"
                onClick={() => onExample(e)}
                className="min-h-11 rounded-full px-4 shadow-[0_0_0_1px_var(--ring)]"
              >
                {e}
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const name = monthLabel(month).split(' ')[0]
  const prevName = monthLabel(shiftMonth(month, -1)).split(' ')[0]
  const delta = comparison.deltaPct

  return (
    <div>
      <h1 className="sr-only">Home</h1>
      <MonthSwitcher month={month} currentMonth={currentMonth} onChange={onMonth} />

      {total === 0 ? (
        <p className="mt-10 text-3xl font-semibold tracking-tight">
          No expenses in {name}.
        </p>
      ) : (
        <section aria-label="Summary" className="mt-6">
          <p className="text-[clamp(1.375rem,6.2vw,1.75rem)] font-medium leading-snug tracking-tight text-ink-2">
            {isCurrent ? "You've spent " : 'You spent '}
            <strong className="whitespace-nowrap text-[clamp(2.5rem,13vw,3.25rem)] font-semibold leading-none tracking-tighter text-ink">
              {formatMoney(total, currency)}
            </strong>{' '}
            in {name}.
          </p>
          {delta !== null && (
            <p className="mt-3 text-lg text-ink-2">
              {delta === 0 ? (
                <>
                  The same as {comparison.partial ? 'the same days in ' : ''}
                  {prevName}.
                </>
              ) : (
                <>
                  That&rsquo;s{' '}
                  <span className={delta > 0 ? 'font-medium text-critical' : 'font-medium text-good'}>
                    {Math.abs(delta)}% {delta > 0 ? 'more' : 'less'}
                  </span>{' '}
                  than {comparison.partial ? 'the same days in ' : ''}
                  {prevName}.
                </>
              )}
            </p>
          )}
        </section>
      )}

      <WalletPanel
        monthName={name}
        sentMinor={total}
        receivedMinor={received}
        currency={currency}
        balanceMinor={ledger.estimatedBalanceMinor}
        balanceSet={ledger.balanceSet}
        shown={balanceShown}
        onToggle={onToggleBalance}
        onSetBalance={onOpenSettings}
      />

      <section aria-labelledby="budget-h" className="mt-8">
        <h2 id="budget-h" className="mb-3 text-lg font-semibold">
          Budget
        </h2>
        {budgetMinor === null ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-11 rounded-full px-4 font-medium shadow-[0_0_0_1px_var(--ring)]"
          >
            Set a monthly budget
          </button>
        ) : (
          <Meter spentMinor={total} limitMinor={budgetMinor} currency={currency} />
        )}
      </section>

      {total > 0 && (
        <>
          <section aria-labelledby="daily-h" className="mt-10">
            <h2 id="daily-h" className="mb-1 text-lg font-semibold">
              Day by day
            </h2>
            <DayChart
              values={byDay(monthTxs, month)}
              monthKey={month}
              lastDay={isCurrent ? today.getDate() : null}
              currency={currency}
            />
          </section>

          <section aria-labelledby="cats-h" className="mt-10">
            <h2 id="cats-h" className="mb-1 text-lg font-semibold">
              Where it went
            </h2>
            <CategoryBars
              totals={byCategory(monthTxs)}
              categoryById={categoryById}
              currency={currency}
              limit={5}
              onPick={onPickCategory}
            />
          </section>

          <section aria-labelledby="recent-h" className="mt-10 pb-4">
            <div className="flex items-center justify-between">
              <h2 id="recent-h" className="text-lg font-semibold">
                Latest
              </h2>
              <button type="button" onClick={onSeeAll} className="min-h-11 px-2 font-medium underline underline-offset-2">
                See all
              </button>
            </div>
            <ul className="divide-y divide-line rounded-2xl bg-surface px-4 shadow-[0_0_0_1px_var(--ring)]">
              {recent.map((t) => (
                <li key={t.id}>
                  <TxRow tx={t} category={categoryById.get(t.categoryId)} currency={currency} showDate onClick={onEdit} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
