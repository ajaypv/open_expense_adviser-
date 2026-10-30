import { memo, useMemo } from 'react'
import type { LedgerTx } from '../data/buildLedger'
import { setDisplay, useDisplay } from '../data/display'
import { CategoryBars } from '../charts/CategoryBars'
import { DayChart } from '../charts/DayChart'
import { Meter } from '../charts/Meter'
import type { useLedger } from '../data/useLedger'
import { formatMoney, localDateString } from '../db/money'
import {
  byCategory,
  byDay,
  compareToPrevious,
  inMonth,
  monthLabel,
  recentSpending,
  shiftMonth,
  sum,
  type MonthKey,
} from '../insights/aggregates'
import { newestFirst } from '../insights/order'
import { ScreenSkeleton } from '../ui/ScreenSkeleton'
import type { Suggestion } from '../insights/suggestions'
import { AnimatedMoney } from '../ui/AnimatedMoney'
import { BackupNudge, DueCard, LogNudge } from '../ui/HomeCards'
import { HomeHeader } from '../ui/HomeHeader'
import { Icon } from '../ui/Icon'
import { MonthSwitcher } from '../ui/MonthSwitcher'
import { SuggestionList } from '../ui/SuggestionList'
import { TxList } from '../ui/TxList'
import { WalletPanel } from '../ui/WalletPanel'

type Ledger = ReturnType<typeof useLedger>

interface Props {
  ledger: Ledger
  month: MonthKey
  onMonth: (month: MonthKey) => void
  today: Date
  onPickCategory: (categoryId: number) => void
  onEdit: (tx: LedgerTx) => void
  onExample: (text: string) => void
  onOpenSettings: () => void
  onSeeAll: () => void
  /** The estimated balance stays hidden until this is true; the app owns it so it survives tab changes. */
  balanceShown: boolean
  onToggleBalance: () => void
  /** Regulars for the "On the Home screen" choice; empty when suggestions live elsewhere or are off. */
  suggestions: Suggestion[]
  onSuggestion: (s: Suggestion) => void
  /** Past the reminder time with nothing logged today. */
  logNudge: boolean
  /** Opens the add form. */
  onAdd: () => void
  /** Opens the goals, from the button in the top-right corner. */
  onOpenGoals: () => void
}

const EXAMPLES = ['450 lunch at Cafe', 'Uber 230 yesterday', 'Salary 80,000']

const card = 'rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]'

