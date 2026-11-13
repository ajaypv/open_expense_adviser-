import { useMemo, useState } from 'react'
import type { useLedger } from '../data/useLedger'
import { formatMoney, localDateString } from '../db/money'
import type { Recurring } from '../db/schema'
import { daysInMonth, monthLabel } from '../insights/aggregates'
import { planAhead } from '../insights/ahead'
import { monthPlan, type MonthPlan } from '../insights/monthPlan'
import { describeWhen, forecast, TAG_LABELS, tagOf, totalsOf, upcomingPayments, type UpcomingPayment } from '../insights/upcoming'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { DateLeaf, paymentColour, SetAsideCard, toneOf } from './planAheadCards'
import { paymentName, shortDay, shortfallPhrase, signedAmount } from './upcomingText'

type Ledger = ReturnType<typeof useLedger>

interface Props {
  open: boolean
  onClose: () => void
  ledger: Ledger
  today: Date
  /** Opens the form for a new regular payment. */
  onAdd: () => void
  /** Opens one payment to change it. */
  onEdit: (rule: Recurring) => void
  /** Opens the full list, which also holds the paused ones. */
  onManage: () => void
}

const HORIZONS = [30, 60, 90] as const
const card = 'rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]'
const chip =
  'flex min-h-11 shrink-0 items-center rounded-full bg-surface px-4 font-medium shadow-[0_0_0_1px_var(--ring)] aria-pressed:bg-btn aria-pressed:text-btn-ink aria-pressed:shadow-none'

/** What has gone is solid and what is still to go is the same colour, pale: one colour, two states, so nothing needs a key to be read. */
const PAID = 'var(--accent)'
const LEFT = 'color-mix(in oklab, var(--accent) 26%, var(--surface-2))'

/** The payments in the order of the days, in the bands a person thinks in. */
const BANDS = [
  { id: 'late', label: 'Overdue', has: (p: UpcomingPayment) => p.daysLeft < 0 },
  { id: 'week', label: 'This week', has: (p: UpcomingPayment) => p.daysLeft >= 0 && p.daysLeft < 7 },
  { id: 'next', label: 'Next week', has: (p: UpcomingPayment) => p.daysLeft >= 7 && p.daysLeft < 14 },
  { id: 'later', label: 'Later', has: (p: UpcomingPayment) => p.daysLeft >= 14 },
] as const

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * The month in one picture: how much the regular payments come to in all, how much of it has already gone and how much is still to go,
 * as one bar split in two (what has gone solid, what is left pale) with the two figures under it. What is late is said, and the last day
 * something is still due. A salary is mentioned apart, since it is not part of what goes out.
 */
