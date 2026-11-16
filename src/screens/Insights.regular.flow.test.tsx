// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Category, Recurring, Transaction } from '../db/schema'
import { makeLedger } from '../test/ledger'
import { Insights } from './Insights'

const today = new Date(2026, 9, 28) // Wed 28 Oct 2026

const categories: Category[] = [{ id: 1, name: 'Food & Dining', color: 'var(--s1)' }]

let id = 0
const tx = (merchant: string, date: string, rupees: number): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId: 1, merchant, note: '',
  date, paymentMethod: '', source: 'manual', createdAt: id,
})
const rule = (over: Partial<Recurring>): Recurring => ({
  id: ++id, kind: 'expense', amountMinor: 100_000, currency: 'INR', categoryId: 1, merchant: 'Thing', note: '', paymentMethod: '',
  frequency: 'monthly', nextDue: '2026-11-05', active: true, ...over,
})

const rent = rule({ merchant: 'Rent', amountMinor: 600_000, nextDue: '2026-10-31', tag: 'bill' })
const emi = rule({ merchant: 'Home loan', amountMinor: 1_250_000, nextDue: '2026-11-05', tag: 'loan' })
const maid = rule({ merchant: 'Maid', amountMinor: 20_000, frequency: 'weekly', nextDue: '2026-10-30' })
const salary = rule({ merchant: 'Salary', kind: 'income', amountMinor: 8_000_000, nextDue: '2026-10-30', tag: 'income' })

function mount(opts: { rules?: Recurring[]; txs?: Transaction[]; month?: string; balanceMinor?: number | null } = {}) {
  const { rules = [], txs = [tx('Cafe', '2026-10-02', 450)], month = '2026-10', balanceMinor = null } = opts
  const onOpenUpcoming = vi.fn()
  const ledger = makeLedger({
    txs,
    expenses: txs,
    income: [],
    categories,
    expenseCategories: categories,
    categoryById: new Map(categories.map((c) => [c.id, c])),
    recurring: rules,
    balanceSet: balanceMinor !== null,
    estimatedBalanceMinor: balanceMinor ?? 0,
  })
  render(<Insights ledger={ledger} month={month} onMonth={() => {}} today={today} onOpenSettings={() => {}} onOpenUpcoming={onOpenUpcoming} />)
  return onOpenUpcoming
}

const section = () => screen.getByRole('region', { name: 'Regular payments' })
const all = [rent, emi, maid, salary]

