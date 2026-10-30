import { memo, useMemo } from 'react'
import type { LedgerTx } from '../data/buildLedger'
import { setDisplay, useDisplay } from '../data/display'
import { CategoryBars } from '../charts/CategoryBars'
import { DayChart } from '../charts/DayChart'
import type { useLedger } from '../data/useLedger'
import { localDateString } from '../db/money'
import {
  byCategory,
  byDay,
  daysInMonth,
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
import { BackupNudge, DueCard, LogNudge } from '../ui/HomeCards'
import { GoalsSummary } from '../ui/GoalsSummary'
import { InsightCard } from '../ui/InsightCard'
import { SpendingOverview } from '../ui/SpendingOverview'
import { HomeHeader } from '../ui/HomeHeader'
import { MonthSwitcher } from '../ui/MonthSwitcher'
import { SuggestionList } from '../ui/SuggestionList'
import { TxList } from '../ui/TxList'
import { UpcomingCard } from '../ui/UpcomingCard'
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
  /** Opens the upcoming payments: loans, auto-payments, subscriptions and salary. */
  onOpenUpcoming: () => void
  /** Opens Activity on what was spent in a period, from the Today, Yesterday and Last 7 days figures. */
  onPickPeriod: (range: { from: string; to: string }) => void
  /** Opens the Insights screen, from the card that points to it. */
  onOpenInsights?: () => void
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
  onOpenUpcoming,
  onPickPeriod,
  onOpenInsights,
}: Props) {
  const { txs, expenses, income, categoryById, currency, budgetMinor, loading } = ledger
  const todayKey = localDateString(today)
  const yesterdayKey = localDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))
  // Last 7 days is today and the six before it, the same days the figure adds up.
  const weekStartKey = localDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6))
  const currentMonth = todayKey.slice(0, 7)
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
      expenseCount: monthTxs.length,
    }
  }, [txs, expenses, income, month, today])
  const { total, received, comparison, daily, categoryTotals, recent, recentlySpent, expenseCount } = view
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
  // The average is over the days so far in the current month, and over the whole month once it is over.
  const elapsedDays = isCurrent ? today.getDate() : daysInMonth(month)

  return (
    <div className="pb-4">
      <HomeHeader today={today} goals={ledger.goals} onOpenGoals={onOpenGoals} />
      <MonthSwitcher month={month} currentMonth={currentMonth} onChange={onMonth} activeMonths={activeMonths} />

      {isCurrent && <BackupNudge transactionCount={txs.length} />}
      {isCurrent && <DueCard ledger={ledger} today={today} />}
      {isCurrent && logNudge && <LogNudge onAdd={onAdd} />}

      <SpendingOverview
        monthName={name}
        isCurrent={isCurrent}
        totalMinor={total}
        deltaPct={delta}
        partial={comparison.partial}
        prevName={prevName}
        dailyAverageMinor={Math.round(total / elapsedDays / 100) * 100}
        expenseCount={expenseCount}
        budgetMinor={budgetMinor}
        currency={currency}
        periods={
          isCurrent
            ? [
                { id: 'today', label: 'Today', amountMinor: recentlySpent.todayMinor, from: todayKey, to: todayKey },
                { id: 'yesterday', label: 'Yesterday', amountMinor: recentlySpent.yesterdayMinor, from: yesterdayKey, to: yesterdayKey },
                { id: 'last7', label: 'Last 7 days', amountMinor: recentlySpent.last7Minor, from: weekStartKey, to: todayKey },
              ]
            : []
        }
        privacy={display.privacy}
        onTogglePrivacy={() => setDisplay({ privacy: !display.privacy })}
        onSetBudget={onOpenSettings}
        onPickPeriod={onPickPeriod}
      />

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

      {isCurrent && <UpcomingCard ledger={ledger} today={today} onOpen={onOpenUpcoming} />}

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
              <DayChart values={daily} monthKey={month} lastDay={isCurrent ? today.getDate() : null} currency={currency} />
            </div>
          </section>

          <section aria-labelledby="recent-h" className="mt-8">
            <div className="mb-1 flex items-center justify-between px-1">
              <h2 id="recent-h" className="text-xl font-bold tracking-tight">
                Recent transactions
              </h2>
              <button type="button" onClick={onSeeAll} className="min-h-11 px-2 font-medium underline underline-offset-2">
                See all
              </button>
            </div>
            <TxList rows={recent} categoryById={categoryById} accountById={ledger.accountById} currency={currency} showDate onEdit={onEdit} />
          </section>

          <section aria-labelledby="cats-h" className="mt-8">
            <h2 id="cats-h" className="mb-1 px-1 text-xl font-bold tracking-tight">
              Where it went
            </h2>
            <div className="px-1">
              <CategoryBars totals={categoryTotals} categoryById={categoryById} currency={currency} limit={5} onPick={onPickCategory} />
            </div>
          </section>

          {onOpenInsights && <InsightCard totals={categoryTotals} totalMinor={total} categoryById={categoryById} monthName={name} onOpen={onOpenInsights} />}
        </>
      )}

      <GoalsSummary goals={ledger.goals} currency={currency} today={today} onOpen={onOpenGoals} />
    </div>
  )
})
