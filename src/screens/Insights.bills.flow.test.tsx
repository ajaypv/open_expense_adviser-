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
}

const section = () => screen.getByRole('region', { name: 'Bills' })

describe('Insights: Bills', () => {
  // The EMI and the recharge are counted apart (as their own categories, in the chart above); only bills as such are here.
  const txs = () => [tx('Home loan EMI', 12_000), tx('Jio recharge', 300), tx('BESCOM', 1_500), tx('LIC', 500), tx('Society maintenance', 500), tx('Swiggy', 6_000, 1)]

  it('says what went on bills, leaving out EMIs and recharges, and what share of the month it was', () => {
    mount(txs())
    expect(screen.getByTestId('bill-total')).toHaveTextContent('₹2,500 went on bills in October, 12.0% of everything you spent.')
  })

  it('lists each kind of bill with its share of the bills, its amount and its payments', () => {
    mount(txs())
    const list = within(section()).getByRole('list', { name: 'Bills, by part' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual(['utilities', 'insurance', 'bills'])
    expect(rows[0]).toHaveAccessibleName('Electricity, water, gas and internet, 60.0% of your bills, ₹1,500, 1 payment')
    expect(rows[1]).toHaveTextContent('1 payment, 2.4% of the month')
  })

  it('has no EMI or recharge part in it', () => {
    mount(txs())
    expect(section().querySelector('[data-kind="emi"], [data-kind="recharge"]')).toBeNull()
  })

  it('gives each part its own icon', () => {
    mount(txs())
    const icons = [...section().querySelectorAll('li[data-kind] svg path')].map((p) => p.getAttribute('d'))
    expect(new Set(icons).size).toBe(3)
  })

  it('draws a bar cut into the parts, described in words', () => {
    mount(txs())
    expect(within(section()).getByRole('img')).toHaveAccessibleName('Electricity, water, gas and internet 60.0%, Insurance 20.0%, Other bills 20.0%')
    expect(section().querySelectorAll('[data-part]')).toHaveLength(3)
  })

  it('names the biggest part', () => {
    mount(txs())
    expect(section()).toHaveTextContent('Electricity, water, gas and internet was the biggest part: 60.0% of it.')
  })

  it('is not there when nothing but EMIs and recharges was paid', () => {
    mount([tx('Home loan EMI', 12_000), tx('Jio recharge', 300)])
    expect(screen.queryByRole('region', { name: 'Bills' })).toBeNull()
  })

  it('is not there when nothing went on bills', () => {
    mount([tx('Swiggy', 400, 1)])
    expect(screen.queryByRole('region', { name: 'Bills' })).toBeNull()
  })
})
