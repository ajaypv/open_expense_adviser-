// @vitest-environment jsdom
import '../test/dom'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Category, Recurring } from '../db/schema'
import { makeLedger } from '../test/ledger'
import { PlanAheadPage } from './PlanAheadPage'

const today = new Date(2026, 9, 28) // Wed 28 Oct 2026
const categories: Category[] = [{ id: 1, name: 'Bills', color: 'var(--s1)' }]

let id = 0
const rule = (over: Partial<Recurring>): Recurring => ({
  id: ++id, kind: 'expense', amountMinor: 100_000, currency: 'INR', categoryId: 1, merchant: 'Thing', note: '', paymentMethod: '',
  frequency: 'monthly', nextDue: '2026-11-05', active: true, ...over,
})
const emi = rule({ merchant: 'Home loan', amountMinor: 1_250_000, tag: 'loan', nextDue: '2026-11-05' })
const rent = rule({ merchant: 'Rent', amountMinor: 600_000, tag: 'bill', nextDue: '2026-10-31' })
const late = rule({ merchant: 'Electricity', amountMinor: 90_000, tag: 'bill', nextDue: '2026-10-25' })
const salary = rule({ merchant: 'Salary', kind: 'income', amountMinor: 8_000_000, tag: 'income', nextDue: '2026-11-01' })

function mount(rules: Recurring[], balance: number | null = null) {
  const ledger = makeLedger({
    categories, expenseCategories: categories, categoryById: new Map(categories.map((c) => [c.id, c])),
    recurring: rules, balanceSet: balance !== null, estimatedBalanceMinor: balance ?? 0,
  })
  const handlers = { onClose: vi.fn(), onAdd: vi.fn(), onEdit: vi.fn(), onManage: vi.fn() }
  render(<PlanAheadPage open ledger={ledger} today={today} {...handlers} />)
  return handlers
}
const page = () => document.querySelector('dialog')!

describe('Plan ahead page', () => {
  it('adds up what goes out and what comes in over the days chosen, and widens it to 60 and 90', async () => {
    mount([emi, rent, salary])
    expect(screen.getByTestId('plan-out')).toHaveTextContent('₹18,500')
    expect(screen.getByTestId('plan-in')).toHaveTextContent('₹80,000')
    await userEvent.click(screen.getByRole('button', { name: '60 days' }))
    // Rent, the EMI and salary all come round again within 60 days.
    expect(screen.getByTestId('plan-out')).toHaveTextContent('₹37,000')
    expect(page()).toHaveTextContent('the next 60 days')
  })

  it('lists every payment in bands from overdue to later, in the order of the days', () => {
    mount([emi, rent, salary, late])
    const heads = Array.from(page().querySelectorAll('h3')).map((h) => h.textContent)
    expect(heads).toEqual(['Overdue1 payment', 'This week2 payments', 'Next week1 payment', 'Later1 payment'])
    expect(within(screen.getByRole('region', { name: /^Overdue/ })).getByText('Electricity')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /^This week/ })).getByText('Rent')).toBeInTheDocument()
  })

  it('opens a payment to change it', async () => {
    const { onEdit } = mount([emi, rent])
    await userEvent.click(screen.getByRole('button', { name: /^Edit Rent, Bill, In 3 days/ }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ merchant: 'Rent' }))
  })

  it('says the balance is not enough, with how much to add, and shows what is left in plain numbers', () => {
    mount([emi, rent], 1_000_000)
    expect(page()).toHaveTextContent(/You will be short by ₹8,500 from .*5.*\. Add at least ₹8,500 before then\./)
    expect(page().querySelector('[data-tone="short"]')).toHaveTextContent('Save ₹8,500 more by')
    const meter = screen.getByRole('group', { name: 'What this does to your balance' })
    expect(meter).toHaveTextContent('Balance now₹10,000')
    expect(meter.querySelector('[data-testid="balance-after"]')).toHaveTextContent('-₹8,500')
    expect(meter).toHaveAttribute('data-feel', 'critical')
    expect(meter).toHaveTextContent('These payments are more than your balance.')
  })

  it('says it is covered when it is, with nothing to put aside', () => {
    mount([emi, rent], 9_000_000)
    expect(page()).toHaveTextContent('Your balance covers these payments.')
    expect(page().querySelector('[data-tone]')).toBeNull()
  })

  it('shows no balance meter when no balance is set, and asks for one', () => {
    mount([emi, rent])
    expect(page()).toHaveTextContent('Set your balance in Settings to check these are covered.')
    expect(screen.queryByRole('group', { name: 'What this does to your balance' })).toBeNull()
  })

  it('no longer draws the balance as a line chart', () => {
    mount([emi, rent, salary], 9_000_000)
    expect(screen.queryByRole('img', { name: /Your balance over/ })).toBeNull()
    expect(page().querySelector('svg path[stroke-linejoin]')).toBeNull()
  })

  it('has Add, Close and a way to the full list', async () => {
    const { onAdd, onClose, onManage } = mount([emi, rent])
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await userEvent.click(screen.getByRole('button', { name: /All regular payments/ }))
    expect(onAdd).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    expect(onManage).toHaveBeenCalled()
  })
})

