import { memo, useCallback, useMemo } from 'react'
import { setDisplay, useDisplay } from '../data/display'
import { CategoryBars } from '../charts/CategoryBars'
import { DayChart } from '../charts/DayChart'
import type { useLedger } from '../data/useLedger'
import { localDateString } from '../db/money'
import {
  byCategory,
  daysInMonth,
  compareToPrevious,
  inMonth,
  monthLabel,
  recentSpending,
  shiftMonth,
  sum,
  type MonthKey,
} from '../insights/aggregates'
import { isCard } from '../insights/cards'
import { ScreenSkeleton } from '../ui/ScreenSkeleton'
import type { Suggestion } from '../insights/suggestions'
import { BackupNudge, DueCard, LogNudge } from '../ui/HomeCards'
import { BudgetPrompt } from '../ui/BudgetPrompt'
import { CardsCard } from '../ui/CardsCard'
import { GoalsSummary } from '../ui/GoalsSummary'
import { InsightCard } from '../ui/InsightCard'
import { SpendingOverview } from '../ui/SpendingOverview'
import { HomeHeader } from '../ui/HomeHeader'
import { MonthSwitcher } from '../ui/MonthSwitcher'
import { PlanAhead } from '../ui/PlanAhead'
import { SuggestionList } from '../ui/SuggestionList'
import { WalletPanel } from '../ui/WalletPanel'
import { HomePager } from '../ui/HomePager'
import { Icon, type IconName } from '../ui/Icon'
import { Timeline } from '../ui/Timeline'

type Ledger = ReturnType<typeof useLedger>

interface Props {
  ledger: Ledger
  month: MonthKey
  onMonth: (month: MonthKey) => void
  today: Date
  onPickCategory: (categoryId: number) => void
  onExample: (text: string) => void
  onOpenSettings: () => void
  onSeeAll: () => void
  /** The estimated balance stays hidden until this is true; the app owns it so it survives tab changes. */
  balanceShown: boolean
  onToggleBalance: () => void
  /** Regulars for the "On the Home screen" choice; empty when suggestions live elsewhere or are off. */
  suggestions: Suggestion[]
  onSuggestion: (s: Suggestion) => void
  /** The plus on a suggestion: adds it straight away, where tapping the suggestion itself opens the form first. */
  onQuickAddSuggestion?: (s: Suggestion) => void | Promise<void>
  /** Past the reminder time with nothing logged today. */
  logNudge: boolean
  /** Opens the add form. */
  onAdd: () => void
  /** Opens the goals, from the button in the top-right corner. */
  onOpenGoals: () => void
  /** Opens the upcoming payments: loans, auto-payments, subscriptions and salary. */
  onOpenUpcoming: () => void
  /** Opens the whole plan for the weeks ahead, from the View button on the Plan ahead cards. */
  onOpenPlan?: () => void
  /** Opens the credit cards, from the card that shows what is owed. */
  onOpenCards?: () => void
  /** Opens Activity on what was spent in a period, from the Today, Yesterday and Last 7 days figures. */
  onPickPeriod: (range: { from: string; to: string }) => void
  /** Opens the Insights screen, from the card that points to it. */
  onOpenInsights?: () => void
  /** Opens the AI insights page, from the card that points to Insights. */
  onOpenAi?: () => void
}

const EXAMPLES = ['450 lunch at Cafe', 'Uber 230 yesterday', 'Salary 80,000']

const card = 'rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]'

/** A way to another part of the app, as an icon and its name: the list of transactions and the flow of money have their own places, not a copy on Home. */
function GoTo({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`${card} flex min-h-[5.75rem] flex-col justify-between gap-2.5 p-3 text-left active:bg-surface-2`}>
      <span className="flex items-center justify-between">
        <span aria-hidden="true" data-icon={icon} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2">
          <Icon name={icon} size={22} />
        </span>
        <span aria-hidden="true" className="text-ink-2">
          <Icon name="chevRight" size={18} />
        </span>
      </span>
      <span className="text-[0.9375rem] font-semibold leading-snug">{label}</span>
    </button>
  )
}