export const Home = memo(function Home({
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
  logNudge,
  onAdd,
  onOpenGoals,
}: Props) {
  const { txs, expenses, income, categoryById, currency, budgetMinor, loading } = ledger
  const currentMonth = localDateString(today).slice(0, 7)
  const isCurrent = month === currentMonth
  const display = useDisplay()

  // Everything below depends only on the data, the month and the day, so it is worked out once
  // per change rather than on every render.
  const view = useMemo(() => {
    // Spending charts and totals use money sent only; the latest list shows both directions.
    const monthTxs = inMonth(expenses, month)
    return {
      total: sum(monthTxs),
      received: sum(inMonth(income, month)),
      comparison: compareToPrevious(expenses, month, today),
      recentlySpent: recentSpending(expenses, today),
      daily: byDay(monthTxs, month),
      categoryTotals: byCategory(monthTxs),
      recent: inMonth(txs, month).sort(newestFirst).slice(0, 5),
    }
  }, [txs, expenses, income, month, today])
  const { total, received, comparison, daily, categoryTotals, recent, recentlySpent } = view
  // Months with something in them get a dot in the month picker.
  const activeMonths = useMemo(() => new Set(txs.map((t) => t.date.slice(0, 7))), [txs])

  if (loading) return <ScreenSkeleton label="Home" />

  if (txs.length === 0) {
    return (
      <div>
        <HomeHeader today={today} goals={ledger.goals} onOpenGoals={onOpenGoals} />
        <div className="pt-10">
        <h2 className="text-3xl font-bold tracking-tight">Let’s add your first one.</h2>
        <p className="mt-3 max-w-sm text-lg text-ink-2">
          Type what you spent or received in the bar below, as you would say it. Tap an example, then press send. Or use + for the full form.
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
      </div>
    )
  }

  const name = monthLabel(month).split(' ')[0]
  const prevName = monthLabel(shiftMonth(month, -1)).split(' ')[0]
  const delta = comparison.deltaPct
  const against = `${comparison.partial ? 'the same days in ' : ''}${prevName}`

  return (
    <div className="pb-4">
      <HomeHeader today={today} goals={ledger.goals} onOpenGoals={onOpenGoals} />
      <MonthSwitcher month={month} currentMonth={currentMonth} onChange={onMonth} activeMonths={activeMonths} />

      {isCurrent && <BackupNudge transactionCount={txs.length} />}
      {isCurrent && <DueCard ledger={ledger} today={today} />}
      {isCurrent && logNudge && <LogNudge onAdd={onAdd} />}

      <section aria-label="Summary" className={`${card} relative mt-3 p-5`}>
        <button
          type="button"
          aria-pressed={display.privacy}
          onClick={() => setDisplay({ privacy: !display.privacy })}
          aria-label={display.privacy ? 'Show amounts' : 'Hide amounts'}
          className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"
        >
          <Icon name={display.privacy ? 'eyeOff' : 'eye'} size={20} />
        </button>
        {total === 0 ? (
          <p className="text-2xl font-semibold tracking-tight">Nothing spent in {name} yet.</p>
        ) : (
          <>
            <p className="text-ink-2">
              {isCurrent ? "You've spent so far in " : 'You spent in '}
              {name}
            </p>
            <p className="mt-1 whitespace-nowrap text-[clamp(2.75rem,15vw,3.75rem)] font-extrabold leading-none tracking-[-0.04em] tabular-nums">
              <AnimatedMoney minor={total} currency={currency} id="hero" />
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

      {isCurrent && (
        <section aria-label="Recent spending" className={`${card} mt-3 grid grid-cols-3 divide-x divide-line py-4`}>
          {(
            [
              ['Today', 'today', recentlySpent.todayMinor],
              ['Yesterday', 'yesterday', recentlySpent.yesterdayMinor],
              ['Last 7 days', 'last7', recentlySpent.last7Minor],
            ] as const
          ).map(([label, id, amount]) => (
            <div key={label} role="group" aria-label={`${label}: ${formatMoney(amount, currency)}`} className="min-w-0 px-4 first:pl-5 last:pr-5">
              <p className="text-sm font-medium text-ink-2">{label}</p>
              <p className={`mt-0.5 truncate text-xl font-bold tracking-tight tabular-nums ${amount === 0 ? 'text-ink-2' : ''}`}>
                <AnimatedMoney minor={amount} currency={currency} id={id} compact />
              </p>
            </div>
          ))}
        </section>
      )}

      <WalletPanel
        monthName={name}
        receivedMinor={received}
        currency={currency}
        balanceMinor={ledger.estimatedBalanceMinor}
        balanceSet={ledger.balanceSet}
        accountLines={ledger.accounts.map((a) => ({ id: a.id, name: a.name, estimatedMinor: ledger.balances.get(a.id)?.estimatedMinor ?? 0 }))}
        shown={balanceShown}
        onToggle={onToggleBalance}
        onSetBalance={onOpenSettings}
      />


      {isCurrent && suggestions.length > 0 && (
        <section aria-labelledby="suggest-h" className="mt-8">
          <h2 id="suggest-h" className="mb-3 px-1 text-xl font-bold tracking-tight">
            Suggested for now
          </h2>
          <SuggestionList items={suggestions} categoryById={categoryById} currency={currency} onPick={onSuggestion} tone="page" />
        </section>
      )}

      {total > 0 && (
        <>
          <section aria-labelledby="daily-h" className="mt-8">
            <h2 id="daily-h" className="mb-3 px-1 text-xl font-bold tracking-tight">
              Day by day
            </h2>
            <div className={`${card} p-4`}>
              <DayChart
                values={daily}
                monthKey={month}
                lastDay={isCurrent ? today.getDate() : null}
                currency={currency}
              />
            </div>
          </section>

          <section aria-labelledby="cats-h" className="mt-8">
            <h2 id="cats-h" className="mb-3 px-1 text-xl font-bold tracking-tight">
              Where it went
            </h2>
            <div className={`${card} px-4 py-2`}>
              <CategoryBars
                totals={categoryTotals}
                categoryById={categoryById}
                currency={currency}
                limit={5}
                onPick={onPickCategory}
              />
            </div>
          </section>

          <section aria-labelledby="recent-h" className="mt-8">
            <div className="mb-1 flex items-center justify-between px-1">
              <h2 id="recent-h" className="text-xl font-bold tracking-tight">
                Latest
              </h2>
              <button type="button" onClick={onSeeAll} className="min-h-11 px-2 font-medium underline underline-offset-2">
                See all
              </button>
            </div>
            <TxList rows={recent} categoryById={categoryById} accountById={ledger.accountById} currency={currency} showDate onEdit={onEdit} />
          </section>
        </>
      )}
    </div>
  )
})
