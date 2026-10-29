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
import type { Suggestion } from '../insights/suggestions'
import { Icon } from '../ui/Icon'
import { MonthSwitcher } from '../ui/MonthSwitcher'
import { SuggestionList } from '../ui/SuggestionList'
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
  /** Regulars that fit right now; tapping one opens the add form filled in. */
  suggestions: Suggestion[]
  onSuggestion: (s: Suggestion) => void
}

const EXAMPLES = ['450 lunch at Cafe', 'Uber 230 yesterday', 'Salary 80,000']

const card = 'rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]'

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
  suggestions,
  onSuggestion,
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
                className="min-h-11 rounded-full bg-surface px-4 shadow-[0_0_0_1px_var(--ring)]"
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
  const against = `${comparison.partial ? 'the same days in ' : ''}${prevName}`

  return (
    <div className="pb-4">
      <h1 className="sr-only">Home</h1>
      <MonthSwitcher month={month} currentMonth={currentMonth} onChange={onMonth} />

      <section aria-label="Summary" className={`${card} mt-3 p-5`}>
        {total === 0 ? (
          <p className="text-2xl font-semibold tracking-tight">No expenses in {name}.</p>
        ) : (
          <>
            <p className="text-ink-2">
              {isCurrent ? "You've spent so far in " : 'You spent in '}
              {name}
            </p>
            <p className="mt-1 whitespace-nowrap text-[clamp(2.75rem,15vw,3.75rem)] font-semibold leading-none tracking-tighter tabular-nums">
              {formatMoney(total, currency)}
            </p>
            {delta !== null && (
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] text-ink-2">
                {delta === 0 ? (
                  <>The same as {against}.</>
                ) : (
                  <>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-2 pr-2.5 font-medium ${
                        delta > 0 ? 'text-critical' : 'text-good'
                      }`}
                    >
                      <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} size={16} />
                      {Math.abs(delta)}% {delta > 0 ? 'more' : 'less'}
                    </span>
                    than {against}
                  </>
                )}
              </p>
            )}
          </>
        )}

        <div className="mt-5 border-t border-line pt-4">
          {budgetMinor === null ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex min-h-11 w-full items-center justify-between gap-3 text-left font-medium"
            >
              Set a monthly budget
              <Icon name="chevRight" size={20} />
            </button>
          ) : (
            <Meter spentMinor={total} limitMinor={budgetMinor} currency={currency} />
          )}
        </div>
      </section>

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

      {isCurrent && suggestions.length > 0 && (
        <section aria-labelledby="suggest-h" className="mt-8">
          <h2 id="suggest-h" className="mb-3 px-1 text-lg font-semibold">
            Suggested for now
          </h2>
          <SuggestionList items={suggestions.slice(0, 4)} categoryById={categoryById} currency={currency} onPick={onSuggestion} tone="page" />
        </section>
      )}

      {total > 0 && (
        <>
          <section aria-labelledby="daily-h" className="mt-8">
            <h2 id="daily-h" className="mb-3 px-1 text-lg font-semibold">
              Day by day
            </h2>
            <div className={`${card} p-4`}>
              <DayChart
                values={byDay(monthTxs, month)}
                monthKey={month}
                lastDay={isCurrent ? today.getDate() : null}
                currency={currency}
              />
            </div>
          </section>

          <section aria-labelledby="cats-h" className="mt-8">
            <h2 id="cats-h" className="mb-3 px-1 text-lg font-semibold">
              Where it went
            </h2>
            <div className={`${card} px-4 py-2`}>
              <CategoryBars
                totals={byCategory(monthTxs)}
                categoryById={categoryById}
                currency={currency}
                limit={5}
                onPick={onPickCategory}
              />
            </div>
          </section>

          <section aria-labelledby="recent-h" className="mt-8">
            <div className="mb-1 flex items-center justify-between px-1">
              <h2 id="recent-h" className="text-lg font-semibold">
                Latest
              </h2>
              <button type="button" onClick={onSeeAll} className="min-h-11 px-2 font-medium underline underline-offset-2">
                See all
              </button>
            </div>
            <ul className={`${card} divide-y divide-line px-4`}>
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
