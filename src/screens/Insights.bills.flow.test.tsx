// @vitest-environment jsdom
import '../test/dom'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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

function mount(txs: Transaction[]) {
  const ledger = makeLedger({
    txs, expenses: txs, income: [], categories, expenseCategories: categories,
    categoryById: new Map(categories.map((c) => [c.id, c])), recurring: [],
  })
  render(<Insights ledger={ledger} month="2026-10" onMonth={() => {}} today={today} onOpenSettings={() => {}} />)
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
