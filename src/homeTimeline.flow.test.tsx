// @vitest-environment jsdom
import './test/dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { reloadDisplay } from './data/display'
import { localDateString } from './db/money'
import { db } from './db/schema'
import { APP_VERSION } from './pwa/version'
import { resetLockForTests } from './security/lock'

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }))

// The app fetches its other screens a moment after it opens; having them in already means that never lands after the test is over.
beforeAll(async () => {
  await Promise.all([import('./screens/Insights'), import('./screens/Settings')])
})

beforeEach(() => {
  reloadDisplay()
  resetLockForTests()
})

const spend = (merchant: string, amountMinor: number, daysAgo: number) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return db.transactions.add({
    kind: 'expense', amountMinor, currency: 'INR', categoryId: 1, merchant, note: '', date: localDateString(d),
    paymentMethod: '', source: 'manual', createdAt: Date.now() + daysAgo,
  } as never)
}

async function open() {
  await db.settings.bulkPut([
    { key: 'onboarded', value: true },
    { key: 'lastSeenVersion', value: APP_VERSION },
  ])
  await spend('Cafe', 45_000, 0)
  await spend('Swiggy', 30_000, 1)
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('Recent transactions')
  return user
}

const view = () => within(screen.getByRole('group', { name: 'Home view' }))

describe('Home: the timeline', () => {
  it('has an Overview and a Timeline tab at the top, on the overview', async () => {
    await open()
    expect(view().getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-pressed', 'true')
    expect(view().getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('list', { name: 'Spending, day by day' })).toBeNull()
  })

  it('shows the days behind you, each with what was spent, when Timeline is pressed', async () => {
    const user = await open()
    await user.click(view().getByRole('button', { name: 'Timeline' }))
    const list = await screen.findByRole('list', { name: 'Spending, day by day' })
    expect(within(list).getByRole('button', { name: 'Today, ₹450, 1 expense' })).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'Yesterday, ₹300, 1 expense' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Last 7 days' })).toHaveTextContent('₹750')
  })

  it('folds the overview away once it has slid out, and brings it back with the other tab', async () => {
    const user = await open()
    await user.click(view().getByRole('button', { name: 'Timeline' }))
    await waitFor(() => expect(document.querySelector('[data-page="overview"]')).toHaveAttribute('inert'))
    await user.click(view().getByRole('button', { name: 'Overview' }))
    await waitFor(() => expect(document.querySelector('[data-page="timeline"]')).toHaveAttribute('inert'))
    expect(document.querySelector('[data-page="overview"]')).not.toHaveAttribute('inert')
  })

  it('opens the day’s expenses in Activity from the button inside a day', async () => {
    const user = await open()
    await user.click(view().getByRole('button', { name: 'Timeline' }))
    await user.click(await screen.findByRole('button', { name: 'Yesterday, ₹300, 1 expense' }))
    await user.click(screen.getByRole('button', { name: 'See yesterday’s expenses' }))
    expect(await screen.findByRole('heading', { name: 'Activity' })).toBeInTheDocument()
  })
})
