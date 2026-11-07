import { describe, expect, it } from 'vitest'
import type { Account, Transaction } from '../db/schema'
import { balancesByAccount } from './accounts'
import { cardEntries, cardLog, cardSummaries, cardSummary, cycleOf, isCard, nextDueDate, onCardAccount } from './cards'

const main: Account = { id: 1, name: 'Main', openingMinor: null }
const hdfc: Account = { id: 2, name: 'HDFC card', openingMinor: -100_000, type: 'credit', creditLimitMinor: 500_000, statementDay: 15, dueDay: 3 }
const accounts = [main, hdfc]
const today = new Date(2026, 10, 6) // Fri 6 Nov 2026

let id = 0
const tx = (over: Partial<Transaction>): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: 10_000, currency: 'INR', categoryId: 1, merchant: 'x', note: '', date: '2026-11-05',
  paymentMethod: '', source: 'manual', createdAt: id, ...over,
})

describe('isCard', () => {
  it('is only an account marked as a credit card', () => {
    expect(isCard(hdfc)).toBe(true)
    expect(isCard(main)).toBe(false)
  })
})

describe('cycleOf: the statement a day falls in', () => {
  it('runs from the day after one statement day to the next', () => {
    expect(cycleOf('2026-11-06', 15)).toEqual({ from: '2026-10-16', to: '2026-11-15' })
  })

  it('puts the statement day itself in the statement it closes, and the day after in the next', () => {
    expect(cycleOf('2026-11-15', 15)).toEqual({ from: '2026-10-16', to: '2026-11-15' })
    expect(cycleOf('2026-11-16', 15)).toEqual({ from: '2026-11-16', to: '2026-12-15' })
  })

  it('goes over the end of the year', () => {
    expect(cycleOf('2026-12-20', 15)).toEqual({ from: '2026-12-16', to: '2027-01-15' })
    expect(cycleOf('2027-01-10', 15)).toEqual({ from: '2026-12-16', to: '2027-01-15' })
  })

  it('copes with a statement day of 1 and with the end of February', () => {
    expect(cycleOf('2026-11-01', 1)).toEqual({ from: '2026-10-02', to: '2026-11-01' })
    expect(cycleOf('2027-02-10', 28)).toEqual({ from: '2027-01-29', to: '2027-02-28' })
    expect(cycleOf('2027-03-01', 28)).toEqual({ from: '2027-03-01', to: '2027-03-28' })
    expect(cycleOf('2028-03-01', 28)).toEqual({ from: '2028-02-29', to: '2028-03-28' }) // a leap year
  })

  it('has every day in exactly one statement, with no gap and no overlap', () => {
    const seen = new Map<string, string>()
    for (let n = 0; n < 400; n++) {
      const d = new Date(2026, 0, 1 + n)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const c = cycleOf(key, 22)
      expect(key >= c.from && key <= c.to).toBe(true)
      seen.set(key, c.from)
    }
    // Statements that touch are one day apart.
    const starts = [...new Set(seen.values())].sort()
    for (let i = 1; i < starts.length; i++) expect(cycleOf(starts[i], 22).from).toBe(starts[i])
  })
})

describe('nextDueDate', () => {
  it('is this month while the day has not passed, and today counts', () => {
    expect(nextDueDate(12, new Date(2026, 10, 6))).toBe('2026-11-12')
    expect(nextDueDate(12, new Date(2026, 10, 12))).toBe('2026-11-12')
  })

  it('is next month once it has passed, over the end of the year too', () => {
    expect(nextDueDate(12, new Date(2026, 10, 13))).toBe('2026-12-12')
    expect(nextDueDate(12, new Date(2026, 11, 20))).toBe('2027-01-12')
  })
})

