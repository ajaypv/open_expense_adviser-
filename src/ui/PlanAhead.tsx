import { useMemo } from 'react'
import type { useLedger } from '../data/useLedger'
import { formatMoney, localDateString } from '../db/money'
import { planAhead } from '../insights/ahead'
import { forecast, totalsOf, upcomingPayments } from '../insights/upcoming'
import { Icon } from './Icon'
import { HORIZON_DAYS, PaymentCard, SetAsideCard } from './planAheadCards'
import { ScrollStrip } from './ScrollStrip'
import { shortfallPhrase } from './upcomingText'

type Ledger = ReturnType<typeof useLedger>

/** How many payments the row shows before "more": enough to see what is coming, few enough to swipe through. */
const SHOWN = 6

interface Props {
  ledger: Ledger
  today: Date
  /** Opens the whole plan on a page of its own, from View and from the last card. */
  onOpen?: () => void
  /** With nothing set up, a quiet line that leads to adding the first regular payment; without it there is nothing to show. */
  onSetUp?: () => void
}

/**
 * On Home, right under the summary, everything regular in one place: one sentence for what the next 30 days hold (what goes
 * out, what comes in), one line for whether the balance covers it, then the payments themselves as a row of cards that scrolls
 * sideways, soonest first, with a late one first of all. The ones worth pointing out say so on the card (the next EMI, the
 * biggest payment, money coming in), and what to keep aside is a card too, in red and first when the balance will not stretch.
 * "View" and the last card open the whole plan on its own page. Only for payments that are set up, and only for the month in
 * progress. The row runs edge to edge inside the page's 20px gutter, and the scroll padding keeps the first card clear of the edge.
 */
export function PlanAhead({ ledger, today, onOpen, onSetUp }: Props) {
  const todayKey = localDateString(today)
  const { recurring, currency, rates, balanceSet, estimatedBalanceMinor, categoryById } = ledger
  const items = useMemo(() => upcomingPayments(recurring, todayKey, HORIZON_DAYS, { currency, rates }), [recurring, todayKey, currency, rates])
  const plan = useMemo(() => planAhead(items, { set: balanceSet, minor: estimatedBalanceMinor }, todayKey, HORIZON_DAYS), [items, balanceSet, estimatedBalanceMinor, todayKey])

  if (!recurring.some((r) => r.active)) {
    return onSetUp ? (
      <button
        type="button"
        onClick={onSetUp}
        className="mt-8 flex min-h-12 w-full items-center gap-3 rounded-3xl bg-surface px-4 py-2.5 text-left shadow-[0_0_0_1px_var(--ring)]"
      >
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
          <Icon name="repeat" size={18} />
        </span>
        <span className="min-w-0 flex-1 font-semibold">Track loans, auto-payments and salary</span>
        <span aria-hidden="true" className="text-ink-2">
          <Icon name="chevRight" size={20} />
        </span>
      </button>
    ) : null
  }

  const money = (minor: number) => formatMoney(minor, currency)
  const totals = totalsOf(items)
  const f = forecast(estimatedBalanceMinor, items, todayKey)
  // With no balance set the estimate starts from zero, so every payment would look like a shortfall: say nothing then.
  const short = balanceSet ? shortfallPhrase(f, currency, today) : null

  // The ones the plan points out are always in the row; the rest fill it from the soonest.
  const highlights = new Map((plan?.rows ?? []).map((r) => [r.payment.key, r]))
  const chosen = new Set(highlights.keys())
  for (const p of items) {
    if (chosen.size >= SHOWN) break
    chosen.add(p.key)
  }
  const shown = items.filter((p) => chosen.has(p.key))
  const more = items.length - shown.length
  const setAside = plan?.setAside ?? null
  const first = setAside?.tone === 'short'
  const aside = setAside && <SetAsideCard key="aside" setAside={setAside} today={today} currency={currency} index={first ? 0 : shown.length} />

  return (
    <section aria-label="Plan ahead" className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-title px-1">Plan ahead</h2>
        {onOpen && (
          <button type="button" onClick={onOpen} aria-label="View plan ahead" className="-mr-2 min-h-11 rounded-full px-3 font-medium underline underline-offset-2">
            View
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-0.5 px-1 text-[0.9375rem] text-ink-2">{`Nothing due in the next ${HORIZON_DAYS} days.`}</p>
      ) : (
        <>
          <p className="mt-0.5 px-1 text-base text-ink-2 text-pretty">
            {`In the next ${HORIZON_DAYS} days, `}
            <b className="font-semibold text-ink">{money(totals.outMinor)}</b>
            {' goes out'}
            {totals.inMinor > 0 && (
              <>
                {' and '}
                <b className="font-semibold text-good">{money(totals.inMinor)}</b>
                {' comes in'}
              </>
            )}
            .
          </p>
          <p className={`mb-3 mt-1 flex items-center gap-1.5 px-1 text-base font-medium ${short ? 'text-critical' : balanceSet ? '' : 'text-ink-2'}`}>
            {short ? (
              <>
                <Icon name="warn" size={16} />
                Your balance will not cover all of these.
              </>
            ) : balanceSet ? (
              <>
                <span className="text-good">
                  <Icon name="check" size={16} />
                </span>
                {`Your balance covers the next ${HORIZON_DAYS} days.`}
              </>
            ) : (
              'Set your balance to check these are covered.'
            )}
          </p>
          <ScrollStrip label="Payments coming up, scroll sideways">
            {first && aside}
            {shown.map((p, i) => (
              <PaymentCard key={p.key} payment={p} highlight={highlights.get(p.key)} today={today} currency={currency} categoryName={categoryById.get(p.rule.categoryId)?.name} categoryColour={categoryById.get(p.rule.categoryId)?.color} index={i + (first ? 1 : 0)} />
            ))}
            {!first && aside}
            {more > 0 && onOpen && (
              <li className="row-in shrink-0 snap-start">
                <button
                  type="button"
                  onClick={onOpen}
                  aria-label={`See all ${items.length} payments`}
                  className="flex h-full min-h-[7.5rem] w-[7.5rem] flex-col items-start justify-between rounded-[1.375rem] bg-surface-2 p-3 text-left transition-transform active:scale-[0.97] motion-reduce:transition-none"
                >
                  <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-surface">
                    <Icon name="chevRight" size={18} />
                  </span>
                  <span>
                    <span className="type-figure block text-2xl">{`+${more}`}</span>
                    <span className="block text-[0.9375rem] font-medium leading-snug text-ink-2">{`more in the next ${HORIZON_DAYS} days`}</span>
                  </span>
                </button>
              </li>
            )}
          </ScrollStrip>
        </>
      )}
    </section>
  )
}
