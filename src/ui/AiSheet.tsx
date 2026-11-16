import { useMemo, useState, type CSSProperties } from 'react'
import type { useLedger } from '../data/useLedger'
import { formatMoney, localDateString, parseLocalDate } from '../db/money'
import { buildAiSummary, type AiDeduction, type AiSummary } from '../insights/ai'
import { monthLabel } from '../insights/aggregates'
import { TAG_LABELS } from '../insights/upcoming'
import { CountUp, DeductionTimeline, MonthBar, MonthBars, Scene, ShareBar, TrajectoryChart, whole } from './AiCharts'
import { categoryIcon } from './categoryIcon'
import { Dialog } from './Dialog'
import { Figures } from './Figures'
import { Icon, type IconName } from './Icon'
import { PaymentBadge } from './PaymentBadge'

type Ledger = ReturnType<typeof useLedger>
type Fmt = (m: number) => string

interface Props {
  open: boolean
  onClose: () => void
  ledger: Ledger
  /** The month to read: the one Home or Insights is showing. */
  month: string
  today: Date
}

let dayName: Intl.DateTimeFormat | undefined
let shortDate: Intl.DateTimeFormat | undefined
const dayLabel = (date: string) => (dayName ??= new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })).format(parseLocalDate(date))
const dateOf = (date: string) => (shortDate ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(parseLocalDate(date))
const DAY_MS = 86_400_000
const delay = (ms: number): CSSProperties => ({ '--d': `${ms}ms` }) as CSSProperties

/** A round icon, as on the other pages: soft grey, washed with a colour of its own, or amber for a warning. */
function Round({ icon, size = 36, color, warn, onTile }: { icon: IconName; size?: number; color?: string; warn?: boolean; /** On a soft tile the circle is the lighter surface, so it still shows. */ onTile?: boolean }) {
  const style: CSSProperties = warn
    ? { color: 'var(--warn-ui)', background: 'color-mix(in oklab, var(--warn-ui) 16%, var(--surface))' }
    : color
      ? { background: `color-mix(in oklab, ${color} 20%, var(--surface))` }
      : {}
  return (
    <span aria-hidden="true" data-icon={icon} className={`flex shrink-0 items-center justify-center rounded-full ${warn || color ? '' : onTile ? 'bg-surface' : 'bg-surface-2'} ${warn ? '' : 'text-ink'}`} style={{ width: size, height: size, ...style }}>
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </span>
  )
}

/** The icon for each kind of leak: the category's own where it is about one, otherwise what the leak is. */
function leakIcon(key: string, nameOf: (id: number) => string): IconName {
  if (key.startsWith('usual-')) return categoryIcon(nameOf(Number(key.slice(6))))
  if (key.startsWith('repeat-') || key === 'subscriptions') return 'repeat'
  if (key === 'rate') return 'swap'
  if (key === 'weekend') return 'sun'
  return 'tag'
}

/** The question a section answers, as its heading, and a line to say what it will show. */
function Heading({ id, children, lead }: { id: string; children: string; lead?: string }) {
  return (
    <>
      <h3 id={id} className="font-ai-display text-balance text-[1.75rem] font-semibold leading-[1.1] tracking-tight">
        {children}
      </h3>
      {lead && <p className="mt-1 text-[1.0625rem] leading-[1.6] text-ink-2">{lead}</p>}
    </>
  )
}

/**
 * Everything the app can tell you about a month, as one page to read from the top: the sentence that matters, the month as a
 * single bar (what you have spent, what leaves on its own, what is still to come), what leaves on its own and when, where
 * money is leaking and what you would keep by stopping it, where the rest went, and what next month is likely to cost. It
 * is worked out here from your own entries and the payments you have set up, and sent nowhere. The page holds still as you
 * scroll; the lines, bars, dots and numbers draw when you reach them.
 */
export function AiSheet({ open, onClose, ledger, month, today }: Props) {
  const isCurrent = month === localDateString(today).slice(0, 7)
  return (
    <Dialog open={open} onClose={onClose} labelledBy="ai-title" variant="page">
      <div className="mx-auto w-full max-w-xl px-5 pb-[max(3rem,env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-10 -mx-5 flex items-center justify-between gap-3 bg-bg/80 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="min-w-0">
            <h2 id="ai-title" className="font-ai-display flex items-center gap-2.5 text-xl font-semibold tracking-tight">
              <Round icon="spark" size={32} color="var(--accent)" />
              AI insights
            </h2>
            <p className="truncate pl-[2.625rem] text-sm text-ink-2">{`${monthLabel(month)}${isCurrent ? ', so far' : ''}`}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 active:opacity-70">
            <Icon name="close" />
          </button>
        </header>
        {/* Read and drawn only while open, so it costs nothing the rest of the time and plays afresh each time it is opened. */}
        {open && <AiBody ledger={ledger} month={month} today={today} />}
      </div>
    </Dialog>
  )
}

function AiBody({ ledger, month, today }: { ledger: Ledger; month: string; today: Date }) {
  const { currency, categoryById } = ledger
  const money: Fmt = (m) => formatMoney(whole(m), currency)
  const s = useMemo(
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

  const disclosure = <p className="text-sm text-ink-2">Worked out on this phone from your own entries. Nothing is sent anywhere.</p>

  if (!s.hasData) {
    return (
      <div className="mt-2 space-y-3">
        {disclosure}
        <h3 className="text-2xl font-semibold leading-tight tracking-tight">{s.headline[0]}</h3>
        <p className="text-ink-2">Add a few expenses and come back: there is nothing to read yet.</p>
      </div>
    )
  }

  return (
    <div className="mt-1 space-y-12">
      <div className="space-y-6">
        {disclosure}
        <Briefing s={s} money={money} currency={currency} />
      </div>
      {s.deductions || s.isCurrent ? <Deductions s={s} money={money} today={today} /> : null}
      <Leaking s={s} money={money} currency={currency} nameOf={nameOf} />
      <Pace s={s} money={money} currency={currency} />
      <Rest s={s} money={money} nameOf={nameOf} colorOf={colorOf} />
      <Ahead s={s} money={money} currency={currency} />
      {s.habits.length > 0 && (
        <Scene>
          <section aria-labelledby="ai-habits">
            <Heading id="ai-habits">What your days look like</Heading>
            <ul className="mt-2 space-y-1.5">
              {s.habits.slice(0, 3).map((h) => (
                <li key={h} className="text-[1.0625rem] leading-[1.6]">
                  {h}
                </li>
              ))}
            </ul>
          </section>
        </Scene>
      )}
      <p className="text-sm leading-snug text-ink-2">These are estimates from what you have logged and set up, worked out by simple sums. They are a guide, not financial advice.</p>
    </div>
  )
}

/** The sentence to open on, and what stands behind it. */
function briefing(s: AiSummary, money: Fmt): { lead: string; sub: { text: string; figures: string[] }[] } {
  const t = s.trajectory
  const sub: { text: string; figures: string[] }[] = []
  let lead: string
  if (t.projectedMinor !== null) {
    if (t.overBudget?.already) lead = `You have already passed your ${money(t.budgetMinor!)} budget, by ${money(t.overBudget.byMinor)}.`
    else if (t.overBudget) lead = `${s.monthName} will probably end near ${money(t.projectedMinor)}, ${money(t.overBudget.byMinor)} over your budget.`
    else if (t.budgetMinor !== null) lead = `${s.monthName} will probably end near ${money(t.projectedMinor)}, ${money(t.budgetMinor - t.projectedMinor)} inside your budget.`
    else lead = `${s.monthName} is heading for about ${money(t.projectedMinor)}.`
    const last = t.previous.at(-1)
    if (last) {
      const pct = Math.round(((t.projectedMinor - last) / last) * 100)
      sub.push({ text: pct === 0 ? `About the same as ${s.prevName}, which ended at ${money(last)}.` : `${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} than ${s.prevName}, which ended at ${money(last)}.`, figures: [`${Math.abs(pct)}%`, money(last)] })
    }
  } else if (s.isCurrent) {
    lead = t.overBudget?.already ? `You have already passed your ${money(t.budgetMinor!)} budget, by ${money(t.overBudget.byMinor)}.` : `You have spent ${money(s.spentMinor)} in ${s.monthName} so far.`
    sub.push({ text: 'Give it a few more days and this page will say where the month is heading.', figures: [] })
  } else {
    lead = `You spent ${money(s.spentMinor)} in ${s.monthName}.`
    const pct = s.previous.deltaPct
    if (pct !== null) sub.push({ text: pct === 0 ? `The same as ${s.prevName}.` : `${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} than ${s.prevName}.`, figures: [`${Math.abs(pct)}%`] })
  }
  const d = s.deductions
  if (d && d.totalMinor > 0) {
    const split = d.doneMinor > 0 && d.dueMinor > 0 ? `: ${money(d.doneMinor)} already, ${money(d.dueMinor)} still to come` : d.dueMinor > 0 ? ', all of it still to come' : ' and already has'
    sub.push({ text: `${money(d.totalMinor)} of that leaves on its own${split}.`, figures: [money(d.totalMinor), money(d.doneMinor), money(d.dueMinor)] })
  }
  return { lead, sub }
}

function Briefing({ s, money, currency }: { s: AiSummary; money: Fmt; currency: string }) {
  const { lead, sub } = briefing(s, money)
  return (
    <Scene>
      <section aria-labelledby="ai-lead" data-tone={s.verdict.tone}>
        <h3 id="ai-lead" className="font-ai-display text-balance text-[clamp(2.125rem,9vw,2.875rem)] font-medium leading-[1.05] tracking-[-0.02em]">
          {lead}
        </h3>
        {sub.length > 0 && (
          <ul className="mt-3 space-y-1">
            {sub.map((line) => (
              <li key={line.text} className="text-pretty text-[1.0625rem] leading-[1.6] text-ink-2">
                <Figures text={line.text} figures={line.figures} />
              </li>
            ))}
          </ul>
        )}
        {s.monthBar && (
          <div className="mt-6">
            <MonthBar bar={s.monthBar} currency={currency} />
          </div>
        )}
        {s.alerts.length > 0 && (
          <ul aria-label="Needs attention" className="mt-6 space-y-2">
            {s.alerts.slice(0, 3).map((a) => (
              <li key={a.key} data-alert={a.key} className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3">
                <Round icon="warn" warn />
                <div className="min-w-0">
                  <p className="font-semibold leading-snug">{a.title}</p>
                  <p className="text-sm leading-snug text-ink-2">{a.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Scene>
  )
}

const statusOf = (d: AiDeduction, today: Date): string => {
  if (d.state === 'done') return `Left on ${dateOf(d.date)}`
  if (d.state === 'late') return `Late, was due ${dateOf(d.date)}`
  const left = Math.round((parseLocalDate(d.date).getTime() - parseLocalDate(localDateString(today)).getTime()) / DAY_MS)
  return `Due ${dateOf(d.date)}, ${left <= 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`}`
}

/** What leaves your account without you doing anything: set where it falls in the month, and said in words. */
function Deductions({ s, money, today }: { s: AiSummary; money: Fmt; today: Date }) {
  const d = s.deductions
  const c = s.commitments
  return (
    <Scene>
      <section aria-labelledby="ai-auto">
        <Heading id="ai-auto">What leaves on its own</Heading>
        {!d ? (
          <p className="mt-2 text-[1.0625rem] leading-[1.6] text-ink-2">
            Nothing is set up to repeat yet. Add your EMIs, subscriptions and autopays under Upcoming payments, and the month’s end here will count them on the day each one leaves.
          </p>
        ) : (
          <>
            <p className="mt-1 text-[1.0625rem] leading-[1.6] text-ink-2">
              <Figures
                every
                figures={[money(d.totalMinor), money(d.doneMinor), money(d.dueMinor)]}
                text={
                  d.items.length === 0
                    ? 'Nothing has left on its own this month.'
                    : s.isCurrent
                      ? `${money(d.totalMinor)} in ${s.monthName}: ${money(d.doneMinor)} has left, ${money(d.dueMinor)} is still to come.`
                      : `${money(d.doneMinor)} left on its own in ${s.monthName}.`
                }
              />
            </p>
            {d.items.length > 0 && <DeductionTimeline deductions={d} days={s.days} elapsed={s.elapsed} isCurrent={s.isCurrent} />}
            {d.items.length > 0 && (
              <ul aria-label="Payments that leave on their own" className="mt-3 divide-y divide-line">
                {d.items.map((i) => (
                  <li key={i.key} data-deduction={i.state} className="flex items-center gap-3 py-2.5">
                    <PaymentBadge tag={i.tag} name={i.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.name}</p>
                      <p className={`text-sm ${i.state === 'late' ? 'font-medium text-critical' : 'text-ink-2'}`}>{`${TAG_LABELS[i.tag]}. ${statusOf(i, today)}`}</p>
                    </div>
                    <p className={`num shrink-0 ${i.state === 'done' ? 'text-ink-2' : ''}`}>{money(i.amountMinor)}</p>
                  </li>
                ))}
              </ul>
            )}
            {d.monthlyMinor > 0 && (
              <p data-line="monthly" className="mt-3 text-[1.0625rem] leading-[1.6]">
                <Figures
                  every
                  figures={[money(d.monthlyMinor), `${c?.sharePct}%`, `${c?.emiSharePct}%`, money(Math.max(c?.keepsMinor ?? 0, 0))]}
                  text={`In an average month these come to ${money(d.monthlyMinor)}${c?.sharePct != null ? `, ${c.sharePct}% of your income${c.emiSharePct != null ? ` (EMIs alone ${c.emiSharePct}%)` : ''}` : ''}${c?.keepsMinor != null ? `, which leaves ${money(Math.max(c.keepsMinor, 0))} for everything else` : ''}.`}
                />
              </p>
            )}
            {c?.nextEmi && (
              <p data-line="next-emi" className="mt-1 text-[1.0625rem] leading-[1.6] text-ink-2">
                <Figures
                  figures={[money(c.nextEmi.amountMinor), dateOf(c.nextEmi.date)]}
                  text={`Next EMI: ${c.nextEmi.name}, ${money(c.nextEmi.amountMinor)} on ${dateOf(c.nextEmi.date)}${c.nextEmi.daysLeft >= 0 ? `, in ${c.nextEmi.daysLeft} ${c.nextEmi.daysLeft === 1 ? 'day' : 'days'}` : `, ${-c.nextEmi.daysLeft} ${c.nextEmi.daysLeft === -1 ? 'day' : 'days'} late`}.`}
                />
              </p>
            )}
          </>
        )}
      </section>
    </Scene>
  )
}

/** A switch that is a real checkbox underneath, so it can be reached and changed with the keyboard. */
function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <label className="mt-0.5 flex shrink-0 cursor-pointer">
      <input type="checkbox" role="switch" aria-label={label} checked={on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-6 w-10 rounded-full bg-surface-2 shadow-[inset_0_0_0_1px_var(--edge)] transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-ink-2 after:transition-transform peer-checked:bg-btn peer-checked:after:translate-x-4 peer-checked:after:bg-btn-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink motion-reduce:transition-none motion-reduce:after:transition-none"
      />
    </label>
  )
}

/** Where money is going that could stay, biggest first. Each can be switched off, and the total says what is left. */
function Leaking({ s, money, currency, nameOf }: { s: AiSummary; money: Fmt; currency: string; nameOf: (id: number) => string }) {
  const [off, setOff] = useState<ReadonlySet<string>>(new Set())
  const chosen = s.leaks.filter((l) => !off.has(l.key))
  const monthly = whole(chosen.reduce((a, l) => a + l.monthlyMinor, 0))
  const top = Math.max(...s.leaks.map((l) => l.monthlyMinor), 1)
  const projected = s.trajectory.projectedMinor
  const toggle = (key: string, on: boolean) =>
    setOff((prev) => {
      const next = new Set(prev)
      if (on) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <Scene>
      <section aria-labelledby="ai-leaks">
        <Heading id="ai-leaks" lead={s.leaks.length > 0 ? 'The biggest first. Switch off the ones you would not change, and the total follows.' : undefined}>
          Where it is leaking
        </Heading>
        {s.leaks.length === 0 ? (
          <p className="mt-2 text-[1.0625rem] leading-[1.6]">Nothing stands out. Your spending looks steady, so there is no one thing to cut.</p>
        ) : (
          <>
            <div data-testid="leak-total" className="mt-4 rounded-2xl bg-surface-2 p-4">
              <p className="text-sm text-ink-2">{chosen.length === 0 ? 'Nothing switched on' : chosen.length === s.leaks.length ? 'Stopping all of these keeps you' : `Stopping these ${chosen.length} keeps you`}</p>
              <p className="font-ai-display text-5xl font-medium leading-none tracking-tight">
                <CountUp minor={monthly} currency={currency} delay={150} />
                <span className="font-theme ml-2 text-base font-medium text-ink-2">a month</span>
              </p>
              <p className="mt-1 text-[1.0625rem] leading-[1.6] text-ink-2">
                {'That is '}
                <span className="num text-ink">
                  <CountUp minor={whole(monthly * 12)} currency={currency} delay={300} />
                </span>
                {' a year'}
                {projected !== null && monthly > 0 ? (
                  <>
                    {`, and ${s.monthName} would end near `}
                    <span className="num text-ink">
                      <CountUp minor={whole(Math.max(projected - monthly, 0))} currency={currency} delay={450} />
                    </span>
                  </>
                ) : null}
                {'.'}
              </p>
            </div>
            <ul aria-label="Where money is leaking" className="mt-3 space-y-2">
              {s.leaks.map((l, i) => {
                const on = !off.has(l.key)
                return (
                  <li key={l.key} data-leak={l.key} data-on={on ? 'true' : 'false'} className="rounded-2xl bg-surface-2 p-3">
                    <div className="flex items-start gap-3">
                      <Round icon={leakIcon(l.key, nameOf)} onTile />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-snug">{l.title}</p>
                        <p className="mt-0.5 text-sm leading-snug text-ink-2">{l.evidence}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end text-right">
                        <Toggle on={on} onChange={(v) => toggle(l.key, v)} label={`Count ${l.title}`} />
                        <p className="num mt-1.5">{money(l.monthlyMinor)}</p>
                        <p className="text-xs text-ink-2">a month</p>
                        <p className="num text-xs font-medium text-ink-2">{`${money(l.yearlyMinor)} a year`}</p>
                      </div>
                    </div>
                    <span aria-hidden="true" className="mt-2.5 block h-1.5 rounded-full bg-surface">
                      <span
                        className="ai-bar-right block h-full rounded-full transition-opacity duration-300 motion-reduce:transition-none"
                        style={{ width: `${Math.max((l.monthlyMinor / top) * 100, 4)}%`, background: 'var(--accent)', opacity: on ? 1 : 0.2, ...delay(i * 110) }}
                      />
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        )}
        {s.goal && (
          <p data-line="goal" className="mt-4 text-[1.0625rem] leading-[1.6]">
            <span className="font-semibold">{s.goal.title}. </span>
            {s.goal.detail}
          </p>
        )}
      </section>
    </Scene>
  )
}

/** How fast the month has gone, as a line, with what it means for the budget in words. */
function Pace({ s, money, currency }: { s: AiSummary; money: Fmt; currency: string }) {
  const t = s.trajectory
  const lines: string[] = []
  if (t.perDayAllowedMinor !== null) lines.push(`About ${money(t.perDayAllowedMinor)} a day for the rest of ${s.monthName} keeps you inside your budget${t.committedLeftMinor > 0 ? `, after the ${money(t.committedLeftMinor)} still to leave on its own` : ''}.`)
  else if (t.budgetMinor !== null && t.overBudget?.already) lines.push(`Your ${money(t.budgetMinor)} budget was passed${t.overBudget.onDay ? ` on the ${t.overBudget.onDay}${suffix(t.overBudget.onDay)}` : ''}.`)
  else if (t.budgetMinor !== null && t.overBudget && t.committedLeftMinor > 0) lines.push(`What is still to leave on its own, ${money(t.committedLeftMinor)}, is more than the ${money(Math.max(t.budgetMinor - s.spentMinor, 0))} of the budget that is left.`)
  if (t.overBudget && !t.overBudget.already && t.overBudget.onDay) lines.push(`At this pace the budget runs out around the ${t.overBudget.onDay}${suffix(t.overBudget.onDay)}.`)
  const last = t.previous.at(-1)
  const day = t.overBudget?.onDay
  const paceFigures = [
    ...(t.perDayAllowedMinor !== null ? [money(t.perDayAllowedMinor)] : []),
    money(t.committedLeftMinor),
    ...(t.budgetMinor !== null ? [money(t.budgetMinor), money(Math.max(t.budgetMinor - s.spentMinor, 0))] : []),
    ...(day ? [`${day}${suffix(day)}`] : []),
  ]
  return (
    <Scene>
      <section aria-labelledby="ai-pace">
        <Heading id="ai-pace" lead={s.isCurrent ? 'Your running total, with last month behind it.' : 'Your running total through the month.'}>
          How the month has gone
        </Heading>
        <TrajectoryChart summary={s} currency={currency} />
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-2">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-3.5 rounded" style={{ background: 'var(--accent)' }} />
            {s.monthName}
          </li>
          {t.projectedMinor !== null && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="w-3.5 border-t-2 border-dotted" style={{ borderColor: 'var(--accent)' }} />
              Where it is heading
            </li>
          )}
          {last !== undefined && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-0.5 w-3.5 rounded opacity-60" style={{ background: 'var(--other)' }} />
              {`${s.prevName}, ${money(last)}`}
            </li>
          )}
        </ul>
        {lines.length > 0 && (
          <ul className="mt-3 space-y-1">
            {lines.map((l) => (
              <li key={l} data-budget={t.overBudget ? 'over' : 'inside'} className="text-[1.0625rem] leading-[1.6]">
                <Figures text={l} figures={paceFigures} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Scene>
  )
}

const suffix = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'))

/** Where the rest of it went: the biggest categories as one bar, and each with its amount and how it moved. */
function Rest({ s, money, nameOf, colorOf }: { s: AiSummary; money: Fmt; nameOf: (id: number) => string; colorOf: (id: number) => string }) {
  const shown = s.topCategories.slice(0, 5)
  const shownShare = shown.reduce((a, c) => a + c.sharePct, 0)
  return (
    <Scene>
      <section aria-labelledby="ai-where">
        <Heading id="ai-where" lead={s.previous.minor > 0 ? `Against the same days of ${s.prevName}.` : undefined}>
          Where the money went
        </Heading>
        <div className="mt-4">
          <ShareBar parts={[...shown.map((c) => ({ id: String(c.categoryId), color: colorOf(c.categoryId), share: c.sharePct })), ...(shownShare < 100 ? [{ id: 'rest', color: 'var(--other)', share: 100 - shownShare }] : [])]} />
        </div>
        <ul className="mt-3 divide-y divide-line">
          {shown.map((c) => {
            // Said only where there is something to compare with: when last month had nothing, every row would be "New".
            const compare = s.previous.minor > 0
            const chip = c.deltaPct === null ? 'New' : c.deltaPct === 0 ? 'Same' : `${c.deltaPct > 0 ? '▲' : '▼'} ${Math.abs(c.deltaPct)}%`
            return (
              <li key={c.categoryId} data-category={c.categoryId} className="flex items-center gap-3 py-2.5">
                <Round icon={categoryIcon(nameOf(c.categoryId))} color={colorOf(c.categoryId)} />
                <span className="min-w-0 flex-1 truncate font-semibold">{nameOf(c.categoryId)}</span>
                <span className="shrink-0 text-right">
                  <span className="num">{money(c.minor)}</span>
                  <span className="ml-2 text-sm tabular-nums text-ink-2">{`${c.sharePct}%`}</span>
                  {compare && (
                    <span className={`ml-2 text-xs tabular-nums ${c.deltaPct !== null && c.deltaPct > 0 ? 'text-critical' : c.deltaPct !== null && c.deltaPct < 0 ? 'text-good' : 'text-ink-2'}`}>
                      {chip}
                      <span className="sr-only">{` on ${s.prevName}`}</span>
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </Scene>
  )
}

/** What the next month is likely to cost, in the two parts it is made of, with the range it may land in, and the months behind it. */
function Ahead({ s, money, currency }: { s: AiSummary; money: Fmt; currency: string }) {
  const { trend, outlook: o } = s
  const sentences = [
    trend.direction === 'up' ? `Spending has been rising by about ${trend.monthlyChangePct}% a month.` : trend.direction === 'down' ? `Spending has been falling by about ${Math.abs(trend.monthlyChangePct ?? 0)}% a month.` : trend.direction === 'flat' ? 'Spending has been steady from month to month.' : null,
  ].filter((x): x is string => x !== null)
  return (
    <Scene>
      <section aria-labelledby="ai-ahead">
        <Heading id="ai-ahead">What next month looks like</Heading>
        {o ? (
          <div data-testid="outlook" className="mt-3">
            <p className="text-sm text-ink-2">Next month will probably cost</p>
            <p className="font-ai-display text-5xl font-medium leading-none tracking-tight">
              <CountUp minor={whole(o.totalMinor)} currency={currency} delay={150} />
            </p>
            <p data-line="range" className="mt-1 text-[1.0625rem] leading-[1.6] text-ink-2">
              <Figures text={`Most likely between ${money(o.lowMinor)} and ${money(o.highMinor)}.`} figures={[money(o.lowMinor), money(o.highMinor)]} />
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-surface-2 px-3 py-3">
                <dt className="text-sm text-ink-2">Leaves on its own</dt>
                <dd data-part="fixed" className="font-ai-display text-2xl font-medium">{money(o.fixedMinor)}</dd>
              </div>
              <div className="rounded-2xl bg-surface-2 px-3 py-3">
                <dt className="text-sm text-ink-2">Everything else</dt>
                <dd data-part="everyday" className="font-ai-display text-2xl font-medium">{money(o.everydayMinor)}</dd>
              </div>
            </dl>
            <p data-line="year" className="mt-3 text-[1.0625rem] leading-[1.6]">
              <Figures text={`At this rate a year comes to about ${money(o.yearMinor)}.`} figures={[money(o.yearMinor)]} />
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[1.0625rem] leading-[1.6] text-ink-2">A few more months of entries and this will say what the next one is likely to cost.</p>
        )}
        <MonthBars months={s.months} currency={currency} />
        {sentences.length > 0 && (
          <ul className="mt-2 space-y-1">
            {sentences.map((line) => (
              <li key={line} data-trend={trend.direction} className="text-[1.0625rem] leading-[1.6]">
                <Figures text={line} figures={[`${trend.monthlyChangePct}%`, `${Math.abs(trend.monthlyChangePct ?? 0)}%`]} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Scene>
  )
}
