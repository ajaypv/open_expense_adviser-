import { localDateString, parseLocalDate } from '../db/money'
import type { Account, Transaction } from '../db/schema'
import { defaultAccountId, type AccountBalance } from './accounts'
import { daysBetween } from './timeline'

/** A credit card: spending on it is owed, not gone, until the bill is paid. */
export const isCard = (account: Pick<Account, 'type'>): boolean => account.type === 'credit'

/** The first and last day (YYYY-MM-DD) of the statement a date falls in, for a statement that closes on `statementDay` (1 to 28). */
export function cycleOf(date: string, statementDay: number): { from: string; to: string } {
  const d = parseLocalDate(date)
  const y = d.getFullYear()
  const m = d.getMonth()
  // On or before the statement day, the statement closes this month; after it, next month.
  const closing = d.getDate() <= statementDay ? m : m + 1
  return {
    from: localDateString(new Date(y, closing - 1, statementDay + 1)),
    to: localDateString(new Date(y, closing, statementDay)),
  }
}

/** The next time the bill falls due, today included, for a due day of the month (1 to 28). */
export function nextDueDate(dueDay: number, today: Date): string {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const thisMonth = new Date(t.getFullYear(), t.getMonth(), dueDay)
  return localDateString(thisMonth >= t ? thisMonth : new Date(t.getFullYear(), t.getMonth() + 1, dueDay))
}

/** How a line moved what is owed on the card. */
export type CardEntryKind = 'charge' | 'payment' | 'refund' | 'withdrawal'

export interface CardEntry<T extends Transaction = Transaction> {
  tx: T
  kind: CardEntryKind
  /** Plus when it made you owe more (a purchase, cash taken out), minus when it made you owe less (a payment, a refund). */
  owedMinor: number
}

/**
 * Everything that happened on one card, as it affected what is owed. A purchase on the card is a charge, money received into it is
 * a refund, a transfer in is a payment of the bill, and a transfer out (cash taken against the card) is a withdrawal. Entries in the
 * trash are left out, and the ones that name no account belong to the default one.
 */
export function cardEntries<T extends Transaction>(card: Account, txs: T[], accounts: Account[]): CardEntry<T>[] {
  const fallback = defaultAccountId(accounts)
  const out: CardEntry<T>[] = []
  for (const tx of txs) {
    if (tx.deletedAt !== undefined) continue
    const from = tx.accountId ?? fallback
    if (tx.kind === 'expense' && from === card.id) out.push({ tx, kind: 'charge', owedMinor: tx.amountMinor })
    else if (tx.kind === 'income' && from === card.id) out.push({ tx, kind: 'refund', owedMinor: -tx.amountMinor })
    else if (tx.kind === 'transfer') {
      if (tx.toAccountId === card.id) out.push({ tx, kind: 'payment', owedMinor: -tx.amountMinor })
      else if (from === card.id) out.push({ tx, kind: 'withdrawal', owedMinor: tx.amountMinor })
    }
  }
  return out.sort((a, b) => (a.tx.date < b.tx.date ? 1 : a.tx.date > b.tx.date ? -1 : b.tx.createdAt - a.tx.createdAt || b.tx.id - a.tx.id))
}

export interface CardSummary {
  account: Account
  /** What is owed now: opening amount owed plus charges minus payments. Below zero when the card is in credit. */
  owedMinor: number
  limitMinor: number | null
  /** What is left to spend under the limit (zero if over it), when a limit is set. */
  availableMinor: number | null
  /** Share of the limit in use, 0 to 1 and beyond if over it, when a limit is set. */
  usedRatio: number | null
  /** The next date the bill falls due, and the days until it; null when no due day is set or nothing is owed. */
  due: { date: string; daysAway: number } | null
  /** The statement now being built (or the calendar month, when no statement day is set), what was charged and paid in it. */
  cycle: { from: string; to: string; chargedMinor: number; paidMinor: number }
}

/** What each card owes, how much of its limit is used, when the bill is due and what the current statement holds. */
export function cardSummary(card: Account, txs: Transaction[], accounts: Account[], balance: AccountBalance | undefined, today: Date): CardSummary {
  const todayKey = localDateString(today)
  const owedMinor = -(balance?.estimatedMinor ?? card.openingMinor ?? 0)
  const limitMinor = card.creditLimitMinor ?? null
  const range = card.statementDay
    ? cycleOf(todayKey, card.statementDay)
    : { from: `${todayKey.slice(0, 7)}-01`, to: localDateString(new Date(today.getFullYear(), today.getMonth() + 1, 0)) }
  let chargedMinor = 0
  let paidMinor = 0
  for (const e of cardEntries(card, txs, accounts)) {
    if (e.tx.date < range.from || e.tx.date > range.to) continue
    if (e.owedMinor > 0) chargedMinor += e.owedMinor
    else paidMinor += -e.owedMinor
  }
  const dueDate = card.dueDay && owedMinor > 0 ? nextDueDate(card.dueDay, today) : null
  return {
    account: card,
    owedMinor,
    limitMinor,
    availableMinor: limitMinor === null ? null : Math.max(0, limitMinor - owedMinor),
    usedRatio: limitMinor === null ? null : Math.max(0, owedMinor) / limitMinor,
    due: dueDate ? { date: dueDate, daysAway: daysBetween(todayKey, dueDate) } : null,
    cycle: { ...range, chargedMinor, paidMinor },
  }
}

/** A summary for each card that is not archived, the one that is owed most first. */
export function cardSummaries(accounts: Account[], txs: Transaction[], balances: Map<number, AccountBalance>, today: Date): CardSummary[] {
  return accounts
    .filter((a) => isCard(a) && !a.archived)
    .map((a) => cardSummary(a, txs, accounts, balances.get(a.id), today))
    .sort((a, b) => b.owedMinor - a.owedMinor || a.account.id - b.account.id)
}

/** One statement (or, with no statement day, one month) of a card's log. */
export interface CardGroup<T extends Transaction = Transaction> {
  key: string
  from: string
  to: string
  entries: CardEntry<T>[]
  chargedMinor: number
  paidMinor: number
}

/**
 * A card's log, newest first, in groups: by statement when a statement day is set, otherwise by calendar month. Each group says what
 * was charged and what was paid in it.
 */
export function cardLog<T extends Transaction>(card: Account, txs: T[], accounts: Account[]): CardGroup<T>[] {
  const groups = new Map<string, CardGroup<T>>()
  for (const entry of cardEntries(card, txs, accounts)) {
    const date = entry.tx.date
    const range = card.statementDay
      ? cycleOf(date, card.statementDay)
      : { from: `${date.slice(0, 7)}-01`, to: localDateString(new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)) }
    const group = groups.get(range.from) ?? { key: range.from, ...range, entries: [], chargedMinor: 0, paidMinor: 0 }
    group.entries.push(entry)
    if (entry.owedMinor > 0) group.chargedMinor += entry.owedMinor
    else group.paidMinor += -entry.owedMinor
    groups.set(range.from, group)
  }
  return [...groups.values()].sort((a, b) => (a.from < b.from ? 1 : -1))
}

/** Whether a purchase or money received was on a credit card, and so is owed rather than part of the cash balance. */
export function onCardAccount(tx: Pick<Transaction, 'accountId'>, accounts: Account[]): boolean {
  const id = tx.accountId ?? defaultAccountId(accounts)
  return accounts.some((a) => a.id === id && isCard(a))
}
