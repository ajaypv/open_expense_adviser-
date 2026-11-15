// @vitest-environment jsdom
import '../test/dom'
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { makeLedger } from '../test/ledger'
import { YearReels } from './YearReels'

afterEach(cleanup)

const today = new Date(2026, 10, 15)
const categories: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Bills & Utilities', color: 'var(--s5)' },
  { id: 3, name: 'Shopping', color: 'var(--s2)' },
]
let id = 0
const tx = (date: string, rupees: number, categoryId = 1, merchant = ''): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId, merchant, note: '', date, paymentMethod: '', source: 'manual', createdAt: id,
})
const full = [
  tx('2026-01-05', 500, 1, 'Swiggy'),
  tx('2026-02-05', 700, 1, 'Swiggy'),
  tx('2026-03-02', 9000, 3, 'Laptop store'),
  tx('2026-02-11', 399, 2, 'Jio recharge'),
  tx('2026-03-11', 399, 2, 'Airtel postpaid'),
  tx('2025-12-10', 2100, 1, 'Dinner'),
]

function ledgerOf(expenses: Transaction[], income: Transaction[] = []) {
  return makeLedger({ categories, expenseCategories: categories, categoryById: new Map(categories.map((c) => [c.id, c])), expenses, income })
}
function mount(expenses: Transaction[] = full, income: Transaction[] = []) {
  const onClose = vi.fn()
  render(<YearReels open ledger={ledgerOf(expenses, income)} today={today} onClose={onClose} />)
  return { onClose }
}
const tile = (id: string) => document.querySelector(`[data-reel="${id}"]`) as HTMLElement
const ids = () => [...document.querySelectorAll('[data-reel]')].map((t) => (t as HTMLElement).dataset.reel)

describe('Year reels', () => {
  it('is a page of full-screen tiles, in order, that snap one at a time as they are scrolled', () => {
    mount()
    expect(ids()).toEqual(['start', 'category', 'phone', 'months', 'biggest', 'favourite', 'weekday', 'bills', 'end'])
    const scroller = screen.getByRole('region', { name: /one tile at a time/ })
    expect(scroller).toHaveClass('snap-y', 'snap-mandatory', 'overflow-y-auto')
    for (const t of document.querySelectorAll('[data-reel]')) expect(t).toHaveClass('h-dvh', 'snap-start', 'snap-always')
  })

  it('starts with the year and what it came to, and says what the tile is for', () => {
    mount()
    const t = within(tile('start'))
    expect(t.getByRole('heading', { name: '2026, in spending' })).toBeInTheDocument()
    expect(tile('start')).toHaveTextContent('₹10,998') // 500 + 700 + 9000 + 399 + 399: this year only, not last December
    expect(tile('start')).toHaveTextContent('5 expenses')
  })

  it('says which category took the biggest bite, with its share and the biggest five', () => {
    mount()
    const t = tile('category')
    expect(within(t).getByRole('heading', { name: 'Shopping took the biggest bite.' })).toBeInTheDocument()
    expect(t).toHaveTextContent('₹9,000')
    expect(t).toHaveTextContent(/\d+%\s*of everything you spent this year/)
    expect(within(t).getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringContaining('Shopping'), expect.stringContaining('Food & Dining'), expect.stringContaining('Bills & Utilities')])
  })

  it('tells what went on phone bills, with how many payments and what a month came to', () => {
    mount()
    const t = tile('phone')
    expect(within(t).getByRole('heading', { name: 'Staying connected cost you' })).toBeInTheDocument()
    expect(t).toHaveTextContent('₹798')
    expect(t).toHaveTextContent('2 payments on recharges and phone bills')
    expect(t).toHaveTextContent('₹399')
  })

  it('leaves the phone tile out when nothing went on phone bills', () => {
    mount([tx('2026-01-05', 500, 1, 'Swiggy'), tx('2026-02-05', 500, 1, 'Swiggy')])
    expect(ids()).not.toContain('phone')
    expect(ids()).toContain('category')
  })

  it('shows the heaviest month with all twelve as columns, the biggest buy and the favourite place', () => {
    mount()
    expect(within(tile('months')).getByRole('heading', { name: 'March was the heaviest.' })).toBeInTheDocument()
    expect(within(tile('months')).getByRole('img', { name: /Spending each month: January/ })).toBeInTheDocument()
    expect(tile('months').querySelectorAll('.reel-col')).toHaveLength(12)
    expect(tile('biggest')).toHaveTextContent('₹9,000')
    expect(tile('biggest')).toHaveTextContent('Laptop store')
    expect(within(tile('favourite')).getByRole('heading', { name: 'Swiggy, again and again.' })).toBeInTheDocument()
    expect(tile('favourite')).toHaveTextContent('2×')
  })

  it('says what the bills came to, part by part', () => {
    mount()
    const items = within(tile('bills')).getAllByRole('listitem').map((li) => li.textContent)
    expect(items.some((t) => t?.includes('Mobile and DTH recharges'))).toBe(true)
  })

  it('ends by saying what came in against what went out, when something came in, and can be watched again', async () => {
    mount(full, [{ ...tx('2026-01-31', 50_000), kind: 'income', merchant: 'Salary' } as Transaction])
    const t = tile('end')
    expect(within(t).getByRole('heading', { name: 'And the year is not over.' })).toBeInTheDocument()
    expect(t).toHaveTextContent('You received ₹50,000')
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView as never
    await userEvent.click(within(t).getByRole('button', { name: 'Watch again' }))
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('has a row of marks, one for each tile, and says how far through it is', () => {
    mount()
    const bar = screen.getByRole('progressbar', { name: 'How far through your year' })
    expect(bar).toHaveAttribute('aria-valuemax', '9')
    expect(bar).toHaveAttribute('aria-valuenow', '1')
    expect(bar.querySelectorAll('[data-mark]')).toHaveLength(9)
  })

  it('moves to the next tile from the arrow on each, and has none on the last', () => {
    mount()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView as never
    fireEvent.click(within(tile('start')).getByRole('button', { name: 'Next' }))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(within(tile('end')).queryByRole('button', { name: 'Next' })).toBeNull()
  })

  it('changes year when there is more than one with spending, and starts again at the first tile', async () => {
    mount()
    const pick = screen.getByRole('combobox', { name: 'Year' })
    expect(pick).toHaveValue('2026')
    await userEvent.selectOptions(pick, '2025')
    expect(within(tile('start')).getByRole('heading', { name: '2025, in spending' })).toBeInTheDocument()
    expect(within(tile('end')).getByRole('heading', { name: 'That was your year.' })).toBeInTheDocument()
  })

  it('shows the year as a plain label when there is only one', () => {
    mount([tx('2026-01-05', 500, 1, 'Swiggy')])
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('2026')).toBeInTheDocument()
  })

  it('closes from the button at the top', async () => {
    const { onClose } = mount()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('plays each tile only when it is the one in front, and not at all when motion is reduced', () => {
    const css = readFileSync('src/index.css', 'utf8').replace(/\r/g, '')
    expect(css).toMatch(/\.reel\[data-active='true'\] \.reel-in \{[^}]*animation: reel-in/)
    expect(css).toMatch(/\.reel-in \{\s*opacity: 0;/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*?\.reel-in \{\s*opacity: 1;/)
  })
})
