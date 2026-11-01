// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { makeLedger } from '../test/ledger'
import { Insights } from './Insights'

const today = new Date(2026, 9, 28) // Wed 28 Oct 2026

const categories: Category[] = [{ id: 1, name: 'Food & Dining', color: 'var(--s1)' }]

let id = 0
const tx = (merchant: string, date: string, rupees: number, place?: { lat: number; lon: number }): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId: 1, merchant, note: '',
  date, paymentMethod: '', source: 'manual', createdAt: id,
  ...(place ? { location: { ...place, accuracyM: 20 } } : {}),
})

function mount(txs: Transaction[], month = '2026-10') {
  const onOpenSettings = vi.fn()
  const ledger = makeLedger({
    txs,
    expenses: txs,
    income: [],
    categories,
    expenseCategories: categories,
    categoryById: new Map(categories.map((c) => [c.id, c])),
    budgetMinor: null,
  })
  render(<Insights ledger={ledger} month={month} onMonth={() => {}} today={today} onOpenSettings={onOpenSettings} />)
  return onOpenSettings
}

const cafe = { lat: 12.9716, lon: 77.5946 }
const section = () => screen.getByRole('region', { name: 'Where you spent' })

beforeEach(() => sessionStorage.clear())

describe('Insights: Where you spent', () => {
  it('has a section at the bottom with the places the month was spent at', () => {
    mount([tx('Cafe', '2026-10-02', 120, cafe), tx('Cafe', '2026-10-09', 150, cafe), tx('Uber', '2026-10-10', 230, { lat: 13.2, lon: 77.7 })])
    const list = within(section()).getByRole('list', { name: 'Places in October' })
    expect(list).toHaveTextContent('Cafe')
    expect(list).toHaveTextContent('2 times')
    expect(list).toHaveTextContent('₹270')
    expect(within(section()).getByRole('button', { name: 'Show map' })).toBeInTheDocument()
  })

  it('comes after everything else on the screen', () => {
    mount([tx('Cafe', '2026-10-02', 120, cafe)])
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings.at(-1)).toBe('Where you spent')
  })

  it('does not load a map, or anything from OpenStreetMap, until asked', () => {
    mount([tx('Cafe', '2026-10-02', 120, cafe)])
    expect(document.querySelector('.leaflet-container')).toBeNull()
    expect(document.querySelector('img[src*="openstreetmap"]')).toBeNull()
  })

  it('says so when the month has nothing recorded but other months do', () => {
    mount([tx('Cafe', '2026-10-02', 120), tx('Cafe', '2026-09-02', 120, cafe)])
    expect(within(section()).getByText('No places were recorded in October.')).toBeInTheDocument()
    expect(within(section()).queryByRole('button', { name: 'Show map' })).toBeNull()
  })

  it('explains how to get places when none has ever been recorded, and opens Settings from there', () => {
    const onOpenSettings = mount([tx('Cafe', '2026-10-02', 120)])
    expect(within(section()).getByText(/Save where I add transactions/)).toBeInTheDocument()
    fireEvent.click(within(section()).getByRole('button', { name: 'Open settings' }))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('is not there when there is nothing to report at all', () => {
    mount([])
    expect(screen.queryByRole('region', { name: 'Where you spent' })).toBeNull()
  })
})