export const Home = memo(function Home({
  ledger,
  month,
  onMonth,
  today,
  onPickCategory,
  onExample,
  onOpenSettings,
  onSeeAll,
  balanceShown,
  onToggleBalance,
  suggestions,
  onSuggestion,
  onQuickAddSuggestion,
  logNudge,
  onAdd,
  onOpenGoals,
  onOpenUpcoming,
  onOpenPlan,
  onOpenCards,
  onPickPeriod,
  onOpenInsights,
  onOpenAi,
}: Props) {
  const { txs, expenses, income, categoryById, currency, budgetMinor, loading } = ledger
  const todayKey = localDateString(today)
  const yesterdayKey = localDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))
  // Last 7 days is today and the six before it, the same days the figure adds up.
  const weekStartKey = localDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6))
  const currentMonth = todayKey.slice(0, 7)
  const isCurrent = month === currentMonth
  const display = useDisplay()
  // The timeline is not redrawn for a handler that is new at every render of Home, so this one keeps its identity.
  const pickDay = useCallback((date: string) => onPickPeriod({ from: date, to: date }), [onPickPeriod])

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
      monthTxs,
      categoryTotals: byCategory(monthTxs),
      expenseCount: monthTxs.length,
    }
  }, [txs, expenses, income, month, today])
  const { total, received, comparison, monthTxs, categoryTotals, recentlySpent, expenseCount } = view
  // Months with something in them get a dot in the month picker.
  const activeMonths = useMemo(() => new Set(txs.map((t) => t.date.slice(0, 7))), [txs])

  if (loading) return <ScreenSkeleton label="Home" />

  if (txs.length === 0) {
    return (
      <div>
        <HomeHeader today={today} goals={ledger.goals} onOpenGoals={onOpenGoals} />
        <div className="pt-10">
        <h2 className="type-headline text-balance">Let’s add your first one.</h2>
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
    <div className="font-text pb-4">
      <HomeHeader today={today} goals={ledger.goals} onOpenGoals={onOpenGoals} />
      <HomePager
        overview={
          <>
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
              onPickPeriod={onPickPeriod}
              monthKey={month}
            />

            {isCurrent && <PlanAhead ledger={ledger} today={today} onOpen={onOpenPlan} onSetUp={onOpenUpcoming} />}

            <WalletPanel
              monthName={name}
              receivedMinor={received}
              currency={currency}
              balanceMinor={ledger.estimatedBalanceMinor}
              balanceSet={ledger.balanceSet}
              accountLines={ledger.accounts.filter((a) => !isCard(a)).map((a) => ({ id: a.id, name: a.name, estimatedMinor: ledger.balances.get(a.id)?.estimatedMinor ?? 0 }))}
              shown={balanceShown}
              onToggle={onToggleBalance}
              onSetBalance={onOpenSettings}
            />

            {onOpenCards && <CardsCard ledger={ledger} today={today} onOpen={onOpenCards} />}

            {isCurrent && suggestions.length > 0 && (
              <section aria-labelledby="suggest-h" className="mt-6">
                <h2 id="suggest-h" className="mb-2 px-1 text-[0.9375rem] font-semibold text-ink-2">
                  Add again, one tap
                </h2>
                <SuggestionList
                  items={suggestions}
                  categoryById={categoryById}
                  currency={currency}
                  onPick={onSuggestion}
                  onQuickAdd={onQuickAddSuggestion}
                  tone="page"
                  variant="quick"
                />
              </section>
            )}

            {/* Below the suggestions, so the first things after the numbers are the ones you can act on. */}
            {budgetMinor === null && <BudgetPrompt onSetBudget={onOpenSettings} />}

            {total > 0 && (
              <>
                <section aria-labelledby="daily-h" className="mt-8">
                  <h2 id="daily-h" className="type-title mb-3 px-1">
                    Day by day
                  </h2>
                  <div className={`${card} p-4`}>
                    {/* Keyed by the month, so each month's columns rise afresh and a day chosen in one does not carry to the next. */}
                    <DayChart
                      key={month}
                      txs={monthTxs}
                      categoryById={categoryById}
                      monthKey={month}
                      lastDay={isCurrent ? today.getDate() : null}
                      currency={currency}
                      budgetMinor={budgetMinor}
                      onPickDay={pickDay}
                    />
                  </div>
                </section>

                {/* The list of what was spent is Activity, and where the money flows is in Insights: one tap to each, not a copy here. */}
                <nav aria-label="More about this month" className="mt-8 grid grid-cols-2 gap-3">
                  <GoTo icon="list" label="Recent transactions" onClick={onSeeAll} />
                  {onOpenInsights && <GoTo icon="bars" label="Where the money flows" onClick={onOpenInsights} />}
                </nav>

                <section aria-labelledby="cats-h" className="mt-8">
                  <h2 id="cats-h" className="type-title mb-1 px-1">
                    Where it went
                  </h2>
                  <div className="px-1">
                    <CategoryBars totals={categoryTotals} categoryById={categoryById} currency={currency} limit={5} onPick={onPickCategory} />
                  </div>
                </section>

                {onOpenInsights && <InsightCard totals={categoryTotals} totalMinor={total} categoryById={categoryById} monthName={name} onOpen={onOpenInsights} onOpenAi={onOpenAi} />}
              </>
            )}

            <GoalsSummary goals={ledger.goals} currency={currency} today={today} onOpen={onOpenGoals} />
          </>
        }
        timeline={<Timeline expenses={expenses} categoryById={categoryById} currency={currency} today={today} onPickDay={pickDay} />}
      />
    </div>
  )
})