function MonthCard({ plan, name, today, currency }: { plan: MonthPlan; name: string; today: Date; currency: string }) {
  const money = (m: number) => formatMoney(m, currency)
  const nothing = plan.totalMinor === 0
  return (
    <section aria-label={`${name} so far`} className={`${card} p-5`}>
      <p className="text-[0.9375rem] font-medium text-ink-2">{`Regular payments in ${name}`}</p>
      {nothing ? (
        <p className="mt-1 text-lg font-medium">{`Nothing regular goes out in ${name}.`}</p>
      ) : (
        <>
          <p data-testid="month-total" className="type-figure mt-0.5 text-[2rem]">
            {money(plan.totalMinor)}
          </p>
          <p className="text-[0.9375rem] text-ink-2">{`in all this month, ${plural(plan.paidCount + plan.leftCount, 'payment', 'payments')}`}</p>

          <div
            role="img"
            aria-label={`${money(plan.paidMinor)} has gone and ${money(plan.leftMinor)} is still to go, of ${money(plan.totalMinor)}`}
            className="mt-4 flex h-3.5 overflow-hidden rounded-full bg-surface-2"
          >
            {plan.paidMinor > 0 && <span className="bar-grow block h-full" style={{ width: `${plan.paidShare * 100}%`, background: PAID }} />}
            {plan.leftMinor > 0 && <span className="bar-grow block h-full flex-1" style={{ background: LEFT, '--d': '120ms' } as React.CSSProperties} />}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <dt className="flex items-center gap-2 text-[0.9375rem] font-medium text-ink-2">
                <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: PAID }} />
                Already paid
              </dt>
              <dd data-testid="month-paid" className="type-figure mt-0.5 text-[1.5rem]">
                {money(plan.paidMinor)}
              </dd>
              <dd className="text-sm text-ink-2">{plan.paidCount > 0 ? plural(plan.paidCount, 'payment', 'payments') : 'None yet'}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-2 text-[0.9375rem] font-medium text-ink-2">
                <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: LEFT, boxShadow: 'inset 0 0 0 1.5px var(--accent)' }} />
                Still to pay
              </dt>
              <dd data-testid="month-left" className="type-figure mt-0.5 text-[1.5rem]">
                {money(plan.leftMinor)}
              </dd>
              <dd className="text-sm text-ink-2">
                {plan.leftCount > 0 ? `${plural(plan.leftCount, 'payment', 'payments')}${plan.lastDate ? `, the last on ${shortDay(plan.lastDate, today)}` : ''}` : 'All paid'}
              </dd>
            </div>
          </dl>

          {plan.lateMinor > 0 && (
            <p className="mt-3 flex items-center gap-2 text-[0.9375rem] font-semibold text-critical">
              <Icon name="warn" size={16} />
              {`${money(plan.lateMinor)} of what is left is already late.`}
            </p>
          )}
        </>
      )}

      {(plan.receivedMinor > 0 || plan.comingMinor > 0) && (
        <p className={`${nothing ? 'mt-2' : 'mt-3 border-t border-line pt-3'} text-[0.9375rem] text-ink-2`}>
          {'Money in this month: '}
          <b className="font-semibold text-good">{money(plan.receivedMinor)}</b>
          {' received'}
          {plan.comingMinor > 0 && (
            <>
              {', '}
              <b className="font-semibold text-good">{money(plan.comingMinor)}</b>
              {' still to come'}
            </>
          )}
          .
        </p>
      )}
    </section>
  )
}

/**
 * What the payments do to the balance, in two numbers and one bar: what you have now, what is left once they are paid (and what comes
 * in is added), and how much of the balance they use. It says in words what to feel about it: it covers it, it is tight, or it is not enough.
 */
function BalanceMeter({ now, after, outMinor, currency }: { now: number; after: number; outMinor: number; currency: string }) {
  const money = (m: number) => formatMoney(m, currency)
  const short = after < 0
  const used = now > 0 ? Math.min(1, outMinor / now) : 1
  const pct = Math.round(used * 100)
  const tone = short ? 'critical' : used > 0.8 ? 'warn' : 'good'
  const colour = tone === 'critical' ? 'var(--critical)' : tone === 'warn' ? 'var(--warn-ui)' : 'var(--good-text)'
  const words = short
    ? 'These payments are more than your balance.'
    : used > 0.8
      ? `Tight: these payments use ${pct}% of your balance.`
      : used > 0.5
        ? `These payments use ${pct}% of your balance.`
        : `Comfortable: these payments use only ${pct}% of your balance.`
  return (
    <div data-feel={tone} aria-label="What this does to your balance" role="group" className="mt-4 border-t border-line pt-4">
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-[0.9375rem] font-medium text-ink-2">Balance now</dt>
          <dd className="type-figure text-[1.375rem]">{money(now)}</dd>
        </div>
        <div>
          <dt className="text-[0.9375rem] font-medium text-ink-2">After these</dt>
          <dd data-testid="balance-after" className={`type-figure text-[1.375rem] ${short ? 'text-critical' : ''}`}>
            {money(after)}
          </dd>
        </div>
      </dl>
      <div role="img" aria-label={short ? 'The payments use more than the whole balance' : `The payments use ${pct}% of the balance`} className="mt-3 h-3 overflow-hidden rounded-full bg-surface-2">
        <span className="bar-grow block h-full rounded-full" style={{ width: `${Math.max(used, 0.03) * 100}%`, background: colour }} />
      </div>
      <p className={`mt-2 flex items-center gap-2 text-[0.9375rem] font-semibold ${short ? 'text-critical' : ''}`}>
        <span aria-hidden="true" style={{ color: colour }}>
          <Icon name={short ? 'warn' : 'check'} size={16} />
        </span>
        {words}
      </p>
    </div>
  )
}

/**
 * When the money leaves, in the same bands as the list below it: a bar for each of overdue, this week, next week and later, as long as
 * what goes out in it, with the amount, so it is plain where the weight is. Money coming in is not here, only what goes out.
 */
