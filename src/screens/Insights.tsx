import { memo, useMemo, useState } from 'react'
import { BarList } from '../charts/BarList'
import { CategoryBars } from '../charts/CategoryBars'
import { CategoryBubbles } from '../charts/CategoryBubbles'
import { CategoryDonut } from '../charts/CategoryDonut'
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
import { placesIn } from '../insights/places'
import { regularPayments } from '../insights/regular'
import { detectRecurring } from '../insights/recurring'
import { describeWhen, forecast, TAG_LABELS, tagOf, upcomingPayments, type UpcomingPayment } from '../insights/upcoming'
import { repeatingSpend, type RepeatingSpend } from '../insights/repeats'
import { categoryBudgetStatus, categoryTrends, monthlyTotals, savingsFor, unusualExpenses } from '../insights/trends'
import { AiEntry } from '../ui/AiEntry'
import { Icon } from '../ui/Icon'
import { PaymentBadge } from '../ui/PaymentBadge'
import { paymentName, shortDay, shortfallPhrase, signedAmount } from '../ui/upcomingText'
import { MonthStrip } from '../ui/MonthStrip'
import { PlacesMap } from '../ui/PlacesMap'
import { MonthSwitcher } from '../ui/MonthSwitcher'
import { ScreenSkeleton } from '../ui/ScreenSkeleton'

type Ledger = ReturnType<typeof useLedger>

interface Props {
  ledger: Ledger
  month: MonthKey
  onMonth: (month: MonthKey) => void
  today: Date
  onOpenSettings: () => void
  /** Opens Activity on one category for this month. */
  onPickCategory?: (categoryId: number) => void
  /** Opens the list of regular payments, to see them all or add one. */
  onOpenUpcoming?: () => void
  /** Opens the AI insights page. */
  onOpenAi?: () => void
}

const firstWord = (key: MonthKey) => monthLabel(key).split(' ')[0]

// 2026-10-26 is a Monday; index 0 = Monday.
const weekdayName = (i: number) =>
  new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date(2026, 9, 26 + i))

/** How soon a payment matters: late, within three days, further off, or money on its way in. */
const statusOf = (p: UpcomingPayment) => (p.overdue ? 'late' : p.kind === 'income' ? 'arriving' : p.daysLeft <= 3 ? 'soon' : 'later')
const DOT = { late: 'var(--critical)', soon: 'var(--warn-ui)', arriving: 'var(--good-text)', later: 'var(--ink-2)' } as const

/** A small pill with a coloured dot and when the payment is due. The words carry the meaning; the dot only backs them up. */
function StatusPill({ payment }: { payment: UpcomingPayment }) {
  const status = statusOf(payment)
  return (
    <span data-status={status} className={`inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 text-sm ${status === 'late' ? 'font-medium text-critical' : 'text-ink-2'}`}>
      <span data-dot aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: DOT[status] }} />
      {describeWhen(payment.daysLeft)}
    </span>
  )
}

/** "11 times, almost every day, usually ₹20": how often, and what it usually costs. */
function repeatDetail(r: RepeatingSpend, money: (minor: number) => string): string {
  const how = { daily: 'almost every day', weekly: 'about every week', monthly: 'every month', regular: null }[r.pattern]
  const text = [r.count > 1 ? `${r.count} times` : null, how, `usually ${money(r.typicalMinor)}`].filter(Boolean).join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="text-xl font-bold tracking-tight">
        {title}
      </h2>
      {intro && <p className="mt-0.5 text-ink-2">{intro}</p>}
      {children}
    </section>
  )
}

