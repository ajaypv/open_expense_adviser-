import { useMemo, type CSSProperties } from 'react'
import type { useLedger } from '../data/useLedger'
import { formatMoney, parseLocalDate } from '../db/money'
import { buildAiSummary, ordinalSuffix, type AiSummary } from '../insights/ai'
import { Dialog } from './Dialog'
import { Icon, type IconName } from './Icon'
import { CountUp, MonthBars, Reveal, TrajectoryChart } from './AiCharts'

type Ledger = ReturnType<typeof useLedger>

interface Props {
  open: boolean
  onClose: () => void
  ledger: Ledger
  /** The month to read: the one Home or Insights is showing. */
  month: string
  today: Date
}

const card = 'rounded-2xl bg-surface-2/60 p-4'
const heading = 'text-base font-semibold tracking-tight'
let dayName: Intl.DateTimeFormat | undefined
let shortDate: Intl.DateTimeFormat | undefined
const dayLabel = (date: string) => (dayName ??= new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })).format(parseLocalDate(date))
const dateOf = (date: string) => (shortDate ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(parseLocalDate(date))
const ord = (n: number) => `${n}${ordinalSuffix(n)}`

const VERDICT_STYLE = {
  good: { icon: 'check' as IconName, color: 'var(--good-text)' },
  watch: { icon: 'warn' as IconName, color: 'var(--warn-ui)' },
  bad: { icon: 'warn' as IconName, color: 'var(--critical-text)' },
  quiet: { icon: null, color: 'var(--ink-2)' },
}

const tipIcon = (key: string): IconName =>
  key === 'over' || key === 'pace' || key === 'shortfall' ? 'warn' : key.startsWith('usual') ? 'arrowUp' : key.startsWith('repeat') || key === 'emi' || key === 'regular' ? 'repeat' : key === 'subscriptions' ? 'bell' : 'flag'

type Fmt = (m: number) => string

/**
 * The month in a few small parts, read out in plain words and drawn to be watched: how it is going, where it is heading,
 * what is already committed to regular payments and EMIs, where the money goes, what could be saved, and how the months
 * have moved. It is worked out here from your own entries and the payments you have set up, and sent nowhere. Each part
 * rises into view as you scroll to it, and the lines, bars and numbers inside it play then, not before.
 */
export function AiSheet({ open, onClose, ledger, month, today }: Props) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="ai-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="ai-title" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
              <Icon name="spark" size={20} />
            </span>
            AI insights
          </h2>
          <p className="text-xs text-ink-2">Worked out on this phone from your own entries. Nothing is sent anywhere.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-2">
          <Icon name="close" />
        </button>
      </div>
      {/* Read and drawn only while open, so it costs nothing the rest of the time and plays afresh each time it is opened. */}
      {open && <AiBody ledger={ledger} month={month} today={today} />}
    </Dialog>
  )
}

