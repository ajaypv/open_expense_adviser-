// @vitest-environment jsdom
import '../test/dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { useLedger } from '../data/useLedger'
import { localDateString } from '../db/money'
import { db } from '../db/schema'
import { monthLabel, shiftMonth } from '../insights/aggregates'
import { ToastProvider } from '../ui/toast'
import { Activity } from './Activity'

function Screen() {
  const ledger = useLedger()
  const [category, setCategory] = useState<number | null>(null)
  return <Activity ledger={ledger} today={new Date()} categoryFilter={category} onCategoryFilter={setCategory} initialRange={null} onEdit={() => {}} />
}
const mount = () =>
  render(
    <ToastProvider>
      <Screen />
    </ToastProvider>,
  )

const thisMonth = localDateString(new Date()).slice(0, 7)
const lastMonth = shiftMonth(thisMonth, -1)
let seq = 0
const tx = (kind: 'expense' | 'income', amount: number, date: string, merchant = kind === 'income' ? 'Employer' : 'Shop') =>
  db.transactions.add({
    kind, amountMinor: amount * 100, currency: 'INR', categoryId: 1, merchant, note: '', date,
    paymentMethod: '', source: 'manual', createdAt: Date.now() + ++seq,
  } as never)

async function seed() {
  await tx('income', 10_000, `${lastMonth}-01`)
  await tx('expense', 4_000, `${lastMonth}-05`, 'Old shop')
  await tx('income', 2_000, localDateString(new Date()))
  await tx('expense', 1_500, localDateString(new Date()), 'New shop')
}
const panel = () => document.querySelector('[data-month-money]') as HTMLElement
const row = (key: string) => panel().querySelector(`[data-row="${key}"]`) as HTMLElement
const month = () => screen.findByRole('radio', { name: 'Month' })

describe('Activity: month view', () => {
  it('is one of two views beside each other, with the list of transactions the one it opens on', async () => {
    await seed()
    mount()
    const list = await screen.findByRole('radio', { name: 'Transactions' })
    expect(list).toBeChecked()
    expect(await month()).not.toBeChecked()
    expect(document.querySelector('[data-month-money]')).toBeNull()
    // The list is as it always was: every transaction, and the quick dates.
    expect(screen.getByText('Old shop')).toBeInTheDocument()
    expect(screen.getByText('New shop')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Filter by date' })).toBeInTheDocument()
  })

  it('shows this month as carried forward, received and spent, with what is left so far, above the same list narrowed to the month', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.click(await month())
    expect(await month()).toBeChecked()
    expect(within(panel()).getByText(monthLabel(thisMonth))).toBeInTheDocument()
    expect(within(panel()).getByText('Left so far')).toBeInTheDocument()
    expect(row('carried').textContent).toMatch(/Carried from .*₹6,000/)
    expect(row('received').textContent).toContain('₹2,000')
    expect(row('spent').textContent).toContain('₹1,500')
    expect(panel().textContent).toContain('₹6,500')
    // The list below is this month's only.
    expect(screen.getByText('New shop')).toBeInTheDocument()
    expect(screen.queryByText('Old shop')).toBeNull()
  })

  it('steps back to last month, which started with nothing carried and ends with ₹6,000 to carry on, and its list follows', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.click(await month())
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(within(panel()).getByText(monthLabel(lastMonth))).toBeInTheDocument()
    expect(panel().querySelector('[data-row="carried"]')).toBeNull()
    expect(row('received').textContent).toContain('₹10,000')
    expect(row('spent').textContent).toContain('₹4,000')
    expect(within(panel()).getByText('Left at the end of the month')).toBeInTheDocument()
    expect(within(panel()).getByText('₹6,000 carries on to next month.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
    expect(screen.getByText('Old shop')).toBeInTheDocument()
    expect(screen.queryByText('New shop')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(within(panel()).getByText(monthLabel(thisMonth))).toBeInTheDocument()
  })

  it('leaves the quick dates out while a month is shown, and brings the list back exactly as it was', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Last month' }))
    expect(screen.getByText('Old shop')).toBeInTheDocument()
    expect(screen.queryByText('New shop')).toBeNull()
    await user.click(await month())
    expect(screen.queryByRole('group', { name: 'Filter by date' })).toBeNull()
    // This month's list, whatever the dates chosen before.
    expect(screen.getByText('New shop')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Transactions' }))
    expect(document.querySelector('[data-month-money]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Last month' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Old shop')).toBeInTheDocument()
    expect(screen.queryByText('New shop')).toBeNull()
  })

  it('is not offered when there is nothing logged', async () => {
    mount()
    await screen.findByText('Nothing here yet. Type something like “450 lunch at Cafe” in the bar below.')
    expect(screen.queryByRole('radio', { name: 'Month' })).toBeNull()
  })
})