/** What the logged expenses say, computed on the device. Each block answers one question. */
export const Insights = memo(function Insights({ ledger, month, onMonth, today, onOpenSettings, onPickCategory, onOpenUpcoming, onOpenAi }: Props) {
  useDisplay() // amounts are masked or regrouped by display settings, so redraw when they change
  const [categoryView, setCategoryView] = useState<'bubbles' | 'donut' | 'list'>('bubbles')
  // Insights describe spending, so they use money sent only; received money feeds the balance.
  const { expenses: txs, income, categoryById, currency, budgetMinor, categoryBudgets, recurring, rates, balanceSet, estimatedBalanceMinor } = ledger
  const currentMonth = localDateString(today).slice(0, 7)
  const isCurrent = month === currentMonth
  const money = (m: number) => formatMoney(m, currency)
  // Months with expenses get a dot in the month picker (this screen only looks at money sent).
  const activeMonths = useMemo(() => new Set(txs.map((t) => t.date.slice(0, 7))), [txs])

  const name = firstWord(month)
  const prevKey = shiftMonth(month, -1)
  const prevName = firstWord(prevKey)

  // Everything below is worked out from the data and the month, so it is done once per change to either, and
  // not again when only something like Hide amounts redraws the screen.
  const {
    monthTxs, total, prevTxs, hasPrevious, cats, elapsed, cmp, projected, merchants, weekdays, peakDay, changes, biggest,
    savings, budgetRows, unusual, trends, yearTotals, monthsWithData, olderMonths, repeats, spots, hasAnyPlace,
    regular, looksRegular, balanceCheck,
  } = useMemo(() => {
    const prevKey = shiftMonth(month, -1)
    const monthTxs = inMonth(txs, month)
    const total = sum(monthTxs)
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
    const trends = categoryTrends(txs, month, 6, 4, isCurrent).filter((t) => t.months.some((m) => m > 0))
    const yearTotals = monthlyTotals(txs, month, 12)
    const monthsWithData = yearTotals.filter((m) => m.totalMinor > 0).length

    // The months before last month, for the pace chart's "last 3 months". They run back from last month's
    // neighbour and stop at the first one with no spending, so the comparison never has a hole in it.
    const olderMonths: { label: string; series: (number | null)[] }[] = []
    for (let back = 2; back <= 3 && hasPrevious; back++) {
      const key = shiftMonth(month, -back)
      const rows = inMonth(txs, key)
      if (rows.length === 0) break
      olderMonths.push({ label: firstWord(key), series: cumulative(rows, key, null) })
    }

    const repeats = repeatingSpend(txs, month, today)

    // Where it was spent, for the map at the bottom; and whether any place has ever been recorded, to tell
    // "nothing this month" from "never switched on".
    const spots = placesIn(txs, month, categoryById)
    const hasAnyPlace = txs.some((t) => t.location !== undefined && t.deletedAt === undefined)

    // Regular payments look ahead from today, so they are only worked out for the current month: what they come
    // to, spending that looks regular but is not set up, and whether the estimated balance covers the next 30 days.
    const todayKey = localDateString(today)
    const moneyIn = { currency, rates }
    const regular = isCurrent ? regularPayments(recurring, todayKey, moneyIn) : null
    const looksRegular = isCurrent ? detectRecurring(txs, recurring, todayKey).filter((d) => d.kind === 'expense') : []
    const balanceCheck =
      regular && balanceSet ? forecast(estimatedBalanceMinor, upcomingPayments(recurring, todayKey, 30, moneyIn), todayKey) : null

    return {
      monthTxs, total, prevTxs, hasPrevious, cats, elapsed, cmp, projected, merchants, weekdays, peakDay, changes, biggest,
      savings, budgetRows, unusual, trends, yearTotals, monthsWithData, olderMonths, repeats, spots, hasAnyPlace,
      regular, looksRegular, balanceCheck,
    }
  }, [txs, income, month, today, isCurrent, categoryBudgets, categoryById, recurring, rates, currency, balanceSet, estimatedBalanceMinor])

  // Every month from the first with spending up to this one, for the strip that scrolls along them. Looking back
  // from a past month still leaves the later ones in the strip, so there is a way forward.
  const stripMonths = useMemo(() => {
    const totals = new Map<MonthKey, number>()
    for (const t of txs) totals.set(t.date.slice(0, 7), (totals.get(t.date.slice(0, 7)) ?? 0) + t.amountMinor)
    const first = [...totals.keys()].sort()[0]
    if (first === undefined) return []
    const last = month > currentMonth ? month : currentMonth
    const out: { key: MonthKey; totalMinor: number }[] = []
    for (let key = first < month ? first : month; key <= last && out.length < 60; key = shiftMonth(key, 1)) {
      out.push({ key, totalMinor: totals.get(key) ?? 0 })
    }
    return out
  }, [txs, month, currentMonth])

  let pace: string | null = null
  if (projected !== null) {
    const diff = budgetMinor === null ? null : projected - budgetMinor
    pace =
      `At this rate, about ${money(projected)} by the end of ${name}` +
      (diff === null ? ' (a rough guess).' : diff > 0 ? `, ${money(diff)} over budget (a rough guess).` : `, ${money(-diff)} under budget (a rough guess).`)
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

  const latestMonth = [...activeMonths].sort().at(-1)
  const repeatTotal = repeats.reduce((acc, r) => acc + r.totalMinor, 0)

  const moneyInOut =
    savings.receivedMinor > 0 ? (
      <Section id="savings-h" title="Money in and out">
        <dl className="mt-3 grid grid-cols-2 gap-3 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]">
          <div className="flex flex-col-reverse">
            <dt className="text-sm text-ink-2">Received</dt>
            <dd className="text-xl font-semibold tabular-nums">{money(savings.receivedMinor)}</dd>
          </div>
          <div className="flex flex-col-reverse">
            <dt className="text-sm text-ink-2">Spent</dt>
            <dd className="text-xl font-semibold tabular-nums">{money(savings.sentMinor)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-lg">
          {savings.savedMinor >= 0 ? (
            isCurrent ? (
              <>
                So far this month you kept <b className="font-semibold">{money(savings.savedMinor)}</b>.
              </>
            ) : (
              <>
                You kept <b className="font-semibold">{money(savings.savedMinor)}</b>
                {savings.ratePct !== null && `, ${savings.ratePct}% of what came in`}.
              </>
            )
          ) : (
            <>
              You spent <b className="font-semibold text-critical">{money(-savings.savedMinor)} more</b> than came in
              {isCurrent ? ' so far' : ''}.
            </>
          )}
        </p>
      </Section>
    ) : null

  // What regular payments come to and when they fall due. Only for the current month, since it looks ahead from today.
  const lookNames = (p: UpcomingPayment) => paymentName(p, categoryById.get(p.rule.categoryId)?.name)
  const lateCount = regular?.overdue ?? 0
  const regularSection = isCurrent ? (
    <Section
      id="regular-h"
      title="Regular payments"
      intro={regular ? 'What your set-up payments cost, and what is due next.' : 'Payments that repeat, such as rent, loan EMIs and subscriptions.'}
    >
      {regular && (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]">
            {[
              { label: 'Every month', value: regular.monthlyMinor },
              { label: 'A year', value: regular.yearlyMinor },
              { label: `Still to pay in ${name}`, value: regular.leftThisMonth.outMinor },
              { label: 'Next 30 days', value: regular.next30.outMinor },
            ].map((s) => (
              <div key={s.label} className="flex flex-col-reverse">
                <dt className="text-sm text-ink-2">{s.label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{money(s.value)}</dd>
              </div>
            ))}
          </dl>

          {regular.next && (
            <p className="mt-3 text-lg">
              {`Next: ${lookNames(regular.next)}, ${money(regular.next.amountMinor)} on ${shortDay(regular.next.date, today)}, ${describeWhen(regular.next.daysLeft).toLowerCase()}.`}
            </p>
          )}
          {lateCount > 0 && (
            <p className="mt-2 flex items-start gap-2 font-medium text-critical">
              <span aria-hidden="true" className="mt-0.5 shrink-0">
                <Icon name="warn" size={18} />
              </span>
              {`${lateCount} payment${lateCount === 1 ? ' is' : 's are'} late and ${lateCount === 1 ? 'has' : 'have'} not been added.`}
            </p>
          )}
          {regular.incomeMonthlyMinor > 0 && (
            <p className="mt-2 text-ink-2">
              {`Regular payments take ${Math.round((regular.monthlyMinor / regular.incomeMonthlyMinor) * 100)}% of the ${money(regular.incomeMonthlyMinor)} you expect each month.`}
            </p>
          )}
          {balanceCheck &&
            (shortfallPhrase(balanceCheck, currency, today) ? (
              <p className="mt-2 font-medium text-critical">
                {`Your estimated balance would be ${shortfallPhrase(balanceCheck, currency, today)} over the next 30 days.`}
              </p>
            ) : (
              <p className="mt-2 text-ink-2">
                {`Your estimated balance covers all of it, with about ${money(balanceCheck.endMinor)} left after 30 days.`}
              </p>
            ))}
          {regular.unconverted.length > 0 && (
            <p className="mt-2 text-sm text-ink-2">
              {`Amounts in ${regular.unconverted.join(', ')} have no exchange rate, so they are counted at face value.`}
            </p>
          )}

          {regular.byType.length >= 2 && (
            <>
              <p className="mt-5 font-medium">A month, by kind of payment</p>
              <BarList
                currency={currency}
                rows={regular.byType.map((t) => ({
                  key: t.tag,
                  label: t.label,
                  color: 'var(--accent)',
                  valueMinor: t.monthlyMinor,
                  detail: `${t.count} ${t.count === 1 ? 'payment' : 'payments'}`,
                }))}
              />
            </>
          )}

          <p className="mt-5 font-medium">Due next</p>
          <ul aria-label="Due next" className="mt-1 divide-y divide-line rounded-3xl bg-surface px-4 shadow-[0_0_0_1px_var(--ring)]">
            {regular.upcoming.map((p) => (
              <li key={p.key} className="flex items-center gap-3 py-3">
                <PaymentBadge tag={tagOf(p.rule)} name={lookNames(p)} categoryName={categoryById.get(p.rule.categoryId)?.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{lookNames(p)}</span>
                  <span className="block text-sm text-ink-2">{`${TAG_LABELS[tagOf(p.rule)]}, ${shortDay(p.date, today)}`}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block font-semibold tabular-nums ${p.kind === 'income' ? 'text-good' : ''}`}>{signedAmount(p, currency)}</span>
                  <StatusPill payment={p} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {looksRegular.length > 0 && (
        <>
          <p className="mt-5 font-medium">Looks regular, not set up yet</p>
          <ul className="mt-1 divide-y divide-line rounded-3xl bg-surface px-4 shadow-[0_0_0_1px_var(--ring)]">
            {looksRegular.slice(0, 3).map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{d.merchant}</span>
                  <span className="block text-sm text-ink-2">{`Every month for ${d.count} months, next about ${shortDay(d.nextDue, today)}`}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{money(d.amountMinor)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-ink-2">
            {`If these carry on, that is about ${money(looksRegular.reduce((s, d) => s + d.amountMinor, 0))} more a month. Set them up to see when each falls due.`}
          </p>
        </>
      )}

      {!regular && looksRegular.length === 0 && (
        <div className="mt-3 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]">
          <p>
            Add the payments that repeat, such as rent, loan EMIs, UPI AutoPay and subscriptions, and this shows what they cost a month and what is due
            next.
          </p>
        </div>
      )}

      {onOpenUpcoming && (
        <button
          type="button"
          onClick={onOpenUpcoming}
          className={`mt-4 min-h-12 w-full rounded-full px-5 font-semibold ${regular ? 'bg-surface-2' : 'bg-btn text-btn-ink'}`}
        >
          {regular ? 'See all regular payments' : 'Add regular payments'}
        </button>
      )}
    </Section>
  ) : null

  if (ledger.loading) return <ScreenSkeleton label="Insights" />

  return (
    <div className="pb-8">
      <h1 className="sr-only">Insights</h1>
      <MonthSwitcher month={month} currentMonth={currentMonth} onChange={onMonth} activeMonths={activeMonths} />

      {ledger.missingRates.length > 0 && (
        <div role="note" className="mt-4 flex items-start gap-3 rounded-2xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]">
          <span aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--warn-ui)' }}>
            <Icon name="warn" size={20} />
          </span>
          <div className="min-w-0">
            <p>{`Some ${ledger.missingRates.join(', ')} amounts are counted at face value, so the totals here are off.`}</p>
            <button type="button" onClick={onOpenSettings} className="mt-1 min-h-11 font-medium underline underline-offset-2">
              Set exchange rates
            </button>
          </div>
        </div>
      )}

      {total === 0 ? (
        <>
          {latestMonth === undefined ? (
            <p className="mt-8 text-3xl font-semibold leading-tight tracking-tight">
              Nothing to report for {name} yet.
              <span className="mt-3 block text-lg font-normal tracking-normal text-ink-2">
                Insights appear once you&rsquo;ve logged a few expenses.
              </span>
            </p>
          ) : (
            <div className="mt-8">
              <p className="text-3xl font-semibold leading-tight tracking-tight">{`No expenses logged in ${name}.`}</p>
              <button type="button" onClick={() => onMonth(latestMonth)} className="mt-4 min-h-12 rounded-full bg-btn px-5 font-semibold text-btn-ink">
                {`Go to ${firstWord(latestMonth)}`}
              </button>
            </div>
          )}
          {regularSection}

          {moneyInOut}
        </>
      ) : (
        <>
          {onOpenAi && <AiEntry onOpen={onOpenAi} />}

          <section aria-label="Highlights" className="mt-5">
            <p className="text-[clamp(1.5rem,6.8vw,1.875rem)] font-semibold leading-tight tracking-tight [&_b]:font-extrabold">
              You spent <b>{money(total)}</b>
              {` in ${name}.`}
            </p>
            <p className="mt-2 text-xl">{`${categoryById.get(cats[0].categoryId)?.name ?? 'One category'} was the biggest part, ${Math.round((cats[0].totalMinor / total) * 100)}%.`}</p>
            {pace && <p className="mt-3 text-lg text-ink-2">{pace}</p>}
          </section>

          <section
            aria-labelledby="pace-h"
            className="mt-8 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]"
          >
            <h2 id="pace-h" className="mb-3 text-lg font-semibold">
              Spending pace
            </h2>
            <MonthStrip months={stripMonths} selected={month} currency={currency} onSelect={onMonth} />
            {/* Keyed by the month, so each month's lines are drawn afresh and nothing chosen on one carries to the next. */}
            <PaceChart
              key={month}
              current={cumulative(monthTxs, month, isCurrent ? elapsed : null)}
              previous={hasPrevious ? cumulative(prevTxs, prevKey, null) : []}
              older={olderMonths}
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

          <Section
            id="cats-h"
            title="Where it went"
            intro={`Where your ${name} spending went, biggest first.${onPickCategory ? ' Tap one to see those expenses.' : ''}`}
          >
            <div role="group" aria-label="How to show the categories" className="mt-3 flex gap-1 rounded-full bg-surface-2 p-1">
              {(
                [
                  ['bubbles', 'Bubbles'],
                  ['donut', 'Donut'],
                  ['list', 'List'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={categoryView === id}
                  onClick={() => setCategoryView(id)}
                  className={`min-h-11 flex-1 rounded-full px-3 text-sm font-medium transition-colors motion-reduce:transition-none ${categoryView === id ? 'bg-btn text-btn-ink' : 'text-ink-2'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3">
              {categoryView === 'bubbles' ? (
                <CategoryBubbles totals={cats} categoryById={categoryById} currency={currency} onPick={onPickCategory} />
              ) : categoryView === 'donut' ? (
                <CategoryDonut totals={cats} categoryById={categoryById} currency={currency} onPick={onPickCategory} />
              ) : (
                <CategoryBars totals={cats} categoryById={categoryById} currency={currency} onPick={onPickCategory} />
              )}
            </div>
          </Section>

          {changes.length > 0 && (
            <Section
              id="moved-h"
              title="What changed"
              intro={`Against ${prevName}${cmp.partial ? ', over the same days' : ''}.`}
            >
              <Movers changes={changes} categoryById={categoryById} currency={currency} previousLabel={prevName} />
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

          {regularSection}

          {moneyInOut}

          {merchants.length >= 2 && (
            <Section id="places-h" title="Places you spend most" intro="The shops, apps and people you paid most often.">
              <BarList
                currency={currency}
                rows={merchants.map((m) => ({
                  key: m.name.toLowerCase(),
                  label: m.name,
                  color: 'var(--accent)',
                  valueMinor: m.totalMinor,
                  detail: `${m.count} ${m.count === 1 ? 'time' : 'times'}`,
                }))}
              />
            </Section>
          )}

          {repeats.length > 0 && (
            <Section id="repeats-h" title="Keeps coming back" intro={`What you paid for again and again in ${name}.`}>
              <ul className="mt-3 divide-y divide-line rounded-3xl bg-surface px-4 shadow-[0_0_0_1px_var(--ring)]">
                {repeats.map((r) => (
                  <li key={r.name.toLowerCase()} className="flex items-center gap-3 py-3">
                    <span aria-hidden="true" className="flex h-9 min-w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 px-2 text-sm font-semibold tabular-nums">
                      {`${r.count}×`}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="text-sm text-ink-2">{repeatDetail(r, money)}</p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{money(r.totalMinor)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-ink-2">
                {`Together ${money(repeatTotal)}, ${Math.round((repeatTotal / total) * 100)}% of what you spent in ${name}.`}
              </p>
            </Section>
          )}

          {unusual.length > 0 && (
            <Section id="unusual-h" title="Bigger than usual" intro="Purchases far above what that category normally costs.">
              <ul className="mt-3 divide-y divide-line rounded-3xl bg-surface px-4 shadow-[0_0_0_1px_var(--ring)]">
                {unusual.map((u) => (
                  <li key={u.tx.id} className="flex items-start gap-3 py-3">
                    <span aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--warn-ui)' }}>
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

          {monthTxs.length >= 5 && weekdays[peakDay] > 0 && (
            <Section
              id="days-h"
              title="Busiest days"
              intro={`${weekdayName(peakDay)}s take ${Math.round((weekdays[peakDay] / total) * 100)}% of your spending.`}
            >
              <WeekdayBars totals={weekdays} currency={currency} />
            </Section>
          )}

          {trends.length > 0 && monthsWithData >= 2 && (
            <Section id="trends-h" title="Trends by category" intro="How your biggest categories have moved. Each is measured against its usual month.">
              <div className="mt-3 rounded-3xl bg-surface px-4 shadow-[0_0_0_1px_var(--ring)]">
                <TrendBars trends={trends} categoryById={categoryById} currency={currency} monthName={name} inProgress={isCurrent} />
              </div>
            </Section>
          )}

          {monthsWithData >= 2 && (
            <Section id="year-h" title="The last 12 months" intro="What you spent each month. The latest bar may be a month that is still going.">
              <div className="mt-3 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]">
                <MonthColumns totals={yearTotals} currency={currency} />
              </div>
            </Section>
          )}

          <Section
            id="where-h"
            title="Where you spent"
            intro={spots.length > 0 ? `Where your ${name} spending was recorded. Tap a pin to see what was spent there.` : undefined}
          >
            {spots.length > 0 ? (
              <PlacesMap spots={spots} currency={currency} monthName={name} />
            ) : hasAnyPlace ? (
              <p className="mt-3 text-ink-2">{`No places were recorded in ${name}.`}</p>
            ) : (
              <div className="mt-3 rounded-3xl bg-surface p-4 shadow-[0_0_0_1px_var(--ring)]">
                <p>
                  See where you spend. Turn on &ldquo;Save where I add transactions&rdquo; in Settings, and each new transaction adds a spot to a map
                  here.
                </p>
                <button type="button" onClick={onOpenSettings} className="mt-3 min-h-11 rounded-full bg-surface-2 px-4 font-medium">
                  Open settings
                </button>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
})