function WhenItGoes({ items, currency }: { items: UpcomingPayment[]; currency: string }) {
  const money = (m: number) => formatMoney(m, currency)
  const rows = BANDS.map((b) => {
    const list = items.filter((p) => p.kind === 'expense' && b.has(p))
    return { ...b, count: list.length, minor: list.reduce((s, p) => s + p.amountMinor, 0) }
  }).filter((r) => r.count > 0)
  if (rows.length === 0) return null
  const biggest = Math.max(...rows.map((r) => r.minor))
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-[0.9375rem] font-medium text-ink-2">When it goes out</p>
      <ul aria-label="When it goes out" className="mt-2 space-y-3">
        {rows.map((r) => (
          <li key={r.id} data-band={r.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className={`text-base font-semibold ${r.id === 'late' ? 'text-critical' : ''}`}>{r.label}</span>
              <span className="type-figure text-lg">{money(r.minor)}</span>
            </div>
            <div aria-hidden="true" className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
              <span className="bar-grow block h-full rounded-full" style={{ width: `${Math.max(0.05, r.minor / biggest) * 100}%`, background: r.id === 'late' ? 'var(--critical)' : PAID }} />
            </div>
            <p className="mt-0.5 text-sm text-ink-2">{plural(r.count, 'payment', 'payments')}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The whole plan for the weeks ahead on a page of its own. First the month: what the regular payments come to in all, what has already
 * gone and what is still to go. Then, over 30, 60 or 90 days: what goes out and what comes in, whether the balance is enough (in two
 * numbers and a bar), when the money leaves, what to put aside, and every payment in the order of the days, in bands from overdue to
 * later, each one opening to change it. The summary on Home is the way in.
 */
export function PlanAheadPage({ open, onClose, ledger, today, onAdd, onEdit, onManage }: Props) {
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]>(30)
  const todayKey = localDateString(today)
  const { recurring, currency, rates, categoryById, balanceSet, estimatedBalanceMinor, expenses, income } = ledger

  const items = useMemo(() => upcomingPayments(recurring, todayKey, horizon, { currency, rates }), [recurring, todayKey, horizon, currency, rates])
  const totals = totalsOf(items)
  const plan = useMemo(() => planAhead(items, { set: balanceSet, minor: estimatedBalanceMinor }, todayKey, horizon), [items, balanceSet, estimatedBalanceMinor, todayKey, horizon])
  const overall = forecast(estimatedBalanceMinor, items, todayKey)
  const shortPhrase = balanceSet ? shortfallPhrase(overall, currency, today) : null
  const money = (m: number) => formatMoney(m, currency)

  // The month, to its end: what has already been added from regular payments, and what is due in the days left.
  const monthKey = todayKey.slice(0, 7)
  const monthName = monthLabel(monthKey).split(' ')[0]
  const thisMonth = useMemo(() => {
    const left = daysInMonth(monthKey) - today.getDate()
    return monthPlan([...expenses, ...income], upcomingPayments(recurring, todayKey, left, { currency, rates }), todayKey)
  }, [expenses, income, recurring, todayKey, monthKey, today, currency, rates])

  return (
    <Dialog open={open} onClose={onClose} labelledBy="plan-title" variant="page">
      <div className="mx-auto w-full max-w-xl px-5 pb-[max(3rem,env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-10 -mx-5 flex items-center justify-between gap-3 bg-bg/80 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="min-w-0">
            <h2 id="plan-title" className="type-title">
              Plan ahead
            </h2>
            <p className="truncate text-xs text-ink-2">{`${monthName}, and the next ${horizon} days from ${shortDay(todayKey, today)}`}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={onAdd} className="min-h-11 rounded-full bg-btn px-4 font-semibold text-btn-ink">
              Add
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
              <Icon name="close" />
            </button>
          </div>
        </header>

        {open && (
          <>
            <div className="mt-2">
              <MonthCard plan={thisMonth} name={monthName} today={today} currency={currency} />
            </div>

            <div role="group" aria-label="Look ahead" className="mt-6 flex gap-2">
              {HORIZONS.map((h) => (
                <button key={h} type="button" aria-pressed={horizon === h} onClick={() => setHorizon(h)} className={chip}>
                  {`${h} days`}
                </button>
              ))}
            </div>

            <section aria-label={`Next ${horizon} days`} className={`${card} mt-3 p-5`}>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[0.9375rem] font-medium text-ink-2">Going out</dt>
                  <dd data-testid="plan-out" className="type-figure text-[1.75rem]">{money(totals.outMinor)}</dd>
                </div>
                <div>
                  <dt className="text-[0.9375rem] font-medium text-ink-2">Coming in</dt>
                  <dd data-testid="plan-in" className="type-figure text-[1.75rem] text-good">{money(totals.inMinor)}</dd>
                </div>
              </dl>

              <p className={`mt-4 flex items-start gap-2 border-t border-line pt-3 text-base ${shortPhrase ? 'font-semibold text-critical' : balanceSet ? 'font-medium' : 'font-medium text-ink-2'}`}>
                {shortPhrase ? (
                  <>
                    <span className="mt-0.5 shrink-0">
                      <Icon name="warn" size={18} />
                    </span>
                    {`You will be ${shortPhrase}. Add at least ${money(overall.shortfallMinor)} before then.`}
                  </>
                ) : balanceSet ? (
                  items.length === 0 ? (
                    'Nothing is due in this time.'
                  ) : (
                    <>
                      <span className="mt-0.5 shrink-0 text-good">
                        <Icon name="check" size={18} />
                      </span>
                      Your balance covers these payments.
                    </>
                  )
                ) : (
                  'Set your balance in Settings to check these are covered.'
                )}
              </p>

              {balanceSet && items.length > 0 && <BalanceMeter now={estimatedBalanceMinor} after={overall.endMinor} outMinor={totals.outMinor} currency={currency} />}
              <WhenItGoes items={items} currency={currency} />
            </section>

            {plan?.setAside && (
              <ul aria-label="What to put aside" className="mt-3">
                <SetAsideCard setAside={plan.setAside} today={today} currency={currency} horizon={horizon} wide />
              </ul>
            )}

            {items.length === 0 ? (
              <p className="mt-6 px-1 text-ink-2">{`Nothing is due in the next ${horizon} days.`}</p>
            ) : (
              BANDS.map((band) => {
                const list = items.filter(band.has)
                if (list.length === 0) return null
                return (
                  <section key={band.id} aria-labelledby={`plan-${band.id}`} className="mt-7">
                    <h3 id={`plan-${band.id}`} className="type-title mb-2 flex items-baseline justify-between px-1">
                      {band.label}
                      <span className="text-[0.9375rem] font-medium text-ink-2">{plural(list.length, 'payment', 'payments')}</span>
                    </h3>
                    <ul className="space-y-2">
                      {list.map((p) => {
                        const name = paymentName(p, categoryById.get(p.rule.categoryId)?.name)
                        const type = TAG_LABELS[tagOf(p.rule)]
                        const when = describeWhen(p.daysLeft)
                        return (
                          <li key={p.key}>
                            <button
                              type="button"
                              onClick={() => onEdit(p.rule)}
                              aria-label={`Edit ${name}, ${type}, ${when}, ${money(p.amountMinor)} ${p.kind === 'income' ? 'coming in' : 'going out'}, due ${shortDay(p.date, today)}`}
                              className={`${card} flex min-h-[4.5rem] w-full items-center gap-3 p-3 text-left transition-transform active:scale-[0.985] motion-reduce:transition-none`}
                            >
                              <DateLeaf date={p.date} tone={toneOf(p)} colour={paymentColour(p, categoryById.get(p.rule.categoryId)?.color)} size={52} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-lg font-semibold leading-snug">{name}</span>
                                <span className="block truncate text-[0.9375rem] font-medium text-ink-2">{type}</span>
                              </span>
                              <span className="shrink-0 text-right">
                                <span className={`block text-lg font-bold tabular-nums ${p.kind === 'income' ? 'text-good' : ''}`}>{signedAmount(p, currency)}</span>
                                <span className={`flex items-center justify-end gap-1 text-[0.9375rem] font-medium ${p.overdue ? 'text-critical' : 'text-ink-2'}`}>
                                  {p.overdue && <Icon name="warn" size={14} />}
                                  <span>{when}</span>
                                </span>
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })
            )}

            <button type="button" onClick={onManage} className={`${card} mt-8 flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left font-semibold`}>
              All regular payments, and the paused ones
              <span aria-hidden="true" className="text-ink-2">
                <Icon name="chevRight" size={20} />
              </span>
            </button>
          </>
        )}
      </div>
    </Dialog>
  )
}
