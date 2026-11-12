import type { CSSProperties } from 'react'
import { formatMoney, parseLocalDate } from '../db/money'
import type { AheadRow, SetAside } from '../insights/ahead'
import { describeWhen, TAG_LABELS, tagOf, type UpcomingPayment } from '../insights/upcoming'
import { Icon } from './Icon'
import { paymentIcon } from './paymentIcon'
import { paymentName, shortDay, signedAmount } from './upcomingText'

/** How far ahead the strip and its bars look, in days. */
export const HORIZON_DAYS = 30

export type Tone = 'out' | 'in' | 'late'

export const toneOf = (p: UpcomingPayment): Tone => (p.overdue ? 'late' : p.kind === 'income' ? 'in' : 'out')
export const TONE_COLOUR: Record<Tone, string> = { out: 'var(--accent)', in: 'var(--good-text)', late: 'var(--critical)' }
const tint = (colour: string, percent = 24) => `color-mix(in oklab, ${colour} ${percent}%, var(--surface))`

/**
 * The colour of a payment's card: its category's own colour, as on the suggestion tiles, so a bill, a subscription and a salary do not
 * all look alike. A late payment is red whatever its category, and one with no colour falls back to blue for money out, green for in.
 */
export const paymentColour = (p: UpcomingPayment, categoryColour?: string): string => (p.overdue ? TONE_COLOUR.late : (categoryColour ?? TONE_COLOUR[toneOf(p)]))

export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

let monthFormat: Intl.DateTimeFormat | undefined

/** A little calendar leaf: the month over the day of the month, tinted in the payment's colour. Decoration; the date is also written out. */
export function DateLeaf({ date, tone, colour, size = 56 }: { date: string; tone: Tone; colour: string; size?: number }) {
  const d = parseLocalDate(date)
  return (
    <span
      aria-hidden="true"
      data-leaf
      className="flex shrink-0 flex-col items-center justify-center rounded-2xl leading-none"
      data-colour={colour}
      style={{ width: size, height: size, background: tint(colour) }}
    >
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: tone === 'late' ? 'var(--critical-text)' : 'var(--ink-2)' }}>
        {(monthFormat ??= new Intl.DateTimeFormat(undefined, { month: 'short' })).format(d)}
      </span>
      <span className="mt-0.5 text-xl font-bold tabular-nums">{d.getDate()}</span>
    </span>
  )
}

/** A thin bar that fills as the day comes closer, over the days the page looks ahead. Decoration; the days are written beside it. */
export function SoonBar({ payment, colour, horizon = HORIZON_DAYS }: { payment: UpcomingPayment; colour: string; horizon?: number }) {
  const near = payment.overdue ? 1 : Math.min(1, Math.max(0.06, 1 - payment.daysLeft / horizon))
  return (
    <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-surface-2">
      <span className="bar-grow block h-full rounded-full" style={{ width: `${near * 100}%`, background: colour }} />
    </span>
  )
}

const LABELS = (r: AheadRow) => (r.kind === 'emi' ? (r.alsoBiggest ? 'Next EMI, and your biggest payment' : 'Next EMI') : r.kind === 'biggest' ? 'Biggest payment ahead' : 'Money coming in')

/**
 * One payment, as a card: the date as a calendar leaf, what kind of payment it is (or, for the ones worth pointing out, why: the
 * next EMI, the biggest payment, money coming in), the amount, and how close it is. A late payment is red in words as well as
 * colour. Fixed width, to sit in a row that scrolls sideways.
 */