describe('cardEntries', () => {
  it('says how each line moved what is owed: a purchase, a refund, a payment of the bill, cash taken out', () => {
    const rows = [
      tx({ accountId: 2, amountMinor: 50_000 }),
      tx({ kind: 'income', accountId: 2, amountMinor: 10_000, date: '2026-11-04' }),
      tx({ kind: 'transfer', accountId: 1, toAccountId: 2, amountMinor: 30_000, date: '2026-11-03' }),
      tx({ kind: 'transfer', accountId: 2, toAccountId: 1, amountMinor: 20_000, date: '2026-11-02' }),
    ]
    const entries = cardEntries(hdfc, rows, accounts)
    expect(entries.map((e) => [e.kind, e.owedMinor])).toEqual([
      ['charge', 50_000],
      ['refund', -10_000],
      ['payment', -30_000],
      ['withdrawal', 20_000],
    ])
  })

  it('leaves out other accounts, and anything in the trash', () => {
    const rows = [tx({ accountId: 1 }), tx({ accountId: 2, deletedAt: 9 }), tx({ accountId: 2 })]
    expect(cardEntries(hdfc, rows, accounts)).toHaveLength(1)
  })

  it('gives the default account the entries that name none', () => {
    const rows = [tx({}), tx({ accountId: 2 })]
    expect(cardEntries(hdfc, rows, accounts)).toHaveLength(1)
    expect(cardEntries(hdfc, rows, [hdfc, main])).toHaveLength(2) // the card is the first account here
  })

  it('has the newest first, by day and then by when it was entered', () => {
    const a = tx({ accountId: 2, date: '2026-11-02' })
    const b = tx({ accountId: 2, date: '2026-11-05' })
    const c = tx({ accountId: 2, date: '2026-11-05' })
    expect(cardEntries(hdfc, [a, b, c], accounts).map((e) => e.tx.id)).toEqual([c.id, b.id, a.id])
  })
})

describe('cardSummary', () => {
  const rows = [
    tx({ accountId: 2, amountMinor: 50_000, date: '2026-11-05' }), // this statement
    tx({ accountId: 2, amountMinor: 20_000, date: '2026-10-20' }), // this statement
    tx({ accountId: 2, amountMinor: 70_000, date: '2026-10-10' }), // the one before
    tx({ kind: 'transfer', accountId: 1, toAccountId: 2, amountMinor: 30_000, date: '2026-11-01' }),
  ]
  const summary = () => cardSummary(hdfc, rows, accounts, balancesByAccount(rows, accounts).get(2), today)

  it('owes what it started with, plus charges, less payments', () => {
    // 100,000 owed to begin with, + 50,000 + 20,000 + 70,000 - 30,000
    expect(summary().owedMinor).toBe(210_000)
  })

  it('says how much of the limit is used and what is left', () => {
    const s = summary()
    expect(s.limitMinor).toBe(500_000)
    expect(s.availableMinor).toBe(290_000)
    expect(s.usedRatio).toBeCloseTo(0.42)
  })

  it('has no available amount or ratio without a limit, and none left once over it', () => {
    const none = cardSummary({ ...hdfc, creditLimitMinor: undefined }, rows, accounts, balancesByAccount(rows, accounts).get(2), today)
    expect(none.limitMinor).toBeNull()
    expect(none.availableMinor).toBeNull()
    expect(none.usedRatio).toBeNull()
    const over = cardSummary({ ...hdfc, creditLimitMinor: 150_000 }, rows, accounts, balancesByAccount(rows, accounts).get(2), today)
    expect(over.availableMinor).toBe(0)
    expect(over.usedRatio).toBeGreaterThan(1)
  })

  it('says when the bill is due, in days, while something is owed', () => {
    expect(summary().due).toEqual({ date: '2026-12-03', daysAway: 27 })
    const soon = cardSummary({ ...hdfc, dueDay: 8 }, rows, accounts, balancesByAccount(rows, accounts).get(2), today)
    expect(soon.due).toEqual({ date: '2026-11-08', daysAway: 2 })
  })

  it('has no due date with no due day, or when nothing is owed', () => {
    expect(cardSummary({ ...hdfc, dueDay: undefined }, rows, accounts, balancesByAccount(rows, accounts).get(2), today).due).toBeNull()
    const paid = [tx({ kind: 'transfer', accountId: 1, toAccountId: 2, amountMinor: 100_000 })]
    expect(cardSummary(hdfc, paid, accounts, balancesByAccount(paid, accounts).get(2), today).due).toBeNull()
  })

  it('adds up what the current statement holds, charged and paid', () => {
    expect(summary().cycle).toEqual({ from: '2026-10-16', to: '2026-11-15', chargedMinor: 70_000, paidMinor: 30_000 })
  })

  it('uses the calendar month when there is no statement day', () => {
    const s = cardSummary({ ...hdfc, statementDay: undefined }, rows, accounts, balancesByAccount(rows, accounts).get(2), today)
    expect(s.cycle).toEqual({ from: '2026-11-01', to: '2026-11-30', chargedMinor: 50_000, paidMinor: 30_000 })
  })

  it('is in credit, with a negative amount owed, when overpaid', () => {
    const overpaid = [tx({ kind: 'transfer', accountId: 1, toAccountId: 2, amountMinor: 150_000 })]
    expect(cardSummary(hdfc, overpaid, accounts, balancesByAccount(overpaid, accounts).get(2), today).owedMinor).toBe(-50_000)
  })
})