function AiBody({ ledger, month, today }: { ledger: Ledger; month: string; today: Date }) {
  const { currency, categoryById } = ledger
  const money: Fmt = (m) => formatMoney(m, currency)
  const summary = useMemo(
    () =>
      buildAiSummary({
        expenses: ledger.expenses, income: ledger.income, categoryById, month, today, budgetMinor: ledger.budgetMinor,
        recurring: ledger.recurring, currency, rates: ledger.rates, balance: { set: ledger.balanceSet, minor: ledger.estimatedBalanceMinor },
        money: (m) => formatMoney(m, currency), dayLabel,
      }),
    [ledger.expenses, ledger.income, categoryById, month, today, ledger.budgetMinor, ledger.recurring, currency, ledger.rates, ledger.balanceSet, ledger.estimatedBalanceMinor],
  )
  const nameOf = (id: number) => categoryById.get(id)?.name ?? 'No category'
  const colorOf = (id: number) => categoryById.get(id)?.color ?? 'var(--other)'
  const s = summary

  if (!s.hasData) {
    return (
      <div className={`${card} mt-4`}>
        <p className="font-semibold">{s.headline[0]}</p>
        <p className="mt-1 text-sm text-ink-2">Add a few expenses and come back: there is nothing to read yet.</p>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      <Summary s={s} money={money} currency={currency} nameOf={nameOf} />
      <Trajectory s={s} money={money} currency={currency} />
      {s.commitments && <Commitments s={s} money={money} />}
      <Categories s={s} money={money} nameOf={nameOf} colorOf={colorOf} />
      <Tips s={s} currency={currency} />
      <Months s={s} money={money} currency={currency} />
      {s.habits.length > 0 && (
        <Reveal>
          <section aria-labelledby="ai-habits">
            <h3 id="ai-habits" className={heading}>
              Your habits
            </h3>
            <ul className="mt-1.5 space-y-1">
              {s.habits.slice(0, 2).map((h, i) => (
                <li key={h} className="row-in flex items-start gap-2 text-sm" style={{ '--d': `${250 + i * 120}ms` } as CSSProperties}>
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-2" />
                  {h}
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      )}
      <p className="text-xs text-ink-2">Estimates from what you have logged and set up, worked out by simple sums. A guide, not financial advice.</p>
    </div>
  )
}

function Summary({ s, money, currency, nameOf }: { s: AiSummary; money: Fmt; currency: string; nameOf: (id: number) => string }) {
  const v = VERDICT_STYLE[s.verdict.tone]
  const third = s.receivedMinor > 0 ? { label: s.savedMinor >= 0 ? 'Kept' : 'Overspent', value: money(Math.abs(s.savedMinor)) } : { label: 'Top category', value: nameOf(s.topCategories[0].categoryId) }
  const vs = s.previous.deltaPct
  const stats = [
    { label: 'A day', value: money(s.dailyAverageMinor), tone: '' },
    { label: `Against ${s.prevName}`, value: vs === null ? 'No data' : vs === 0 ? 'Same' : `${vs > 0 ? '▲' : '▼'} ${Math.abs(vs)}%`, tone: vs === null || vs === 0 ? '' : vs > 0 ? 'text-critical' : 'text-good' },
    { ...third, tone: '' },
  ]
  return (
    <Reveal>
      <section aria-labelledby="ai-summary">
        <h3 id="ai-summary" className="sr-only">
          {s.isCurrent ? `Your ${s.monthName} so far` : `Your ${s.monthName}`}
        </h3>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-2">{s.isCurrent ? `Spent so far in ${s.monthName}` : `Spent in ${s.monthName}`}</p>
            <p className="text-3xl font-extrabold leading-tight tracking-tight tabular-nums">
              <CountUp minor={s.spentMinor} currency={currency} />
            </p>
          </div>
          <p data-tone={s.verdict.tone} className="mb-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 py-1 pl-2 pr-2.5 text-xs font-semibold" style={{ color: v.color }}>
            {v.icon && <Icon name={v.icon} size={14} />}
            {s.verdict.label}
          </p>
        </div>
        <ul className="mt-2 space-y-1">
          {s.headline.slice(0, 2).map((line, i) => (
            <li key={line} className="row-in flex items-start gap-2 text-sm" style={{ '--d': `${200 + i * 140}ms` } as CSSProperties}>
              <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: 'var(--accent)' }} />
              {line}
            </li>
          ))}
        </ul>
        <dl className="mt-3 grid grid-cols-3 divide-x divide-line rounded-xl bg-surface-2/60 py-2">
          {stats.map((x) => (
            <div key={x.label} className="flex min-w-0 flex-col-reverse px-3">
              <dt className="truncate text-xs text-ink-2">{x.label}</dt>
              <dd className={`truncate text-base font-bold tabular-nums ${x.tone}`}>{x.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Reveal>
  )
}

function Trajectory({ s, money, currency }: { s: AiSummary; money: Fmt; currency: string }) {
  const t = s.trajectory
  const budgetLine = (() => {
    if (t.budgetMinor === null) return null
    if (t.overBudget?.already) return `You are ${money(t.overBudget.byMinor)} over your ${money(t.budgetMinor)} budget${t.overBudget.onDay ? `, passed on the ${ord(t.overBudget.onDay)}` : ''}.`
    if (t.overBudget) return `You would pass your ${money(t.budgetMinor)} budget${t.overBudget.onDay ? ` around the ${ord(t.overBudget.onDay)}` : ''}, ending ${money(t.overBudget.byMinor)} over.`
    const left = t.projectedMinor === null ? t.budgetMinor - s.spentMinor : t.budgetMinor - t.projectedMinor
    return `${t.projectedMinor === null ? 'Inside' : 'On course to stay inside'} your ${money(t.budgetMinor)} budget, ${money(Math.max(left, 0))} to spare.`
  })()
  const lastMonth = t.previous.at(-1)

  return (
    <Reveal>
      <section aria-labelledby="ai-heading" className={card}>
        <h3 id="ai-heading" className={heading}>
          {s.isCurrent ? 'Where it is heading' : 'How it ended'}
        </h3>
        {t.projectedMinor !== null ? (
          <p data-projection className="mt-0.5 text-sm">
            At this pace {s.monthName} ends near{' '}
            <b className="font-bold tabular-nums">
              <CountUp minor={t.projectedMinor} currency={currency} delay={300} />
            </b>
            {lastMonth !== undefined && <span className="text-ink-2">{`, against ${money(lastMonth)} in ${s.prevName}`}</span>}.
          </p>
        ) : (
          lastMonth !== undefined && <p className="mt-0.5 text-sm text-ink-2">{`${s.prevName} ended at ${money(lastMonth)}.`}</p>
        )}
        {t.committedLeftMinor > 0 && (
          <p data-committed className="text-xs text-ink-2">{`Includes ${money(t.committedLeftMinor)} of regular payments still to leave, on their due days.`}</p>
        )}
        <TrajectoryChart summary={s} currency={currency} />
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-3 rounded" style={{ background: 'var(--accent)' }} />
            {s.monthName}
          </li>
          {t.projectedMinor !== null && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="w-3 border-t-2 border-dotted" style={{ borderColor: 'var(--accent)' }} />
              Heading
            </li>
          )}
          {t.previous.length > 0 && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-0.5 w-3 rounded opacity-60" style={{ background: 'var(--other)' }} />
              {s.prevName}
            </li>
          )}
        </ul>
        {budgetLine && (
          <p data-budget={t.overBudget ? 'over' : 'inside'} className={`mt-2 text-sm ${t.overBudget ? 'font-semibold text-critical' : ''}`}>
            {budgetLine}
          </p>
        )}
        {t.perDayAllowedMinor !== null && <p className="text-sm text-ink-2">{`About ${money(t.perDayAllowedMinor)} a day for the rest of ${s.monthName} keeps you inside it.`}</p>}
      </section>
    </Reveal>
  )
}

/** What is already spoken for: regular payments and EMIs, against what comes in. */
function Commitments({ s, money }: { s: AiSummary; money: Fmt }) {
  const c = s.commitments!
  const stats = [
    { label: 'Regular a month', value: money(c.monthlyMinor) },
    ...(c.emiMonthlyMinor > 0 ? [{ label: 'EMIs a month', value: money(c.emiMonthlyMinor) }] : []),
    ...(s.isCurrent ? [{ label: 'Still due', value: money(c.leftThisMonthMinor) }] : []),
  ]
  return (
    <Reveal>
      <section aria-labelledby="ai-commit" className={card}>
        <h3 id="ai-commit" className={heading}>
          Regular payments and EMIs
        </h3>
        <dl className="mt-2 grid divide-x divide-line rounded-xl bg-surface py-2 shadow-[0_0_0_1px_var(--ring)]" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
          {stats.map((x) => (
            <div key={x.label} className="flex min-w-0 flex-col-reverse px-3">
              <dt className="truncate text-xs text-ink-2">{x.label}</dt>
              <dd className="truncate text-base font-bold tabular-nums">{x.value}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-2 space-y-1 text-sm">
          {c.nextEmi && (
            <li data-line="next-emi">{`Next EMI: ${c.nextEmi.name}, ${money(c.nextEmi.amountMinor)} on ${dateOf(c.nextEmi.date)}${c.nextEmi.daysLeft >= 0 ? `, in ${c.nextEmi.daysLeft} ${c.nextEmi.daysLeft === 1 ? 'day' : 'days'}` : `, ${-c.nextEmi.daysLeft} ${c.nextEmi.daysLeft === -1 ? 'day' : 'days'} late`}.`}</li>
          )}
          {c.sharePct !== null && c.keepsMinor !== null && (
            <li data-line="share" className={c.sharePct >= 60 ? 'font-semibold text-critical' : ''}>
              {`${c.sharePct}% of your income goes on regular payments${c.emiSharePct !== null ? `, ${c.emiSharePct}% of it on EMIs` : ''}, leaving ${money(Math.max(c.keepsMinor, 0))} for everything else.`}
            </li>
          )}
          {s.isCurrent && c.leftCount > 0 && <li data-line="left">{`${c.leftCount} ${c.leftCount === 1 ? 'payment' : 'payments'} still to leave this month, counted in where it is heading.`}</li>}
        </ul>
      </section>
    </Reveal>
  )
}

function Categories({ s, money, nameOf, colorOf }: { s: AiSummary; money: Fmt; nameOf: (id: number) => string; colorOf: (id: number) => string }) {
  const shown = s.topCategories.slice(0, 3)
  const top = Math.max(...shown.map((c) => c.minor), 1)
  return (
    <Reveal>
      <section aria-labelledby="ai-where">
        <h3 id="ai-where" className={heading}>
          Where the money went
        </h3>
        <ul className="mt-1.5 space-y-2.5">
          {shown.map((c, i) => {
            const chip = c.deltaPct === null ? 'New' : c.deltaPct === 0 ? 'Same' : `${c.deltaPct > 0 ? '▲' : '▼'} ${Math.abs(c.deltaPct)}%`
            return (
              <li key={c.categoryId} data-category={c.categoryId}>
                <p className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: colorOf(c.categoryId) }} />
                    <span className="truncate font-medium">{nameOf(c.categoryId)}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">{money(c.minor)}</span>
                    <span className="ml-1.5 text-ink-2">{`${c.sharePct}%`}</span>
                    <span className={`ml-1.5 text-xs ${c.deltaPct !== null && c.deltaPct > 0 ? 'text-critical' : c.deltaPct !== null && c.deltaPct < 0 ? 'text-good' : 'text-ink-2'}`}>
                      {chip}
                      <span className="sr-only">{` on ${s.prevName}`}</span>
                    </span>
                  </span>
                </p>
                <span aria-hidden="true" className="mt-1 block h-1.5 rounded-r-[3px] bg-surface-2">
                  <span className="ai-bar-right block h-full rounded-r-[3px]" style={{ width: `${Math.max((c.minor / top) * 100, 3)}%`, background: colorOf(c.categoryId), '--d': `${i * 110}ms` } as CSSProperties} />
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </Reveal>
  )
}

function Tips({ s, currency }: { s: AiSummary; currency: string }) {
  return (
    <section aria-labelledby="ai-save">
      <Reveal>
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="ai-save" className={heading}>
            How you could save
          </h3>
          {s.potentialSavingMinor > 0 && (
            <p className="text-sm font-semibold text-good tabular-nums">
              {'up to '}
              <CountUp minor={s.potentialSavingMinor} currency={currency} delay={200} />
              {' a month'}
            </p>
          )}
        </div>
      </Reveal>
      {s.tips.length === 0 ? (
        <Reveal delay={100}>
          <p className="mt-1.5 rounded-xl bg-surface-2/60 p-3 text-sm">Nothing stands out. Your spending looks steady, so there is no one thing to cut.</p>
        </Reveal>
      ) : (
        <ul className="mt-1.5 space-y-2">
          {s.tips.map((tip, i) => (
            <li key={tip.key} data-tip={tip.key}>
              <Reveal delay={i * 70}>
                <div className="flex items-start gap-2.5 rounded-xl bg-surface p-3 shadow-[0_0_0_1px_var(--ring)]">
                  <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2" style={tip.urgent ? { color: 'var(--critical-text)' } : undefined}>
                    <Icon name={tipIcon(tip.key)} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.9375rem] font-semibold leading-snug">{tip.title}</p>
                    <p className="text-sm leading-snug text-ink-2">{tip.detail}</p>
                    {tip.savingMinor !== null && (
                      <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2 pr-2.5 text-xs font-semibold text-good">
                        <Icon name="check" size={12} />
                        Keep about <CountUp minor={tip.savingMinor} currency={currency} delay={300} /> a month
                      </p>
                    )}
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Months({ s, money, currency }: { s: AiSummary; money: Fmt; currency: string }) {
  const { trend } = s
  const sentences = [
    trend.direction === 'up' ? `Spending has been rising by about ${trend.monthlyChangePct}% a month.` : trend.direction === 'down' ? `Spending has been falling by about ${Math.abs(trend.monthlyChangePct ?? 0)}% a month.` : trend.direction === 'flat' ? 'Spending has been steady from month to month.' : null,
    trend.nextMonthMinor !== null ? `If that carries on, next month could come to about ${money(trend.nextMonthMinor)}.` : null,
  ].filter((x): x is string => x !== null)
  return (
    <Reveal>
      <section aria-labelledby="ai-months">
        <h3 id="ai-months" className={heading}>
          Month by month
        </h3>
        <MonthBars months={s.months} currency={currency} />
        {sentences.length > 0 && (
          <ul className="mt-2 space-y-1">
            {sentences.map((line, i) => (
              <li key={line} data-trend={i === 0 ? trend.direction : 'next'} className="row-in text-sm" style={{ '--d': `${900 + i * 140}ms` } as CSSProperties}>
                {line}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Reveal>
  )
}
