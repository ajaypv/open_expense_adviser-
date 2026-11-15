import { useMemo, useState } from 'react'
import type { useLedger } from '../data/useLedger'
import { formatMoney, localDateString, parseLocalDate } from '../db/money'
import type { Recurring } from '../db/schema'
import { monthLabel, shiftMonth } from '../insights/aggregates'
import { billsFrom, byDay, countsOf, monthGrid, type Bill, type BillState } from '../insights/bills'
import { describeWhen, TAG_LABELS, upcomingPayments } from '../insights/upcoming'
import { BillDetails } from './BillDetails'
import { BrandMark, brandOf } from './brands'
import { Icon } from './Icon'
import { PaymentBadge } from './PaymentBadge'
import { paymentIcon } from './paymentIcon'
import { shortDay } from './upcomingText'

type Ledger = ReturnType<typeof useLedger>

interface Props {
  ledger: Ledger
  today: Date
  /** Opens one payment to change it. */
  onEdit: (rule: Recurring) => void
  /** Opens the form for a new regular payment; without it there is no button to add one. */
  onAdd?: () => void
}

type Tab = BillState
const TABS: { id: Tab; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'late', label: 'Overdue' },
  { id: 'paid', label: 'Paid' },
]

/** One colour for each state, in the calendar's dots, its key and the list: blue to come, red late, green paid. */
const STATE_COLOUR: Record<BillState, string> = { upcoming: 'var(--accent)', late: 'var(--critical)', paid: 'var(--good-text)' }
const STATE_WORD: Record<BillState, string> = { upcoming: 'upcoming', late: 'overdue', paid: 'paid' }

/** How far ahead the calendar goes, and how far back it goes at most, in months. */
const AHEAD = 12
const BACK = 24

const DAY_MS = 86_400_000
const card = 'rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]'

/** The day the week starts on in this person's region, 1 (Monday) to 7 (Sunday); Monday when the browser cannot say. */
function weekStart(): number {
  try {
    const l = new Intl.Locale(navigator.language) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } }
    return l.getWeekInfo?.().firstDay ?? l.weekInfo?.firstDay ?? 1
  } catch {
    return 1
  }
}

let weekdayFormat: Intl.DateTimeFormat | undefined
/** The short name of the weekday in column `i` of a week that starts on `first`. */
const weekdayName = (first: number, i: number) => (weekdayFormat ??= new Intl.DateTimeFormat(undefined, { weekday: 'short' })).format(new Date(2023, 0, 1 + ((first % 7) + i)))
let longDayFormat: Intl.DateTimeFormat | undefined
const longDay = (date: string) => (longDayFormat ??= new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })).format(parseLocalDate(date))

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What a bill says about itself in words: when it is due, how late, or that it has gone. */
function statusOf(b: Bill): string {
  if (b.state === 'paid') return b.kind === 'income' ? 'Received' : 'Paid'
  return describeWhen(b.daysLeft ?? 0)
}

