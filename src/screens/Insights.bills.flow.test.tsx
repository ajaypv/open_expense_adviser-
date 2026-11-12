// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { makeLedger } from '../test/ledger'
import { Insights } from './Insights'

const today = new Date(2026, 9, 28)
const categories: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Bills & Utilities', color: 'var(--s5)' },
]

let id = 0
const tx = (merchant: string, rupees: number, categoryId = 2): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId, merchant, note: '', date: '2026-10-05',
  paymentMethod: '', source: 'manual', createdAt: id,
})

function mount(txs: Transaction[], onPickCategory?: (id: number) => void) {
  const ledger = makeLedger({
    txs, expenses: txs, income: [], categories, expenseCategories: categories,
    categoryById: new Map(categories.map((c) => [c.id, c])), recurring: [],
  })
  render(<Insights ledger={ledger} month="2026-10" onMonth={() => {}} today={today} onOpenSettings={() => {}} onPickCategory={onPickCategory} />)
  // Where it went opens on the flow; these look at the bubbles.
  fireEvent.click(screen.getByRole('button', { name: 'Bubbles' }))
}

const section = () => screen.getByRole('region', { name: 'Bills, recharges and EMIs' })

describe('Insights: Bills, recharges and EMIs', () => {
  const txs = () => [tx('Home loan EMI', 12_000), tx('Jio recharge', 300), tx('Airtel recharge', 200), tx('BESCOM', 1_500), tx('Swiggy', 6_000, 1)]

  it('says what went on bills and what share of the month it was', () => {
    mount(txs())
    expect(screen.getByTestId('bill-total')).toHaveTextContent('₹14,000 went on bills, recharges and EMIs in October, 70.0% of everything you spent.')
  })

  it('lists each part with its share of the bills, its amount and its payments', () => {
    mount(txs())
    const list = within(section()).getByRole('list', { name: 'Bills, recharges and EMIs, by part' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual(['emi', 'utilities', 'recharge'])
    expect(rows[0]).toHaveAccessibleName('EMIs and loans, 85.7% of your bills, ₹12,000, 1 payment')
    expect(rows[2]).toHaveAccessibleName('Mobile and DTH recharges, 3.6% of your bills, ₹500, 2 payments')
    expect(rows[2]).toHaveTextContent('2 payments, 2.5% of the month')
  })

  it('gives each part its own icon', () => {
    mount(txs())
    const icons = [...section().querySelectorAll('li[data-kind] svg path')].map((p) => p.getAttribute('d'))
    expect(new Set(icons).size).toBe(3)
  })

  it('draws a bar cut into the parts, described in words', () => {
    mount(txs())
    expect(within(section()).getByRole('img')).toHaveAccessibleName('EMIs and loans 85.7%, Electricity, water, gas and internet 10.7%, Mobile and DTH recharges 3.6%')
    expect(section().querySelectorAll('[data-part]')).toHaveLength(3)
  })

  it('names the biggest part', () => {
    mount(txs())
    expect(section()).toHaveTextContent('EMIs and loans was the biggest part: 85.7% of it.')
  })

  it('is not there when nothing went on bills', () => {
    mount([tx('Swiggy', 400, 1)])
    expect(screen.queryByRole('region', { name: 'Bills, recharges and EMIs' })).toBeNull()
  })
})

describe('Insights: bills divided inside the category charts', () => {
  const txs = () => [tx('Home loan EMI', 12_000), tx('Jio recharge', 300), tx('Airtel recharge', 200), tx('BESCOM', 1_500), tx('Swiggy', 6_000, 1)]
  const bubbles = () => within(screen.getByRole('list', { name: 'Spending by category, bubbles sized by share' })).getAllByRole('listitem')

  it('shows the bubbles as EMIs, Recharges and Utilities, not one Bills and utilities bubble', () => {
    mount(txs())
    expect(bubbles().map((b) => b.getAttribute('aria-label'))).toEqual([
      'EMIs, 60.0%, ₹12,000',
      'Food & Dining, 30.0%, ₹6,000',
      'Utilities, 7.5%, ₹1,500',
      'Recharges, 2.5%, ₹500',
    ])
  })

  it('gives each part its own icon in its bubble', () => {
    mount(txs())
    const icons = bubbles().map((b) => b.querySelector('[data-icon]')?.getAttribute('data-icon'))
    expect(icons).toEqual(['emi', 'utensils', 'bolt', 'recharge'])
  })

  it('divides the donut the same way, and its legend with it', () => {
    mount(txs())
    fireEvent.click(screen.getByRole('button', { name: 'Donut' }))
    const legend = within(screen.getByRole('list', { name: 'Spending by category' })).getAllByRole('listitem')
    expect(legend.map((l) => l.textContent)).toEqual([
      expect.stringContaining('EMIs'),
      expect.stringContaining('Food & Dining'),
      expect.stringContaining('Utilities'),
      expect.stringContaining('Recharges'),
    ])
    expect(legend[0]).toHaveTextContent('60.0%')
    expect(document.querySelectorAll('[data-segment]')).toHaveLength(4)
  })

  it('divides the list view the same way', () => {
    mount(txs())
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    const section = screen.getByRole('region', { name: 'Where it went' })
    for (const name of ['EMIs', 'Recharges', 'Utilities', 'Food & Dining']) expect(section).toHaveTextContent(name)
    expect(section).not.toHaveTextContent('Bills & Utilities')
  })

  it('says bills are divided, in the line under the heading', () => {
    mount(txs())
    expect(screen.getByRole('region', { name: 'Where it went' })).toHaveTextContent('Bills are divided into what they were for.')
  })

  it('opens the category most of a part was filed under when it is tapped', () => {
    const onPick = vi.fn()
    mount(txs(), onPick)
    fireEvent.click(screen.getByRole('button', { name: /^EMIs, 60.0%/ }))
    expect(onPick).toHaveBeenCalledWith(2)
  })

  it('leaves Bills and utilities as one when there is only one thing in it', () => {
    mount([tx('BESCOM', 1_500), tx('Swiggy', 400, 1)])
    expect(bubbles().map((b) => b.getAttribute('aria-label')?.split(',')[0])).toEqual(['Bills & Utilities', 'Food & Dining'])
    expect(screen.getByRole('region', { name: 'Where it went' })).not.toHaveTextContent('Bills are divided')
  })
})
