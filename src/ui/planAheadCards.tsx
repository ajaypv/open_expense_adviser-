import type { CSSProperties } from 'react'
import { formatMoney, parseLocalDate } from '../db/money'
import type { AheadRow, SetAside } from '../insights/ahead'
import { describeWhen, TAG_LABELS, tagOf, type UpcomingPayment } from '../insights/upcoming'
import { Icon, type IconName } from './Icon'
import { paymentIcon } from './paymentIcon'
import { paymentName, shortDay, signedAmount } from './upcomingText'

/** How far ahead the strip and its bars look, in days. */
export const HORIZON_DAYS = 30

export type Tone = 'out' | 'in' | 'late'

export const toneOf = (p: UpcomingPayment): Tone => (p.overdue ? 'late' : p.kind === 'income' ? 'in' : 'out')
export const TONE_COLOUR: Record<Tone, string> = { out: 'var(--accent)', in: 'var(--good-text)', late: 'var(--critical)' }
const tint = (colour: string, percent = 24) => `color-mix(in oklab, ${colour} ${percent}%, var(--surface))`

/**
 * The colour of a payment's bar and badge: its category's own colour, so a bill, a subscription and a salary are told apart without
 * washing the whole card. A late payment is red whatever its category, and one with no colour falls back to blue for money out, green for in.
 */
export const paymentColour = (p: UpcomingPayment, categoryColour?: string): string => (p.overdue ? TONE_COLOUR.late : (categoryColour ?? TONE_COLOUR[toneOf(p)]))

export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

let monthFormat: Intl.DateTimeFormat | undefined

/** A little calendar leaf: the month over the day of the month, plain, and a pale red when the payment is late. Decoration; the date is also written out. */
export function DateLeaf({ date, tone, colour, size = 56, badge }: { date: string; tone: Tone; colour: string; size?: number; badge?: IconName }) {
  const d = parseLocalDate(date)
  return (
    <span aria-hidden="true" className="relative flex shrink-0" style={{ width: size, height: size }}>
      <span data-leaf className="flex size-full flex-col items-center justify-center rounded-2xl leading-none" data-colour={colour} style={{ background: tone === 'late' ? tint(colour, 16) : 'var(--surface-2)' }}>
        <span className={`${size < 50 ? 'text-[0.6875rem]' : 'text-xs'} font-semibold uppercase tracking-wide`} style={{ color: tone === 'late' ? 'var(--critical-text)' : 'var(--ink-2)' }}>
          {(monthFormat ??= new Intl.DateTimeFormat(undefined, { month: 'short' })).format(d)}
        </span>
        <span className={`type-figure mt-0.5 ${size < 50 ? 'text-xl' : 'text-2xl'}`}>{d.getDate()}</span>
      </span>
      {badge && (
        <span data-icon={badge} className="absolute -bottom-2 -right-2 flex size-5 items-center justify-center rounded-full bg-surface shadow-[0_0_0_1px_var(--ring)]" style={{ color: colour === 'var(--critical)' ? 'var(--critical-text)' : 'var(--ink)' }}>
          <Icon name={badge} size={11} />
        </span>
      )}
    </span>
  )
}

/** A thin bar that fills as the day comes closer, over the days the page looks ahead. Decoration; the days are written beside it. */
export function SoonBar({ payment, colour, horizon = HORIZON_DAYS }: { payment: UpcomingPayment; colour: string; horizon?: number }) {
  const near = payment.overdue ? 1 : Math.min(1, Math.max(0.06, 1 - payment.daysLeft / horizon))
  return (
    <span aria-hidden="true" className="block h-1 overflow-hidden rounded-full bg-surface-2">
      <span className="bar-grow block h-full rounded-full" style={{ width: `${near * 100}%`, background: colour }} />
    </span>
  )
}

const LABELS = (r: AheadRow) => (r.kind === 'emi' ? (r.alsoBiggest ? 'Next EMI, and your biggest payment' : 'Next EMI') : r.kind === 'biggest' ? 'Biggest payment ahead' : 'Money coming in')

