// @vitest-environment jsdom
import './test/dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { reloadDisplay } from './data/display'
import { localDateString } from './db/money'
import { db } from './db/schema'
import { APP_VERSION } from './pwa/version'
import { resetLockForTests } from './security/lock'

// The service-worker helper only exists in a real build.
vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }))

beforeEach(() => {
  reloadDisplay()
  resetLockForTests()
})

const open = async () => {
  await db.settings.bulkPut([
    { key: 'onboarded', value: true },
    { key: 'lastSeenVersion', value: APP_VERSION },
  ])
  await db.transactions.add({
    kind: 'expense', amountMinor: 45_000, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '', date: localDateString(),
    paymentMethod: '', source: 'manual', createdAt: Date.now(),
  } as never)
  const user = userEvent.setup()
  render(<App />)
  return user
}

describe('The budget invitation on Home', () => {
  it('sits below the cash flow, and leads to Settings', async () => {
    const user = await open()
    const prompt = await screen.findByRole('region', { name: 'Budget' })
    const cash = screen.getByRole('region', { name: 'Money received and your balance' })
    expect(cash.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Summary' })).queryByText(/Set a monthly budget/)).toBeNull()
    await user.click(within(prompt).getByRole('button', { name: 'Set budget' }))
    // Settings is open, on the Money page.
    expect(await screen.findByRole('heading', { name: 'Money' })).toBeInTheDocument()
  })

  it('goes away once a budget has been set', async () => {
    await db.budgets.add({ categoryId: null, monthlyLimitMinor: 3_000_000, currency: 'INR' } as never)
    await open()
    await screen.findByRole('region', { name: 'Summary' })
    expect(screen.queryByRole('region', { name: 'Budget' })).toBeNull()
    expect(screen.getByRole('meter', { name: 'Monthly budget used' })).toBeInTheDocument()
  })
})
