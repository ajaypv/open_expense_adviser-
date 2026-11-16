import { useMemo } from 'react'
import { useDisplay } from '../data/display'
import type { useLedger } from '../data/useLedger'
import { formatMoney, parseLocalDate } from '../db/money'
import { cardSpend, cardSummaries } from '../insights/cards'
import { defaultCardStyle } from '../db/cardStyles'
import { CreditCardArt } from './CreditCardArt'
import { Icon } from './Icon'

type Ledger = ReturnType<typeof useLedger>

let dayFormat: Intl.DateTimeFormat | undefined
const shortDay = (date: string) => (dayFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })).format(parseLocalDate(date))

/**
 * On Home, when there is a credit card: what is owed across the cards, and the bill that falls due first. Opens the cards.
 * Nothing is drawn without a card, and the cards are never part of the balance above it.
 */
export function CardsCard({ ledger, today, onOpen }: { ledger: Ledger; today: Date; onOpen: () => void }) {
  useDisplay() // amounts are masked or regrouped by display settings, so redraw when they change
  const summaries = useMemo(() => cardSummaries(ledger.accounts, ledger.txs, ledger.balances, today), [ledger.accounts, ledger.txs, ledger.balances, today])
  const spend = useMemo(
    () => cardSpend(summaries.map((s) => s.account), ledger.txs, ledger.accounts, today),
    [summaries, ledger.txs, ledger.accounts, today],
  )
  if (summaries.length === 0) return null

  const owed = summaries.reduce((a, s) => a + Math.max(0, s.owedMinor), 0)
  const next = summaries.filter((s) => s.due).sort((a, b) => a.due!.daysAway - b.due!.daysAway)[0]
  const soon = next !== undefined && next.due!.daysAway <= 3

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Credit cards: you owe ${formatMoney(owed, ledger.currency)}${next ? `, ${next.account.name} bill due ${shortDay(next.due!.date)}` : ''}. Spent on ${summaries.length === 1 ? 'it' : 'them'}: ${formatMoney(spend.weekMinor, ledger.currency)} this week, ${formatMoney(spend.monthMinor, ledger.currency)} this month. Open`}
      className="mt-3 flex min-h-[4.5rem] w-full items-center gap-3 rounded-3xl bg-surface px-4 py-3 text-left shadow-[0_0_0_1px_var(--ring)] active:bg-surface-2"
    >
      <CreditCardArt type={summaries[0].account.cardStyle ?? defaultCardStyle(summaries[0].account.id)} company="" width={64} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink-2">{summaries.length === 1 ? summaries[0].account.name : `${summaries.length} credit cards`}</span>
        <span className="type-figure block">{owed > 0 ? `${formatMoney(owed, ledger.currency)} owed` : 'Nothing owed'}</span>
        {next && (
          <span className={`mt-0.5 flex items-center gap-1.5 text-sm ${soon ? 'font-medium text-critical' : 'text-ink-2'}`}>
            {soon && <Icon name="warn" size={14} />}
            {`${summaries.length > 1 ? `${next.account.name}: ` : ''}due ${shortDay(next.due!.date)}`}
          </span>
        )}
        <span className="mt-0.5 block text-sm tabular-nums text-ink-2">{`Spent ${formatMoney(spend.weekMinor, ledger.currency)} this week, ${formatMoney(spend.monthMinor, ledger.currency)} this month`}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-ink-2">
        <Icon name="chevRight" size={20} />
      </span>
    </button>
  )
}
