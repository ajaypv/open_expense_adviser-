// @vitest-environment jsdom
import '../test/dom'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Category, Recurring } from '../db/schema'
import { makeLedger } from '../test/ledger'
import { BillsCalendar } from './BillsCalendar'

afterEach(cleanup)

const today = new Date(2026, 10, 15) // Sun 15 Nov 2026
const categories: Category[] = [{ id: 1, name: 'Bills', color: 'var(--s1)' }]
let id = 0
const rule = (over: Partial<Recurring>): Recurring => ({
  id: ++id, kind: 'expense', amountMinor: 100_000, currency: 'INR', categoryId: 1, merchant: 'Thing', note: '', paymentMethod: '',
  frequency: 'monthly', nextDue: '2026-11-20', active: true, ...over,
})
const netflix = rule({ merchant: 'Netflix', tag: 'subscription', amountMinor: 64_900, nextDue: '2026-11-20' })
const rent = rule({ merchant: 'Rent', tag: 'bill', amountMinor: 600_000, nextDue: '2026-11-30' })
const gym = rule({ merchant: 'Gym', tag: 'bill', amountMinor: 200_000, nextDue: '2026-11-30' })
const water = rule({ merchant: 'Water', tag: 'bill', amountMinor: 30_000, nextDue: '2026-11-22' })
const power = rule({ merchant: 'Electricity', tag: 'bill', amountMinor: 90_000, nextDue: '2026-11-08' })
const paidTx = (over: Record<string, unknown> = {}) => ({ id: ++id, kind: 'expense', amountMinor: 500_000, currency: 'INR', categoryId: 1, merchant: 'Insurance', note: '', date: '2026-11-03', paymentMethod: '', source: 'recurring', createdAt: id, ...over })

function mount(rules: Recurring[], expenses: unknown[] = []) {
  const ledger = makeLedger({
    categories, expenseCategories: categories, categoryById: new Map(categories.map((c) => [c.id, c])),
    recurring: rules, expenses: expenses as never,
  })
  const onEdit = vi.fn()
  render(<BillsCalendar ledger={ledger} today={today} onEdit={onEdit} />)
  return { onEdit }
}
const day = (date: string) => document.querySelector(`[data-day="${date}"]`) as HTMLElement
const list = () => document.querySelectorAll('li[data-bill]')

