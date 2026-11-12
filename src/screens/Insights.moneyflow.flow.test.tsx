// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { makeLedger } from '../test/ledger'
import { Insights } from './Insights'

const today = new Date(2026, 9, 28) // Wed 28 Oct 2026

const categories: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Transport', color: 'var(--s3)' },
  { id: 3, name: 'Shopping', color: 'var(--s4)' },
]

let id = 0
const tx = (categoryId: number, rupees: number): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId, merchant: `Shop ${id}`, note: '',
  date: '2026-10-05', paymentMethod: '', source: 'manual', createdAt: id,
})

function mount(txs: Transaction[], onPickCategory = vi.fn()) {
  const ledger = makeLedger({
    txs, expenses: txs, income: [], categories, expenseCategories: categories,
    categoryById: new Map(categories.map((c) => [c.id, c])),
  })
  render(<Insights ledger={ledger} month="2026-10" onMonth={() => {}} today={today} onOpenSettings={() => {}} onPickCategory={onPickCategory} />)
  return onPickCategory
}

const section = () => screen.getByRole('region', { name: 'Money flow' })

describe('Insights: Money flow, a section of its own right at the top', () => {
  const txs = () => [tx(1, 600), tx(2, 300), tx(3, 100)]

  it('comes first, before the headline and the spending pace', () => {
    mount(txs())
    const text = document.body.textContent ?? ''
    expect(text.indexOf('Money flow')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('Money flow')).toBeLessThan(text.indexOf('You spent'))
    expect(text.indexOf('Money flow')).toBeLessThan(text.indexOf('Spending pace'))
    expect(text.indexOf('Money flow')).toBeLessThan(text.indexOf('Where it went'))
  })

  it('shows the month total on the chest and an icon, name and share for each category', () => {
    mount(txs())
    expect(within(section()).getByText('Spent in October')).toBeInTheDocument()
    expect(within(section()).getByText('₹1,000')).toBeInTheDocument()
    const icons = Array.from(section().querySelectorAll('li [data-icon]'))
    expect(icons).toHaveLength(3)
    expect(within(section()).getByRole('button', { name: /^Food & Dining, ₹600.*60\.0%/ })).toBeInTheDocument()
  })

  it('opens a category when it is tapped', () => {
    const onPick = mount(txs())
    fireEvent.click(within(section()).getByRole('button', { name: /^Transport, ₹300/ }))
    expect(onPick).toHaveBeenCalledWith(2)
  })

  it('is no longer one of the ways to look at Where it went', () => {
    mount(txs())
    const choice = within(screen.getByRole('region', { name: 'Where it went' })).getByRole('group', { name: 'How to show the categories' })
    expect(within(choice).queryByRole('button', { name: 'Flow' })).toBeNull()
    expect(within(choice).getByRole('button', { name: 'Bubbles' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('has nothing to draw in a month with no spending', () => {
    mount([])
    expect(screen.queryByRole('region', { name: 'Money flow' })).toBeNull()
  })
})