describe('cardSummaries', () => {
  it('is one for each card that is not archived, the one owed most first, and none for ordinary accounts', () => {
    const small: Account = { id: 3, name: 'Amex', openingMinor: -5_000, type: 'credit' }
    const old: Account = { id: 4, name: 'Old', openingMinor: -900_000, type: 'credit', archived: true }
    const all = [main, hdfc, small, old]
    const list = cardSummaries(all, [], balancesByAccount([], all), today)
    expect(list.map((s) => s.account.name)).toEqual(['HDFC card', 'Amex'])
    expect(list.map((s) => s.owedMinor)).toEqual([100_000, 5_000])
  })

  it('is empty when there are no cards', () => {
    expect(cardSummaries([main], [], balancesByAccount([], [main]), today)).toEqual([])
  })
})

describe('cardLog', () => {
  const rows = [
    tx({ accountId: 2, amountMinor: 50_000, date: '2026-11-05' }),
    tx({ accountId: 2, amountMinor: 20_000, date: '2026-10-20' }),
    tx({ kind: 'transfer', accountId: 1, toAccountId: 2, amountMinor: 30_000, date: '2026-11-01' }),
    tx({ accountId: 2, amountMinor: 70_000, date: '2026-10-10' }),
    tx({ accountId: 2, amountMinor: 90_000, date: '2026-09-20' }),
  ]

  it('is a statement at a time, newest first, each with what was charged and paid in it', () => {
    const log = cardLog(hdfc, rows, accounts)
    // 10 Oct and 20 Sep are both in the statement that closed on 15 Oct.
    expect(log.map((g) => [g.from, g.to, g.chargedMinor, g.paidMinor])).toEqual([
      ['2026-10-16', '2026-11-15', 70_000, 30_000],
      ['2026-09-16', '2026-10-15', 160_000, 0],
    ])
    expect(log[0].entries.map((e) => e.kind)).toEqual(['charge', 'payment', 'charge'])
    expect(log[1].entries).toHaveLength(2)
  })

  it('goes by calendar month when there is no statement day', () => {
    const log = cardLog({ ...hdfc, statementDay: undefined }, rows, accounts)
    expect(log.map((g) => g.from)).toEqual(['2026-11-01', '2026-10-01', '2026-09-01'])
    expect(log[0]).toMatchObject({ to: '2026-11-30', chargedMinor: 50_000, paidMinor: 30_000 })
    expect(log[1]).toMatchObject({ to: '2026-10-31', chargedMinor: 90_000 })
  })

  it('is empty for a card nothing was charged to', () => {
    expect(cardLog(hdfc, [], accounts)).toEqual([])
  })
})

describe('onCardAccount', () => {
  it('is true for an entry on a card, false on any other account, and follows the default account', () => {
    expect(onCardAccount({ accountId: 2 }, accounts)).toBe(true)
    expect(onCardAccount({ accountId: 1 }, accounts)).toBe(false)
    expect(onCardAccount({}, accounts)).toBe(false)
    expect(onCardAccount({}, [hdfc, main])).toBe(true)
  })
})
