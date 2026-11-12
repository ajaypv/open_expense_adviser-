import { useMemo, useState } from 'react'
import type { useLedger } from '../data/useLedger'
import { formatMoney, localDateString } from '../db/money'
import type { Recurring } from '../db/schema'
import { planAhead } from '../insights/ahead'
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

/** The payments in the order of the days, in the bands a person thinks in. */
const BANDS = [
  { id: 'late', label: 'Overdue', has: (p: UpcomingPayment) => p.daysLeft < 0 },
  { id: 'week', label: 'This week', has: (p: UpcomingPayment) => p.daysLeft >= 0 && p.daysLeft < 7 },
  { id: 'next', label: 'Next week', has: (p: UpcomingPayment) => p.daysLeft >= 7 && p.daysLeft < 14 },
  { id: 'later', label: 'Later', has: (p: UpcomingPayment) => p.daysLeft >= 14 },
] as const

/**
 * The balance walked forward through the payments, as a step line: where it starts, how it drops with each payment and rises with
 * each salary, and the zero line when it goes below. Words under it give the lowest point and the end, so the line is not the only way
 * to read it.
 */
function BalancePath({ start, items, todayKey, horizon, currency, today }: { start: number; items: UpcomingPayment[]; todayKey: string; horizon: number; currency: string; today: Date }) {
  const f = forecast(start, items, todayKey)
  const steps = useMemo(() => {
    const events = items
      .map((p) => ({ day: Math.max(0, p.daysLeft), delta: p.kind === 'income' ? p.amountMinor : -p.amountMinor }))
      .sort((a, b) => a.day - b.day || a.delta - b.delta)
    const out: { day: number; balance: number }[] = [{ day: 0, balance: start }]
    let balance = start
    for (const e of events) {
      out.push({ day: e.day, balance })
      balance += e.delta
      out.push({ day: e.day, balance })
    }
    out.push({ day: horizon, balance })
    return out
  }, [items, start, horizon])

  const W = 300
  const H = 96
  const lo = Math.min(0, ...steps.map((s) => s.balance))
  const hi = Math.max(0, ...steps.map((s) => s.balance), 1)
  const x = (day: number) => (day / horizon) * W
  const y = (b: number) => 8 + (1 - (b - lo) / (hi - lo)) * (H - 16)
  const line = steps.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.day).toFixed(1)} ${y(s.balance).toFixed(1)}`).join(' ')
  const short = f.shortfallMinor > 0
  const money = (m: number) => formatMoney(m, currency)

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Your balance over the next ${horizon} days: starts at ${money(start)}, ends at ${money(f.endMinor)}${short ? ', and goes below zero' : ''}`}
        className="h-24 w-full overflow-visible"
      >
        {lo < 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--critical)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" opacity="0.7" />}
        <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={short ? 'var(--critical)' : 'var(--accent)'} opacity="0.1" />
        <path d={line} fill="none" stroke={short ? 'var(--critical)' : 'var(--accent)'} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-2 flex items-baseline justify-between gap-3 text-sm text-ink-2 tabular-nums">
        <span>{f.lowestDate ? `Lowest ${money(f.lowestMinor)} on ${shortDay(f.lowestDate, today)}` : `Stays at ${money(f.endMinor)} or more`}</span>
        <span>{`Ends at ${money(f.endMinor)}`}</span>
      </p>
    </div>
  )
}

/**
 * The whole plan for the weeks ahead on a page of its own: what goes out and what comes in over 30, 60 or 90 days, whether the
 * balance is enough and how it moves, what to put aside, and every payment in the order of the days, in bands from overdue to later,
 * each one opening to change it. The summary on Home is the way in.
 */
export function PlanAheadPage({ open, onClose, ledger, today, onAdd, onEdit, onManage }: Props) {
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]>(30)
  const todayKey = localDateString(today)
  const { recurring, currency, rates, categoryById, balanceSet, estimatedBalanceMinor } = ledger

  const items = useMemo(() => upcomingPayments(recurring, todayKey, horizon, { currency, rates }), [recurring, todayKey, horizon, currency, rates])
  const totals = totalsOf(items)
  const plan = useMemo(() => planAhead(items, { set: balanceSet, minor: estimatedBalanceMinor }, todayKey, horizon), [items, balanceSet, estimatedBalanceMinor, todayKey, horizon])
  const overall = forecast(estimatedBalanceMinor, items, todayKey)
  const shortPhrase = balanceSet ? shortfallPhrase(overall, currency, today) : null
  const money = (m: number) => formatMoney(m, currency)

  return (
    <Dialog open={open} onClose={onClose} labelledBy="plan-title" variant="page">
      <div className="mx-auto w-full max-w-xl px-5 pb-[max(3rem,env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-10 -mx-5 flex items-center justify-between gap-3 bg-bg/80 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="min-w-0">
            <h2 id="plan-title" className="text-xl font-semibold tracking-tight">
              Plan ahead
            </h2>
            <p className="truncate text-xs text-ink-2">{`The next ${horizon} days from ${shortDay(todayKey, today)}`}</p>
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
            <div role="group" aria-label="Look ahead" className="mt-2 flex gap-2">
              {HORIZONS.map((h) => (
                <button key={h} type="button" aria-pressed={horizon === h} onClick={() => setHorizon(h)} className={chip}>
                  {`${h} days`}
                </button>
              ))}
            </div>

            <section aria-label={`Next ${horizon} days`} className={`${card} mt-4 p-5`}>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-sm text-ink-2">Going out</dt>
                  <dd data-testid="plan-out" className="text-2xl font-bold tabular-nums">{money(totals.outMinor)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-2">Coming in</dt>
                  <dd data-testid="plan-in" className="text-2xl font-bold tabular-nums text-good">{money(totals.inMinor)}</dd>
                </div>
              </dl>

              <p className={`mt-4 flex items-start gap-2 border-t border-line pt-3 ${shortPhrase ? 'font-semibold text-critical' : balanceSet ? '' : 'text-ink-2'}`}>
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

              {balanceSet && items.length > 0 && (
                <div className="mt-4">
                  <BalancePath start={estimatedBalanceMinor} items={items} todayKey={todayKey} horizon={horizon} currency={currency} today={today} />
                </div>
              )}
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
                    <h3 id={`plan-${band.id}`} className="mb-2 flex items-baseline justify-between px-1 text-xl font-bold tracking-tight">
                      {band.label}
                      <span className="text-sm font-normal text-ink-2">{`${list.length} ${list.length === 1 ? 'payment' : 'payments'}`}</span>
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
                                <span className="block truncate font-medium">{name}</span>
                                <span className="block truncate text-sm text-ink-2">{type}</span>
                              </span>
                              <span className="shrink-0 text-right">
                                <span className={`block font-semibold tabular-nums ${p.kind === 'income' ? 'text-good' : ''}`}>{signedAmount(p, currency)}</span>
                                <span className={`flex items-center justify-end gap-1 text-sm ${p.overdue ? 'font-medium text-critical' : 'text-ink-2'}`}>
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

            <button type="button" onClick={onManage} className={`${card} mt-8 flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left font-medium`}>
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