describe('Plan ahead page: this month', () => {
  const lateRule = late
  const received = rule({ merchant: 'Salary', kind: 'income', amountMinor: 5_000_000, tag: 'income', nextDue: '2026-10-30' })
  const paidTx = (over: Record<string, unknown> = {}) => ({ id: ++id, kind: 'expense', amountMinor: 500_000, currency: 'INR', categoryId: 1, merchant: 'Insurance', note: '', date: '2026-10-05', paymentMethod: '', source: 'recurring', createdAt: id, ...over })

  function mountMonth(rules: Recurring[], expenses: unknown[] = [], income: unknown[] = [], balance: number | null = null) {
    const ledger = makeLedger({
      categories, expenseCategories: categories, categoryById: new Map(categories.map((c) => [c.id, c])),
      recurring: rules, expenses: expenses as never, income: income as never, balanceSet: balance !== null, estimatedBalanceMinor: balance ?? 0,
    })
    render(<PlanAheadPage open ledger={ledger} today={today} onClose={vi.fn()} onAdd={vi.fn()} onEdit={vi.fn()} onManage={vi.fn()} />)
  }
  const month = () => screen.getByRole('region', { name: 'October so far' })

  it('says what the month comes to, what has already been paid and what is still to pay', () => {
    // Rent is due on the 31st, three days from now; ₹5,000 has already gone from a regular payment.
    mountMonth([rent], [paidTx()])
    expect(screen.getByTestId('month-total')).toHaveTextContent('₹11,000')
    expect(screen.getByTestId('month-paid')).toHaveTextContent('₹5,000')
    expect(screen.getByTestId('month-left')).toHaveTextContent('₹6,000')
    expect(month()).toHaveTextContent('Already paid')
    expect(month()).toHaveTextContent('Still to pay')
    expect(month()).toHaveTextContent('1 payment')
    expect(month()).toHaveTextContent('the last on')
  })

  it('draws it as one bar in two parts, and says it in words for a screen reader', () => {
    mountMonth([rent], [paidTx()])
    const bar = within(month()).getByRole('img')
    expect(bar).toHaveAttribute('aria-label', '₹5,000 has gone and ₹6,000 is still to go, of ₹11,000')
    const parts = Array.from(bar.children) as HTMLElement[]
    expect(parts).toHaveLength(2)
    expect(parseFloat(parts[0].style.width)).toBeCloseTo(45.45, 1)
  })

  it('counts only regular payments that were added this month', () => {
    mountMonth([rent], [paidTx(), paidTx({ source: 'manual', amountMinor: 999_000 }), paidTx({ date: '2026-09-30', amountMinor: 888_000 })])
    expect(screen.getByTestId('month-paid')).toHaveTextContent('₹5,000')
  })

  it('says how much of what is left is already late', () => {
    mountMonth([rent, lateRule])
    expect(screen.getByTestId('month-left')).toHaveTextContent('₹6,900')
    expect(month()).toHaveTextContent('₹900 of what is left is already late.')
  })

  it('says all is paid when nothing is left, and none yet when nothing has gone', () => {
    mountMonth([], [paidTx()])
    expect(screen.getByTestId('month-left')).toHaveTextContent('₹0')
    expect(month()).toHaveTextContent('All paid')
    cleanup()
    mountMonth([rent])
    expect(month()).toHaveTextContent('None yet')
  })

  it('says so when no regular payment goes out this month', () => {
    mountMonth([])
    expect(month()).toHaveTextContent('Nothing regular goes out in October.')
    expect(screen.queryByTestId('month-total')).toBeNull()
  })

  it('mentions money in apart from what goes out: a salary received and one still to come', () => {
    mountMonth([rent, received], [], [{ ...paidTx({ kind: 'income', amountMinor: 8_000_000 }) }])
    expect(month()).toHaveTextContent('Money in this month: ₹80,000 received, ₹50,000 still to come.')
    // It is not part of the total of what goes out.
    expect(screen.getByTestId('month-total')).toHaveTextContent('₹6,000')
  })

  describe('the balance, in two numbers and one bar', () => {
    const meter = () => screen.getByRole('group', { name: 'What this does to your balance' })

    it('is comfortable when the payments use little of it', () => {
      mountMonth([emi, rent], [], [], 9_000_000)
      expect(meter()).toHaveAttribute('data-feel', 'good')
      expect(meter()).toHaveTextContent('Balance now₹90,000')
      expect(meter()).toHaveTextContent('Comfortable: these payments use only 21% of your balance.')
    })

    it('says the plain share when they use a good part of it', () => {
      mountMonth([emi, rent], [], [], 3_000_000)
      expect(meter()).toHaveAttribute('data-feel', 'good')
      expect(meter()).toHaveTextContent('These payments use 62% of your balance.')
    })

    it('says it is tight when they use most of it', () => {
      mountMonth([emi, rent], [], [], 2_000_000)
      expect(meter()).toHaveAttribute('data-feel', 'warn')
      expect(meter()).toHaveTextContent('Tight: these payments use 93% of your balance.')
    })

    it('says it is not enough, in red, when they use more than there is', () => {
      mountMonth([emi, rent], [], [], 1_000_000)
      expect(meter()).toHaveAttribute('data-feel', 'critical')
      expect(within(meter()).getByTestId('balance-after')).toHaveClass('text-critical')
    })

    it('adds what comes in to what is left after', () => {
      mountMonth([emi, rent, salary], [], [], 1_000_000)
      // ₹10,000 now, ₹18,500 out, ₹80,000 in: ₹71,500 after.
      expect(within(meter()).getByTestId('balance-after')).toHaveTextContent('₹71,500')
    })
  })

  describe('when it goes out', () => {
    it('has a bar for each band that has something going out, with what goes out and how many payments', () => {
      mountMonth([emi, rent, lateRule])
      const list = screen.getByRole('list', { name: 'When it goes out' })
      const bands = Array.from(list.querySelectorAll('li')).map((li) => [li.getAttribute('data-band'), li.textContent])
      // The electricity bill is late now and falls due again in 28 days, which is later.
      expect(bands.map((b) => b[0])).toEqual(['late', 'week', 'next', 'later'])
      expect(bands[0][1]).toContain('Overdue')
      expect(bands[0][1]).toContain('₹900')
      expect(bands[1][1]).toContain('₹6,000')
      expect(bands[2][1]).toContain('₹12,500')
      expect(bands[3][1]).toContain('₹900')
    })

    it('makes the longest bar the biggest band, and the late one red', () => {
      mountMonth([emi, rent, lateRule])
      const widths = Array.from(screen.getByRole('list', { name: 'When it goes out' }).querySelectorAll<HTMLElement>('li [aria-hidden] > span')).map((s) => parseFloat(s.style.width))
      expect(widths[2]).toBeCloseTo(100, 0) // the EMI week
      expect(widths[0]).toBeLessThan(widths[1])
      expect(widths[1]).toBeLessThan(widths[2])
      expect(screen.getByRole('list', { name: 'When it goes out' }).querySelector<HTMLElement>('[data-band="late"] [aria-hidden] > span')!.style.background).toContain('critical')
    })

    it('leaves out money coming in', () => {
      mountMonth([salary])
      expect(screen.queryByRole('list', { name: 'When it goes out' })).toBeNull()
    })
  })
})
