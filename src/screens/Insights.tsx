import { memo, useMemo } from 'react'
import { BarList } from '../charts/BarList'
import { CategoryBars } from '../charts/CategoryBars'
import { Meter } from '../charts/Meter'
import { MonthColumns } from '../charts/MonthColumns'
import { Movers } from '../charts/Movers'
import { PaceChart } from '../charts/PaceChart'
import { TrendBars } from '../charts/TrendBars'
import { WeekdayBars } from '../charts/WeekdayBars'
import { useDisplay } from '../data/display'
import type { useLedger } from '../data/useLedger'
import { formatMoney, formatMoneyCompact, localDateString } from '../db/money'
import {
  byCategory,
  byWeekday,
  categoryChanges,
  compareToPrevious,
  cumulative,
  daysInMonth,
  inMonth,
  monthLabel,
  projectedTotal,
  shiftMonth,
  sum,
  topMerchants,
  type MonthKey,
} from '../insights/aggregates'
import { categoryBudgetStatus, categoryTrends, monthlyTotals, savingsFor, unusualExpenses } from '../insights/trends'
import { Icon } from '../ui/Icon'
import { MonthSwitcher } from '../ui/MonthSwitcher'

type Ledger = ReturnType<typeof useLedger>

interface Props {
  ledger: Ledger
  month: MonthKey
  onMonth: (month: MonthKey) => void
  today: Date
  onOpenSettings: () => void
}

const firstWord = (key: MonthKey) => monthLabel(key).split(' ')[0]

// 2026-10-26 is a Monday; index 0 = Monday.
const weekdayName = (i: number) =>
  new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date(2026, 9, 26 + i))

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {intro && <p className="mt-0.5 text-[0.9375rem] text-ink-2">{intro}</p>}
      {children}
    </section>
  )
}