describe('Bills calendar', () => {
  it('says what it is for, and shows no calendar, when there is nothing regular yet', () => {
    mount([])
    expect(screen.getByText('Nothing regular yet')).toBeInTheDocument()
    expect(document.querySelector('[data-grid]')).toBeNull()
  })

  it('shows the month as six weeks, with the month in words and today ringed', () => {
    mount([netflix])
    expect(screen.getByTestId('bills-month')).toHaveTextContent('November 2026')
    expect(document.querySelectorAll('[data-grid] > *')).toHaveLength(42)
    expect(day('2026-11-15').firstElementChild!.className).toContain('inset_0_0_0_1.5px_var(--ink)')
    expect(day('2026-11-14').firstElementChild!.className).not.toContain('inset_0_0_0_1.5px_var(--ink)')
  })

  it('marks a day with one payment by its icon and one dot, and a day with several by its number and a dot each', () => {
    mount([water, rent, gym])
    const one = day('2026-11-22')
    expect(one.tagName).toBe('BUTTON')
    expect(one.querySelector('[data-icon]')).toBeInTheDocument()
    expect(one.querySelectorAll('[data-dot]')).toHaveLength(1)
    const many = day('2026-11-30')
    expect(many.querySelector('[data-icon]')).toBeNull()
    expect(many).toHaveTextContent('30')
    expect(many.querySelectorAll('[data-dot]')).toHaveLength(2)
  })

  it('shows a well-known service by its own tile when it is the only payment that day', () => {
    mount([netflix, water])
    expect(day('2026-11-20').querySelector('[data-brand="netflix"]')).toBeInTheDocument()
    expect(day('2026-11-20').querySelector('[data-icon]')).toBeNull()
    expect(day('2026-11-22').querySelector('[data-brand]')).toBeNull()
  })

  it('shows its tile on the row too', () => {
    mount([netflix])
    expect(document.querySelector('li[data-bill] [data-brand="netflix"]')).toBeInTheDocument()
  })

  it('colours the dots by how the payment stands: to come, late, paid', () => {
    mount([netflix, power], [paidTx()])
    expect(day('2026-11-20').querySelector('[data-dot]')).toHaveAttribute('data-dot', 'upcoming')
    expect(day('2026-11-08').querySelector('[data-dot]')).toHaveAttribute('data-dot', 'late')
    expect(day('2026-11-03').querySelector('[data-dot]')).toHaveAttribute('data-dot', 'paid')
    const key = screen.getByRole('list', { name: 'November 2026 at a glance' })
    expect(key).toHaveTextContent('1 upcoming')
    expect(key).toHaveTextContent('1 overdue')
    expect(key).toHaveTextContent('1 paid')
  })

  it('says each day in words for a screen reader', () => {
    mount([rent, gym])
    expect(screen.getByRole('button', { name: /^Monday.*30.*: Gym, upcoming; Rent, upcoming$/ })).toBeInTheDocument()
  })

  it('opens on Overdue when something is late, and on Upcoming when nothing is', () => {
    mount([netflix, power])
    expect(screen.getByRole('radio', { name: 'Overdue' })).toBeChecked()
    expect(within(screen.getByRole('list', { name: /1 payment, overdue/ })).getByText('Electricity')).toBeInTheDocument()
    cleanup()
    mount([netflix])
    expect(screen.getByRole('radio', { name: 'Upcoming' })).toBeChecked()
    expect(screen.getByText('Netflix')).toBeInTheDocument()
  })

  it('switches between Upcoming, Overdue and Paid', async () => {
    mount([netflix, rent, power], [paidTx()])
    await userEvent.click(screen.getByRole('radio', { name: 'Upcoming' }))
    expect(Array.from(list()).map((l) => l.textContent)).toEqual([expect.stringContaining('Netflix'), expect.stringContaining('Rent')])
    await userEvent.click(screen.getByRole('radio', { name: 'Paid' }))
    expect(list()).toHaveLength(1)
    expect(list()[0]).toHaveTextContent('Insurance')
    expect(list()[0]).toHaveTextContent('Paid')
  })

  it('says it plainly when a switch has nothing in it', async () => {
    mount([netflix])
    await userEvent.click(screen.getByRole('radio', { name: 'Overdue' }))
    expect(screen.getByText('Nothing is overdue.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Paid' }))
    expect(screen.getByText('Nothing has been paid from a regular payment in November yet.')).toBeInTheDocument()
  })

  it('shows what falls on a day when it is pressed, and the whole month again from the button', async () => {
    mount([netflix, rent, gym])
    await userEvent.click(day('2026-11-30'))
    expect(day('2026-11-30')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/^Monday.*30/, { selector: 'p' })).toBeInTheDocument()
    expect(list()).toHaveLength(2)
    expect(screen.queryByText('Netflix')).toBeNull()
    expect(screen.getByRole('radio', { name: 'Upcoming' })).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'All of November' }))
    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Upcoming' })).toBeChecked()
  })

  it('opens a payment still to come, or late, to change it, but not one already paid', async () => {
    const { onEdit } = mount([netflix, power], [paidTx()])
    await userEvent.click(screen.getByRole('button', { name: /^Electricity, Bill, Overdue by 7 days/ }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ merchant: 'Electricity' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Paid' }))
    expect(screen.queryByRole('button', { name: /^Insurance/ })).toBeNull()
  })

  it('goes back and forward a month, and shows the paid ones of a month gone', async () => {
    mount([netflix], [paidTx({ date: '2026-10-12', merchant: 'Insurance' })])
    await userEvent.click(screen.getByRole('button', { name: 'The month before' }))
    expect(screen.getByTestId('bills-month')).toHaveTextContent('October 2026')
    expect(day('2026-10-12').querySelector('[data-dot]')).toHaveAttribute('data-dot', 'paid')
    // It can go no further back than the first payment there is.
    expect(screen.getByRole('button', { name: 'The month before' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'The month after' }))
    await userEvent.click(screen.getByRole('button', { name: 'The month after' }))
    expect(screen.getByTestId('bills-month')).toHaveTextContent('December 2026')
    // A monthly payment comes round again in the months ahead.
    expect(day('2026-12-20').querySelector('[data-dot]')).toHaveAttribute('data-dot', 'upcoming')
  })

  it('goes no more than a year ahead', async () => {
    mount([netflix])
    for (let i = 0; i < 12; i++) await userEvent.click(screen.getByRole('button', { name: 'The month after' }))
    expect(screen.getByTestId('bills-month')).toHaveTextContent('November 2027')
    expect(screen.getByRole('button', { name: 'The month after' })).toBeDisabled()
  })

  it('does not change a payment that is late when looking at another month', async () => {
    mount([netflix, power])
    await userEvent.click(screen.getByRole('button', { name: 'The month after' }))
    // Overdue is every late payment, whichever month is in view.
    expect(screen.getByRole('radio', { name: 'Overdue' })).toBeChecked()
    expect(screen.getByText('Electricity')).toBeInTheDocument()
  })
})