/**
 * One payment, as a compact card: the date as a calendar leaf (with a small badge of what it is for), the name and what kind of payment it
 * is (or, for the ones worth pointing out, why: the next EMI, the biggest payment, money coming in), the amount, and how close it is. The
 * card itself is plain, with a thin outline; the only colour is the bar of how close it is, in its category's colour, and a late payment is
 * pale red in words as well as colour.
 * Fixed width, to sit in a row that scrolls sideways, with the next card showing at the edge.
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
    <li data-kind={highlight?.kind ?? 'payment'} className={`row-in shrink-0 snap-start ${wide ? 'w-full' : 'w-[12.5rem]'}`} style={{ '--d': `${Math.min(index, 5) * 70}ms` } as CSSProperties}>
      <div
        className="flex h-full flex-col rounded-[1.375rem] p-3"
        style={p.overdue ? { background: tint(colour, 9), boxShadow: `0 0 0 1px ${tint(colour, 30)}` } : { background: 'var(--surface)', boxShadow: '0 0 0 1px var(--ring)' }}
      >
        <div className="flex items-center gap-2.5">
          <DateLeaf date={p.date} tone={tone} colour={colour} size={44} badge={icon} />
          <div className="min-w-0">
            <p className="text-xs font-semibold leading-tight text-ink-2">{highlight ? LABELS(highlight) : TAG_LABELS[tagOf(p.rule)]}</p>
            <p className="truncate text-[0.9375rem] font-semibold leading-tight">{name}</p>
          </div>
        </div>
        <p className={`type-figure mt-2.5 text-[1.5rem] ${p.kind === 'income' ? 'text-good' : ''}`}>{signedAmount(p, currency)}</p>
        <div className="mt-auto pt-2">
          <SoonBar payment={p} colour={colour} />
          <p className={`mt-1 flex items-center gap-1 text-[0.8125rem] font-medium ${p.overdue ? 'text-critical' : 'text-ink-2'}`}>
            {p.overdue && <Icon name="warn" size={13} />}
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
      className={`row-in shrink-0 snap-start ${wide ? 'w-full' : 'w-[15rem]'}`}
      style={{ '--d': `${Math.min(index, 5) * 70}ms` } as CSSProperties}
    >
      <div
        className={`flex h-full flex-col rounded-[1.375rem] ${wide ? 'p-3.5' : 'p-3'}`}
        style={{ background: short ? 'var(--surface)' : 'var(--surface-2)', boxShadow: short ? '0 0 0 1.5px color-mix(in oklab, var(--critical) 45%, transparent)' : 'none' }}
      >
        <span
          aria-hidden="true"
          className={`flex ${wide ? 'size-10' : 'size-8'} items-center justify-center rounded-full bg-surface ${short ? 'text-critical' : 'text-ink-2'}`}
        >
          <Icon name={short ? 'warn' : 'flag'} size={wide ? 20 : 17} />
        </span>
        <div className={`${wide ? 'mt-3' : 'mt-2'} min-w-0`}>
          {short ? (
            <>
              <p className={`${wide ? 'text-lg' : 'text-base'} font-semibold leading-snug text-critical`}>{`Save ${money(setAside.amountMinor)} more by ${shortDay(setAside.byDate!, today)}`}</p>
              <p className={`mt-1 ${wide ? 'text-[0.9375rem]' : 'text-sm'} leading-snug text-ink-2`}>{`Your balance will not cover what is due. About ${money(setAside.perDayMinor)} a day gets you there.`}</p>
            </>
          ) : (
            <>
              <p className={`${wide ? 'text-lg' : 'text-base'} font-semibold leading-snug`}>{`${money(setAside.amountMinor)} to pay in the next ${horizon} days`}</p>
              <p className={`mt-1 ${wide ? 'text-[0.9375rem]' : 'text-sm'} leading-snug text-ink-2`}>{`Set aside about ${money(setAside.perDayMinor)} a day to be ready. Add your balance to check it is covered.`}</p>
            </>
          )}
        </div>
      </div>
    </li>
  )
}