describe('Insights: Regular payments, the totals', () => {
  it('says what regular payments cost in a month and in a year', () => {
    mount({ rules: all })
    expect(section()).toHaveTextContent('Every month₹19,366.67')
    expect(section()).toHaveTextContent('A year₹232,400')
  })

  it('says what is still to pay this month and over the next 30 days', () => {
    mount({ rules: all })
    expect(section()).toHaveTextContent('Still to pay in October₹6,200')
    expect(section()).toHaveTextContent('Next 30 days₹19,500')
  })

  it('names the next payment, how much, and how soon', () => {
    mount({ rules: all })
    expect(section()).toHaveTextContent(/Next: Maid, ₹200/)
    expect(within(section()).getByText(/in 2 days/)).toBeInTheDocument()
  })

  it('says what share of the regular income it takes', () => {
    mount({ rules: all })
    // 19,366.67 of 80,000 a month
    expect(section()).toHaveTextContent(/24% of the ₹80,000 you expect each month/)
  })

  it('splits a month by kind of payment, biggest first', () => {
    mount({ rules: all })
    const text = section().textContent ?? ''
    expect(text.indexOf('Loan EMI')).toBeGreaterThan(-1)
    expect(text.indexOf('Loan EMI')).toBeLessThan(text.indexOf('Bill'))
  })

  it('lists what is due next, with money coming in marked', () => {
    mount({ rules: all })
    const list = within(section()).getByRole('list', { name: 'Due next' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    expect(list).toHaveTextContent('Rent')
    expect(list).toHaveTextContent('+₹80,000')
  })
})

describe('Insights: Regular payments, status pills', () => {
  const pillOf = (name: string) => {
    const row = within(within(section()).getByRole('list', { name: 'Due next' })).getAllByRole('listitem').find((li) => li.textContent?.includes(name))!
    return row.querySelector<HTMLElement>('[data-status]')!
  }

  it('gives each payment a pill that says when, with a dot for how urgent', () => {
    mount({ rules: all })
    expect(pillOf('Maid')).toHaveTextContent('In 2 days')
    expect(pillOf('Maid')).toHaveAttribute('data-status', 'soon') // within three days
    expect(pillOf('Rent')).toHaveAttribute('data-status', 'soon')
    expect(pillOf('Home loan')).toHaveTextContent('In 8 days')
    expect(pillOf('Home loan')).toHaveAttribute('data-status', 'later')
  })

  it('marks a payment that is late, in words as well as colour', () => {
    mount({ rules: [rent, rule({ merchant: 'Electricity', nextDue: '2026-10-25' })] })
    expect(pillOf('Electricity')).toHaveTextContent('Overdue by 3 days')
    expect(pillOf('Electricity')).toHaveAttribute('data-status', 'late')
  })

  it('marks money on its way in as arriving', () => {
    mount({ rules: all })
    expect(pillOf('Salary')).toHaveAttribute('data-status', 'arriving')
  })

  it('colours the dot, and never leaves the colour to carry the meaning alone', () => {
    mount({ rules: all })
    const dot = pillOf('Home loan').querySelector<HTMLElement>('[data-dot]')!
    expect(dot).toHaveAttribute('aria-hidden', 'true')
    expect(dot.style.background).toBeTruthy()
    expect(pillOf('Home loan').textContent?.trim()).not.toBe('')
  })
})

describe('Insights: Regular payments, warnings', () => {
  it('says when payments are late and have not been added', () => {
    mount({ rules: [rent, rule({ merchant: 'Electricity', nextDue: '2026-10-25' })] })
    expect(section()).toHaveTextContent('1 payment is late and has not been added.')
  })

  it('says the estimated balance covers everything, with what is left', () => {
    mount({ rules: all, balanceMinor: 5_000_000 })
    expect(section()).toHaveTextContent(/Your estimated balance covers all of it/)
  })

  it('warns when the balance would run short, and from when', () => {
    // ₹100 in the account and the ₹6,000 rent due on the 31st: ₹5,900 short.
    mount({ rules: [rent], balanceMinor: 10_000 })
    expect(within(section()).getByText(/would be short by ₹5,900 from/)).toBeInTheDocument()
  })

  it('says nothing about the balance when it has not been set', () => {
    mount({ rules: all })
    expect(within(section()).queryByText(/estimated balance/)).toBeNull()
  })

  it('flags amounts counted without an exchange rate', () => {
    mount({ rules: [rent, rule({ merchant: 'Hosting', currency: 'EUR', amountMinor: 1000, nextDue: '2026-11-02' })] })
    expect(within(section()).getByText(/EUR/)).toBeInTheDocument()
  })
})

describe('Insights: Regular payments, what is not set up', () => {
  const rentHistory = [tx('Rent', '2026-08-05', 6000), tx('Rent', '2026-09-05', 6000), tx('Rent', '2026-10-05', 6000)]

  it('points out spending that looks regular but is not set up, with what it would add', () => {
    mount({ rules: [], txs: [...rentHistory, tx('Cafe', '2026-10-02', 450)] })
    expect(within(section()).getByText('Looks regular, not set up yet')).toBeInTheDocument()
    expect(section()).toHaveTextContent('Rent')
    expect(section()).toHaveTextContent('₹6,000')
  })

  it('does not suggest what is already set up', () => {
    mount({ rules: [rule({ merchant: 'Rent', amountMinor: 600_000, nextDue: '2026-11-05' })], txs: rentHistory })
    expect(within(section()).queryByText('Looks regular, not set up yet')).toBeNull()
  })

  it('invites you to add some when there are none and nothing looks regular', () => {
    const onOpen = mount({ rules: [] })
    expect(within(section()).getByText(/Add the payments that repeat/)).toBeInTheDocument()
    fireEvent.click(within(section()).getByRole('button', { name: 'Add regular payments' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })
})

describe('Insights: Regular payments, opening the full list', () => {
  it('has a button to see and change all of them', () => {
    const onOpen = mount({ rules: all })
    fireEvent.click(within(section()).getByRole('button', { name: 'See all regular payments' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('is only for the current month, since it looks ahead from today', () => {
    mount({ rules: all, month: '2026-09', txs: [tx('Cafe', '2026-09-02', 450), tx('Cafe', '2026-10-02', 450)] })
    expect(screen.queryByRole('region', { name: 'Regular payments' })).toBeNull()
  })

  it('shows even before anything has been spent this month', () => {
    mount({ rules: all, txs: [tx('Cafe', '2026-09-02', 450)] })
    expect(section()).toHaveTextContent('Every month')
  })
})
