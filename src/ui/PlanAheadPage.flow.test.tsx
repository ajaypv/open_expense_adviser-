// @vitest-environment jsdom
import '../test/dom'
import { render, screen, within } from '@testing-library/react'
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
    expect(page()).toHaveTextContent('The next 60 days')
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

  it('says the balance is not enough, with how much to add, and draws how it moves', () => {
    mount([emi, rent], 1_000_000)
    expect(page()).toHaveTextContent(/You will be short by ₹8,500 from .*5.*\. Add at least ₹8,500 before then\./)
    expect(page().querySelector('[data-tone="short"]')).toHaveTextContent('Save ₹8,500 more by')
    expect(screen.getByRole('img', { name: /Your balance over the next 30 days: starts at ₹10,000, ends at .*8,500, and goes below zero/ })).toBeInTheDocument()
  })

  it('says it is covered when it is, with nothing to put aside', () => {
    mount([emi, rent], 9_000_000)
    expect(page()).toHaveTextContent('Your balance covers these payments.')
    expect(page().querySelector('[data-tone]')).toBeNull()
  })

  it('draws no balance line when no balance is set, and asks for one', () => {
    mount([emi, rent])
    expect(page()).toHaveTextContent('Set your balance in Settings to check these are covered.')
    expect(screen.queryByRole('img', { name: /Your balance over/ })).toBeNull()
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
