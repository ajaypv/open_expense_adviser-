// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { makeLedger } from '../test/ledger'
import { Insights } from './Insights'

const today = new Date(2026, 9, 28) // Wed 28 Oct 2026

const categories: Category[] = [{ id: 1, name: 'Food & Dining', color: 'var(--s1)' }]

let id = 0
const tx = (date: string, amount: number): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: amount * 100, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '',
  date, paymentMethod: '', source: 'manual', createdAt: id,
})

function mount(txs: Transaction[], month = '2026-10') {
  const onMonth = vi.fn()
  const ledger = makeLedger({
    txs,
    expenses: txs,
    income: [],
    categories,
    expenseCategories: categories,
    categoryById: new Map(categories.map((c) => [c.id, c])),
    budgetMinor: null,
  })
  render(<Insights ledger={ledger} month={month} onMonth={onMonth} today={today} onOpenSettings={() => {}} />)
  return onMonth
}

const strip = () => screen.getByRole('group', { name: 'Choose the month to look at' })
const compare = () => screen.queryByRole('group', { name: 'Months to compare with' })

// Spending in four months, so every month has an earlier one to compare with.
const fourMonths = [tx('2026-07-10', 1000), tx('2026-08-10', 2000), tx('2026-09-10', 3000), tx('2026-10-10', 4000)]

describe('Insights: scrolling through months in the spending pace', () => {
  it('has a scrollable strip with every month from the first one with spending to this month', () => {
    mount(fourMonths)
    const chips = within(strip()).getAllByRole('button')
    expect(chips.map((c) => c.textContent)).toEqual([
      expect.stringContaining('Jul'), expect.stringContaining('Aug'), expect.stringContaining('Sep'), expect.stringContaining('Oct'),
    ])
    expect(chips[3]).toHaveAttribute('aria-pressed', 'true')
    expect(chips[3]).toHaveTextContent('₹4K')
  })

  it('shows a quiet month in between as a month, with nothing spent', () => {
    mount([tx('2026-07-10', 1000), tx('2026-10-10', 4000)])
    expect(within(strip()).getAllByRole('button')).toHaveLength(4)
    expect(within(strip()).getByRole('button', { name: /August 2026.*nothing spent/ })).toBeInTheDocument()
  })

  it('moves the whole screen to the month that is tapped', () => {
    const onMonth = mount(fourMonths)
    fireEvent.click(within(strip()).getByRole('button', { name: /September 2026/ }))
    expect(onMonth).toHaveBeenCalledWith('2026-09')
  })

  it('marks the month in view, and keeps showing the later months when looking back', () => {
    mount(fourMonths, '2026-08')
    const chips = within(strip()).getAllByRole('button')
    expect(chips).toHaveLength(4) // still through this month, so there is a way forward
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false'])
  })
})

describe('Insights: comparing several months in the spending pace', () => {
  it('offers the last three months when three earlier months have spending', () => {
    mount(fourMonths)
    expect(within(compare()!).getByRole('button', { name: 'Last 3 months' })).toBeInTheDocument()
  })

  it('offers two when only two earlier months have spending', () => {
    mount(fourMonths.slice(1))
    expect(within(compare()!).getByRole('button', { name: 'Last 2 months' })).toBeInTheDocument()
  })

  it('offers nothing when only last month has spending', () => {
    mount(fourMonths.slice(2))
    expect(compare()).toBeNull()
  })

  it('stops at a month with no spending, so "last 3 months" never has a hole in it', () => {
    mount([tx('2026-07-10', 1000), tx('2026-09-10', 3000), tx('2026-10-10', 4000)]) // nothing in August
    expect(compare()).toBeNull()
  })

  it('draws the older months when asked, and names them in the legend', () => {
    mount(fourMonths)
    fireEvent.click(within(compare()!).getByRole('button', { name: 'Last 3 months' }))
    const legend = within(screen.getByRole('region', { name: 'Spending pace' })).getByRole('list')
    expect(legend).toHaveTextContent('September (whole month)₹3,000')
    expect(legend).toHaveTextContent('August (whole month)₹2,000')
    expect(legend).toHaveTextContent('July (whole month)₹1,000')
  })
})