/** What the logged expenses say, computed on the device. Each block answers one question. */
export const Insights = memo(function Insights({ ledger, month, onMonth, today, onOpenSettings }: Props) {
  useDisplay() // amounts are masked or regrouped by display settings, so redraw when they change
  // Insights describe spending, so they use money sent only; received money feeds the balance.
  const { expenses: txs, income, categoryById, currency, budgetMinor, categoryBudgets } = ledger
  const currentMonth = localDateString(today).slice(0, 7)
  const isCurrent = month === currentMonth
  const money = (m: number) => formatMoney(m, currency)
  // Months with expenses get a dot in the month picker (this screen only looks at money sent).
  const activeMonths = useMemo(() => new Set(txs.map((t) => t.date.slice(0, 7))), [txs])

  const monthTxs = inMonth(txs, month)
  const total = sum(monthTxs)
  const name = firstWord(month)
  const prevKey = shiftMonth(month, -1)
  const prevName = firstWord(prevKey)
  const prevTxs = inMonth(txs, prevKey)
  const hasPrevious = prevTxs.length > 0

  const cats = byCategory(monthTxs)
  const elapsed = isCurrent ? today.getDate() : daysInMonth(month)
  const cmp = compareToPrevious(txs, month, today)
  const projected = projectedTotal(total, month, today)
  const merchants = topMerchants(monthTxs, 5)
  const weekdays = byWeekday(monthTxs)
  const peakDay = weekdays.indexOf(Math.max(...weekdays))
  const changes = hasPrevious ? categoryChanges(txs, month, today).slice(0, 4) : []
  const biggest = total > 0 ? monthTxs.reduce((a, b) => (b.amountMinor > a.amountMinor ? b : a)) : null

  // Money in against money out, what each category's limit has left, the odd big purchase, and the longer view.
  const savings = savingsFor(txs, income, month)
  const budgetRows = categoryBudgetStatus(monthTxs, categoryBudgets)
  const unusual = unusualExpenses(txs, month)
  const trends = categoryTrends(txs, month, 6, 4).filter((t) => t.months.some((m) => m > 0))
  const yearTotals = monthlyTotals(txs, month, 12)
  const monthsWithData = yearTotals.filter((m) => m.totalMinor > 0).length

  let pace: string | null = null
  if (projected !== null) {
    const diff = budgetMinor === null ? null : projected - budgetMinor
    pace =
      `On pace for ${money(projected)} this month` +
      (diff === null ? '.' : diff > 0 ? `, ${money(diff)} over budget.` : `, ${money(-diff)} under budget.`)
  } else if (!isCurrent && cmp.deltaPct !== null) {
    pace =
      cmp.deltaPct === 0
        ? `You spent ${money(total)} in ${name}, the same as ${prevName}.`
        : `You spent ${money(total)} in ${name}, ${Math.abs(cmp.deltaPct)}% ${cmp.deltaPct > 0 ? 'more' : 'less'} than ${prevName}.`
  } else if (isCurrent) {
    pace = 'A month-end estimate appears after a few days of expenses.'
  }

  const stats = [
    { label: 'Daily average', value: formatMoneyCompact(Math.round(total / elapsed), currency), full: money(Math.round(total / elapsed)) },
    { label: 'Biggest expense', value: formatMoneyCompact(biggest?.amountMinor ?? 0, currency), full: money(biggest?.amountMinor ?? 0) },
    { label: 'Expenses logged', value: String(monthTxs.length), full: String(monthTxs.length) },
  ]

  return (
    <div className="pb-8">
      <h1 className="sr-only">Insights</h1>
      <MonthSwitcher month={month} currentMonth={currentMonth} onChange={onMonth} activeMonths={activeMonths} />

      {total === 0 ? (
        <p className="mt-8 text-3xl font-semibold leading-tight tracking-tight">
          Nothing to report for {name} yet.
          <span className="mt-3 block text-lg font-normal tracking-normal text-ink-2">
            Insights appear once you&rsquo;ve logged a few expenses.
          </span>
        </p>
      ) : (
        <>
          <section aria-label="Highlights" className="mt-5">
            <p className="text-[clamp(1.5rem,6.8vw,1.875rem)] font-semibold leading-tight tracking-tight [&_b]:font-bold">
              <b>{categoryById.get(cats[0].categoryId)?.name ?? 'One category'}</b> is your biggest spend at{' '}
              <b>{Math.round((cats[0].totalMinor / total) * 100)}%</b>.
            </p>
            {pace && <p className="mt-3 text-lg text-ink-2">{pace}</p>}
          </section>

          <section
            aria-labelledby="pace-h"
            className="mt-8 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]"
          >
            <h2 id="pace-h" className="mb-3 text-lg font-semibold">
              Spending pace
            </h2>
            <PaceChart
              current={cumulative(monthTxs, month, isCurrent ? elapsed : null)}
              previous={hasPrevious ? cumulative(prevTxs, prevKey, null) : []}
              monthKey={month}
              currentLabel={name}
              previousLabel={prevName}
              budgetMinor={budgetMinor}
              lastDay={elapsed}
              currency={currency}
            />
          </section>

          <dl className="mt-8 grid grid-cols-3 divide-x divide-line">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col-reverse px-3 first:pl-0 last:pr-0" aria-label={`${s.label}: ${s.full}`}>
                <dt className="text-sm text-ink-2">{s.label}</dt>
                <dd className="text-[clamp(1.125rem,5.4vw,1.5rem)] font-semibold tracking-tight">{s.value}</dd>
              </div>
            ))}
          </dl>

          {savings.receivedMinor > 0 && (
            <Section id="savings-h" title="Money in and out">
              <dl className="mt-3 grid grid-cols-2 gap-3 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]">
                <div className="flex flex-col-reverse">
                  <dt className="text-sm text-ink-2">Received</dt>
                  <dd className="text-xl font-semibold tabular-nums">{money(savings.receivedMinor)}</dd>
                </div>
                <div className="flex flex-col-reverse">
                  <dt className="text-sm text-ink-2">Sent</dt>
                  <dd className="text-xl font-semibold tabular-nums">{money(savings.sentMinor)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-lg">
                {savings.savedMinor >= 0 ? (
                  <>
                    You kept <b className="font-semibold">{money(savings.savedMinor)}</b>
                    {savings.ratePct !== null && <>, {savings.ratePct}% of what came in</>}.
                  </>
                ) : (
                  <>
                    You spent <b className="font-semibold text-critical">{money(-savings.savedMinor)} more</b> than came in
                    {isCurrent ? ' so far' : ''}.
                  </>
                )}
              </p>
            </Section>
          )}

          {budgetRows.length > 0 && (
            <Section id="budgets-h" title="Budgets by category">
              <ul className="mt-3 space-y-5 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]">
                {budgetRows.map((b) => {
                  const cat = categoryById.get(b.categoryId)
                  return (
                    <li key={b.categoryId}>
                      <p className="mb-1.5 flex items-center gap-2 font-medium">
                        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: cat?.color ?? 'var(--other)' }} />
                        {cat?.name ?? 'Other'}
                      </p>
                      <Meter spentMinor={b.spentMinor} limitMinor={b.limitMinor} currency={currency} />
                    </li>
                  )
                })}
              </ul>
            </Section>
          )}

          {unusual.length > 0 && (
            <Section id="unusual-h" title="Bigger than usual" intro="Purchases far above what that category normally costs.">
              <ul className="mt-3 divide-y divide-line rounded-3xl bg-surface px-4 shadow-[0_0_0_1px_var(--ring)]">
                {unusual.map((u) => (
                  <li key={u.tx.id} className="flex items-start gap-3 py-3">
                    <span aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--warn)' }}>
                      <Icon name="warn" size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {u.tx.merchant || categoryById.get(u.tx.categoryId)?.name || 'Expense'}
                      </p>
                      <p className="text-sm text-ink-2">
                        {Math.round(u.times * 10) / 10} times the usual {categoryById.get(u.tx.categoryId)?.name ?? 'category'}{' '}
                        spend of {money(u.typicalMinor)}.
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{money(u.tx.amountMinor)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {changes.length > 0 && (
            <Section
              id="moved-h"
              title="What changed"
              intro={`Against ${prevName}${cmp.partial ? ', over the same days' : ''}.`}
            >
              <Movers changes={changes} categoryById={categoryById} currency={currency} previousLabel={prevName} />
            </Section>
          )}

          {monthTxs.length >= 5 && weekdays[peakDay] > 0 && (
            <Section
              id="days-h"
              title="Busiest days"
              intro={`${weekdayName(peakDay)}s take ${Math.round((weekdays[peakDay] / total) * 100)}% of your spending.`}
            >
              <WeekdayBars totals={weekdays} currency={currency} />
            </Section>
          )}

          <Section id="cats-h" title="Where it went">
            <CategoryBars totals={cats} categoryById={categoryById} currency={currency} />
          </Section>

          {merchants.length >= 2 && (
            <Section id="places-h" title="Places you spend most">
              <BarList
                currency={currency}
                rows={merchants.map((m) => ({
                  key: m.name.toLowerCase(),
                  label: m.name,
                  color: 'var(--s1)',
                  valueMinor: m.totalMinor,
                  detail: `${m.count} ${m.count === 1 ? 'visit' : 'visits'}`,
                }))}
              />
            </Section>
          )}

          {trends.length > 0 && monthsWithData >= 2 && (
            <Section id="trends-h" title="Trends by category" intro="The last six months for your biggest categories.">
              <div className="mt-3 rounded-3xl bg-surface px-4 shadow-[0_0_0_1px_var(--ring)]">
                <TrendBars trends={trends} categoryById={categoryById} currency={currency} />
              </div>
            </Section>
          )}

          {monthsWithData >= 2 && (
            <Section id="year-h" title="The last 12 months">
              <div className="mt-3 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]">
                <MonthColumns totals={yearTotals} currency={currency} />
              </div>
            </Section>
          )}
        </>
      )}

      <section aria-labelledby="ai-h" className="mt-10 rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_var(--ring)]">
        <h2 id="ai-h" className="text-lg font-semibold">
          Advice from AI
        </h2>
        <p className="mt-1.5 text-ink-2">
          Soon you&rsquo;ll be able to ask where to cut back and get charts drawn for you. It runs on your own API key,
          which stays on this device.
        </p>
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-4 min-h-11 rounded-full px-4 font-medium shadow-[0_0_0_1px_var(--ring)]"
        >
          Open settings
        </button>
      </section>
    </div>
  )
})