export function PaymentCard({
  payment: p,
  highlight,
  today,
  currency,
  categoryName,
  categoryColour,
  index = 0,
  wide = false,
}: {
  payment: UpcomingPayment
  /** Set when this payment is one the plan points out; it then says so in place of its type. */
  highlight?: AheadRow
  today: Date
  currency: string
  categoryName?: string
  categoryColour?: string
  index?: number
  wide?: boolean
}) {
  const tone = toneOf(p)
  const colour = paymentColour(p, categoryColour)
  const name = paymentName(p, categoryName)
  const icon = paymentIcon(tagOf(p.rule), name, categoryName)
  return (
    <li data-kind={highlight?.kind ?? 'payment'} className={`row-in shrink-0 snap-start ${wide ? 'w-full' : 'w-[15rem]'}`} style={{ '--d': `${Math.min(index, 5) * 70}ms` } as CSSProperties}>
      <div className="flex h-full flex-col rounded-3xl bg-surface p-3.5 shadow-[0_0_0_1px_var(--ring)]">
        <div className="flex items-start justify-between">
          <DateLeaf date={p.date} tone={tone} colour={colour} />
          <span aria-hidden="true" data-icon={icon} className="flex size-9 items-center justify-center rounded-full" style={{ background: tint(colour) }}>
            <Icon name={icon} size={18} />
          </span>
        </div>
        <p className="mt-3 text-sm text-ink-2">{highlight ? LABELS(highlight) : TAG_LABELS[tagOf(p.rule)]}</p>
        <p className="truncate font-medium">{name}</p>
        <p className={`text-2xl font-bold leading-tight tabular-nums ${p.kind === 'income' ? 'text-good' : ''}`}>{signedAmount(p, currency)}</p>
        <div className="mt-auto pt-3">
          <SoonBar payment={p} colour={colour} />
          <p className={`mt-1.5 flex items-center gap-1.5 text-sm ${p.overdue ? 'font-medium text-critical' : 'text-ink-2'}`}>
            {p.overdue && <Icon name="warn" size={14} />}
            {`${shortDay(p.date, today)}, ${lowerFirst(describeWhen(p.daysLeft))}`}
          </p>
        </div>
      </div>
    </li>
  )
}

/** What to do about what is due: save the shortfall, or keep this much aside when there is no balance to check against. */
export function SetAsideCard({ setAside, today, currency, horizon = HORIZON_DAYS, index = 0, wide = false }: { setAside: SetAside; today: Date; currency: string; horizon?: number; index?: number; wide?: boolean }) {
  const money = (minor: number) => formatMoney(minor, currency)
  const short = setAside.tone === 'short'
  return (
    <li
      data-tone={setAside.tone}
      className={`row-in shrink-0 snap-start ${wide ? 'w-full' : 'w-[17rem]'}`}
      style={{ '--d': `${Math.min(index, 5) * 70}ms` } as CSSProperties}
    >
      <div
        className="flex h-full flex-col rounded-3xl p-3.5"
        style={{ background: short ? 'color-mix(in oklab, var(--critical) 11%, var(--surface))' : 'var(--surface-2)', boxShadow: short ? '0 0 0 1px color-mix(in oklab, var(--critical) 35%, transparent)' : 'none' }}
      >
        <span
          aria-hidden="true"
          className={`flex size-10 items-center justify-center rounded-full bg-surface ${short ? 'text-critical' : 'text-ink-2'}`}
        >
          <Icon name={short ? 'warn' : 'flag'} size={20} />
        </span>
        <div className="mt-3 min-w-0">
          {short ? (
            <>
              <p className="font-semibold text-critical">{`Save ${money(setAside.amountMinor)} more by ${shortDay(setAside.byDate!, today)}`}</p>
              <p className="mt-1 text-sm text-ink-2">{`Your balance will not cover what is due. About ${money(setAside.perDayMinor)} a day gets you there.`}</p>
            </>
          ) : (
            <>
              <p className="font-semibold">{`${money(setAside.amountMinor)} to pay in the next ${horizon} days`}</p>
              <p className="mt-1 text-sm text-ink-2">{`Set aside about ${money(setAside.perDayMinor)} a day to be ready. Add your balance to check it is covered.`}</p>
            </>
          )}
        </div>
      </div>
    </li>
  )
}
