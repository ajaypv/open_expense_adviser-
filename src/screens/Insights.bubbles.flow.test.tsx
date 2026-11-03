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
const txs = [tx(1, 600), tx(2, 300), tx(3, 100)]

function mount(onPickCategory = vi.fn()) {
  const ledger = makeLedger({
    txs,
    expenses: txs,
    income: [],
    categories,
    expenseCategories: categories,
    categoryById: new Map(categories.map((c) => [c.id, c])),
  })
  render(<Insights ledger={ledger} month="2026-10" onMonth={() => {}} today={today} onOpenSettings={() => {}} onPickCategory={onPickCategory} />)
  return onPickCategory
}

const section = () => screen.getByRole('region', { name: 'Where it went' })
const choice = () => within(section()).getByRole('group', { name: 'How to show the categories' })
const bubbles = () => within(section()).queryByRole('list', { name: /bubbles sized by share/ })

describe('Insights: Where it went, as bubbles or as a list', () => {
  it('shows the categories as bubbles to begin with, each with its name and share', () => {
    mount()
    expect(within(choice()).getByRole('button', { name: 'Bubbles' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(choice()).getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'false')
    expect(bubbles()).not.toBeNull()
    const food = within(bubbles()!).getByRole('button', { name: /^Food & Dining, 60\.0%/ })
    expect(food).toHaveTextContent('60.0%')
  })

  it('opens a category when its bubble is tapped', () => {
    const onPick = mount()
    fireEvent.click(within(section()).getByRole('button', { name: /^Transport, 30\.0%/ }))
    expect(onPick).toHaveBeenCalledWith(2)
  })

  it('switches to the ranked list, with the same categories and the same way in', () => {
    const onPick = mount()
    fireEvent.click(within(choice()).getByRole('button', { name: 'List' }))
    expect(bubbles()).toBeNull()
    expect(within(choice()).getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
    const row = within(section()).getByRole('button', { name: /^Food & Dining, ₹600.*Show these expenses/ })
    fireEvent.click(row)
    expect(onPick).toHaveBeenCalledWith(1)
  })

  it('switches to the donut, with its legend, and opens a category from there too', () => {
    const onPick = mount()
    fireEvent.click(within(choice()).getByRole('button', { name: 'Donut' }))
    expect(bubbles()).toBeNull()
    expect(within(choice()).getByRole('button', { name: 'Donut' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(section()).getByTestId('donut-centre')).toHaveTextContent('₹1,000')
    fireEvent.click(within(section()).getByRole('button', { name: /^Shopping, 10\.0%/ }))
    expect(onPick).toHaveBeenCalledWith(3)
    // Food & Dining is 60% of the month, so the sentence says more than half.
    expect(within(section()).getByText('More than half of it went on Food & Dining.')).toBeInTheDocument()
  })

  it('goes back to the bubbles', () => {
    mount()
    fireEvent.click(within(choice()).getByRole('button', { name: 'List' }))
    fireEvent.click(within(choice()).getByRole('button', { name: 'Bubbles' }))
    expect(bubbles()).not.toBeNull()
  })

  it('keeps the intro that says to tap a category', () => {
    mount()
    expect(within(section()).getByText(/Tap one to see those expenses/)).toBeInTheDocument()
  })

  it('never prints a broken number', () => {
    mount()
    expect(section().textContent).not.toMatch(/NaN|undefined|Infinity/)
  })
})