/** One bill as a row: its icon, its name and kind, the amount, and how it stands. A bill that is still to come or late opens to be changed. */
function BillRow({ bill: b, today, currency, onOpen }: { bill: Bill; today: Date; currency: string; onOpen: (bill: Bill) => void }) {
  const amount = `${b.kind === 'income' ? '+' : ''}${formatMoney(b.amountMinor, currency)}`
  const status = statusOf(b)
  const type = TAG_LABELS[b.tag]
  const body = (
    <>
      <PaymentBadge tag={b.tag} name={b.name} categoryName={b.categoryName} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-semibold leading-snug">{b.name}</span>
        <span className="block truncate text-[0.9375rem] font-medium text-ink-2">{`${type} · ${shortDay(b.date, today)}`}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-lg font-bold tabular-nums ${b.kind === 'income' ? 'text-good' : ''}`}>{amount}</span>
        <span className={`flex items-center justify-end gap-1 text-[0.9375rem] font-medium ${b.state === 'late' ? 'text-critical' : b.state === 'paid' ? 'text-good' : 'text-ink-2'}`}>
          {b.state === 'late' && <Icon name="warn" size={14} />}
          {b.state === 'paid' && <Icon name="check" size={14} />}
          <span>{status}</span>
        </span>
      </span>
    </>
  )
  const spoken = `${b.name}, ${type}, ${status}, ${amount} ${b.kind === 'income' ? 'coming in' : 'going out'}, ${shortDay(b.date, today)}`
  return (
    <li data-bill={b.state}>
      <button
        type="button"
        onClick={() => onOpen(b)}
        aria-label={spoken}
        aria-haspopup="dialog"
        className={`${card} flex min-h-[4.5rem] w-full items-center gap-3 p-3 text-left transition-transform active:scale-[0.985] motion-reduce:transition-none`}
      >
        {body}
      </button>
    </li>
  )
}

/**
 * The regular payments on a calendar, a month at a time. Every day that has one is marked: a day with a single payment shows its icon, a
 * day with several shows the number, and under it a dot for each, blue for one still to come, red for one that is late and green for one that
 * has been paid. Today is ringed. Pressing a day shows what falls on it. Below, one switch between Upcoming, Overdue and Paid for the month
 * (Overdue is every late payment, in whichever month, since each is waiting for you). The arrows go back and forward a month.
 */
export function BillsCalendar({ ledger, today, onEdit, onAdd }: Props) {
  const { recurring, currency, rates, categoryById, expenses, income, accounts, accountById } = ledger
  const todayKey = localDateString(today)
  const thisMonth = todayKey.slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [day, setDay] = useState<string | null>(null)
  const [openBill, setOpenBill] = useState<Bill | null>(null)
  const first = useMemo(weekStart, [])

  // Everything due up to the end of the month in view, with whatever is late (a month already gone has only the late ones).
  const items = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const end = new Date(y, m, 0).getTime()
    const left = Math.max(0, Math.round((end - parseLocalDate(todayKey).getTime()) / DAY_MS))
    return upcomingPayments(recurring, todayKey, left, { currency, rates })
  }, [recurring, todayKey, month, currency, rates])
  const bills = useMemo(() => billsFrom([...expenses, ...income], items, recurring, (id) => categoryById.get(id)?.name), [expenses, income, items, recurring, categoryById])

  const inMonth = useMemo(() => bills.filter((b) => b.date.startsWith(month)), [bills, month])
  const days = useMemo(() => byDay(inMonth), [inMonth])
  const counts = countsOf(inMonth)
  const lateAll = useMemo(() => bills.filter((b) => b.state === 'late'), [bills])
  const [tab, setTab] = useState<Tab>(() => (lateAll.length > 0 ? 'late' : 'upcoming'))

  const earliest = useMemo(() => {
    const oldest = bills.reduce((m, b) => (b.date < m ? b.date : m), todayKey).slice(0, 7)
    const floor = shiftMonth(thisMonth, -BACK)
    return oldest < floor ? floor : oldest
  }, [bills, todayKey, thisMonth])
  const latest = shiftMonth(thisMonth, AHEAD)
  const grid = useMemo(() => monthGrid(month, first), [month, first])

  const monthName = monthLabel(month)
  const shown: Bill[] = day ? (days.get(day) ?? []) : tab === 'late' ? lateAll : inMonth.filter((b) => b.state === tab)
  const nothing = recurring.length === 0 && bills.length === 0

  // For the bill that is open: the payment behind it, what it is paid from (said only when there is a choice of accounts), and the last time it went through.
  const lastPaid = useMemo(() => {
    if (!openBill) return undefined
    const name = openBill.name.trim().toLowerCase()
    return bills.filter((b) => b.state === 'paid' && b.date < openBill.date && b.name.trim().toLowerCase() === name).at(-1)
  }, [bills, openBill])
  const accountName = openBill?.rule?.accountId !== undefined && accounts.length > 1 ? accountById.get(openBill.rule.accountId)?.name : undefined

  const goTo = (m: string) => {
    setMonth(m)
    setDay(null)
  }
  const pickTab = (t: Tab) => {
    setTab(t)
    setDay(null)
  }

  if (nothing) {
    return (
      <section aria-label="Calendar of regular payments" className={`${card} p-5`}>
        <p className="text-lg font-semibold">Nothing regular yet</p>
        <p className="mt-1 text-[1.0625rem] leading-[1.6] text-ink-2">Add a bill, a subscription or an EMI and it shows here on its day, with a dot for what is still to pay, what is late and what is paid.</p>
        {onAdd && (
          <button type="button" onClick={onAdd} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-full bg-btn px-5 font-semibold text-btn-ink">
            <Icon name="plus" size={18} />
            Add a regular payment
          </button>
        )}
      </section>
    )
  }

  return (
    <section aria-label="Calendar of regular payments">
      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between gap-2">
          <h2 data-testid="bills-month" className="type-title text-[1.25rem]">
            {monthName}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => goTo(shiftMonth(month, -1))}
              disabled={month <= earliest}
              aria-label="The month before"
              className="flex size-11 items-center justify-center rounded-full bg-surface-2 active:opacity-70 disabled:opacity-35"
            >
              <Icon name="chevLeft" size={20} />
            </button>
            <button
              type="button"
              onClick={() => goTo(shiftMonth(month, 1))}
              disabled={month >= latest}
              aria-label="The month after"
              className="flex size-11 items-center justify-center rounded-full bg-surface-2 active:opacity-70 disabled:opacity-35"
            >
              <Icon name="chevRight" size={20} />
            </button>
          </div>
        </div>

        <div aria-hidden="true" className="mt-3 grid grid-cols-7 text-center text-xs font-medium text-ink-2">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i}>{weekdayName(first, i)}</span>
          ))}
        </div>

        <div data-grid className="mt-1 grid grid-cols-7 gap-y-1">
          {grid.map((c) => {
            const list = days.get(c.date) ?? []
            const today0 = c.date === todayKey
            const selected = c.date === day
            const ring = today0 ? 'shadow-[inset_0_0_0_1.5px_var(--ink)]' : ''
            if (!c.inMonth) {
              return (
                <span key={c.date} aria-hidden="true" className="flex h-[3.25rem] items-start justify-center pt-3 text-base tabular-nums text-ink-2/35">
                  {c.day}
                </span>
              )
            }
            if (list.length === 0) {
              return (
                <span key={c.date} aria-hidden="true" data-day={c.date} className="flex h-[3.25rem] items-start justify-center pt-1">
                  <span className={`flex size-10 items-center justify-center rounded-xl text-base tabular-nums ${ring}`}>{c.day}</span>
                </span>
              )
            }
            const one = list.length === 1 ? list[0] : null
            const brand = one ? brandOf(one.name, one.tag) : null
            const spoken = `${longDay(c.date)}: ${list.map((b) => `${b.name}, ${STATE_WORD[b.state]}`).join('; ')}`
            return (
              <button
                key={c.date}
                type="button"
                data-day={c.date}
                aria-label={spoken}
                aria-pressed={selected}
                onClick={() => setDay(selected ? null : c.date)}
                className="relative flex h-[3.25rem] flex-col items-center pt-1 active:opacity-70"
              >
                <span
                  data-brand={brand?.id}
                  className={`flex size-10 items-center justify-center overflow-hidden rounded-xl text-base font-semibold tabular-nums ${
                    brand ? (selected ? 'shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ink)]' : ring || (brand.light ? 'shadow-[inset_0_0_0_1px_var(--ring)]' : '')) : selected ? 'bg-btn text-btn-ink' : `bg-surface-2 ${ring}`
                  }`}
                  style={brand ? { background: brand.bg } : undefined}
                >
                  {brand ? (
                    <BrandMark brand={brand} size={24} />
                  ) : one ? (
                    <span data-icon={paymentIcon(one.tag, one.name, one.categoryName)} aria-hidden="true">
                      <Icon name={paymentIcon(one.tag, one.name, one.categoryName)} size={20} />
                    </span>
                  ) : (
                    c.day
                  )}
                </span>
                <span aria-hidden="true" className="absolute bottom-0 flex gap-0.5">
                  {list.slice(0, 4).map((b) => (
                    <span key={b.key} data-dot={b.state} className="size-1.5 rounded-full" style={{ background: STATE_COLOUR[b.state] }} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>

        <ul aria-label={`${monthName} at a glance`} className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[0.9375rem] text-ink-2">
          {TABS.map((t) => (
            <li key={t.id} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: STATE_COLOUR[t.id] }} />
              {`${counts[t.id]} ${STATE_WORD[t.id]}`}
            </li>
          ))}
        </ul>
      </div>

      <div role="radiogroup" aria-label="Show" className="mt-4 grid grid-cols-3 gap-1 rounded-[1.75rem] bg-surface-2 p-1">
        {TABS.map((t) => (
          <label
            key={t.id}
            className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full text-sm font-medium has-[:checked]:bg-btn has-[:checked]:text-btn-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
          >
            <input type="radio" name="bills-tab" className="sr-only" checked={!day && tab === t.id} onChange={() => pickTab(t.id)} />
            {t.label}
          </label>
        ))}
      </div>

      <div className="mt-3">
        {day && (
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <p className="type-title text-[1.125rem]">{longDay(day)}</p>
            <button type="button" onClick={() => setDay(null)} className="min-h-11 rounded-full px-3 text-[0.9375rem] font-semibold text-ink-2">
              {`All of ${monthName.split(' ')[0]}`}
            </button>
          </div>
        )}
        {shown.length === 0 ? (
          <p className="px-1 text-[1.0625rem] leading-[1.6] text-ink-2">
            {tab === 'late' && !day ? 'Nothing is overdue.' : tab === 'paid' && !day ? `Nothing has been paid from a regular payment in ${monthName.split(' ')[0]} yet.` : `Nothing more to pay in ${monthName.split(' ')[0]}.`}
          </p>
        ) : (
          <ul aria-label={day ? `Payments on ${longDay(day)}` : `${plural(shown.length, 'payment')}, ${TABS.find((t) => t.id === tab)!.label.toLowerCase()}`} className="space-y-2">
            {shown.map((b) => (
              <BillRow key={b.key} bill={b} today={today} currency={currency} onOpen={setOpenBill} />
            ))}
          </ul>
        )}
        {onAdd && (
          <button type="button" onClick={onAdd} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-surface-2 px-5 font-semibold">
            <Icon name="plus" size={18} />
            Add a regular payment
          </button>
        )}
      </div>

      <BillDetails bill={openBill} rule={openBill?.rule} currency={currency} accountName={accountName} lastPaid={lastPaid} onClose={() => setOpenBill(null)} onEdit={onEdit} />
    </section>
  )
}
