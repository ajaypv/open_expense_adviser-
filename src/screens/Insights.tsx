import { BarList } from '../charts/BarList'
import { CategoryBars } from '../charts/CategoryBars'
import { Movers } from '../charts/Movers'
import { PaceChart } from '../charts/PaceChart'
import { WeekdayBars } from '../charts/WeekdayBars'
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
export function Insights({ ledger, month, onMonth, today, onOpenSettings }: Props) {
  // Insights describe spending, so they use money sent only; received money feeds the balance.
  const { expenses: txs, categoryById, currency, budgetMinor } = ledger
  const currentMonth = localDateString(today).slice(0, 7)
  const isCurrent = month === currentMonth
  const money = (m: number) => formatMoney(m, currency)

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
      <MonthSwitcher month={month} currentMonth={currentMonth} onChange={onMonth} />

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
}
