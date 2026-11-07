// @vitest-environment jsdom
import './test/dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { reloadDisplay } from './data/display'
import { localDateString } from './db/money'
import { addCreditCard } from './db/repo'
import { db } from './db/schema'
import { APP_VERSION } from './pwa/version'
import { resetLockForTests } from './security/lock'

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }))

beforeEach(() => {
  reloadDisplay()
  resetLockForTests()
})

const tx = (over: Record<string, unknown> = {}) =>
  db.transactions.add({
    kind: 'expense', amountMinor: 45_000, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '', date: localDateString(),
    paymentMethod: '', source: 'manual', createdAt: Date.now() + Math.random(), ...over,
  } as never) as Promise<number>

async function open() {
  await db.settings.bulkPut([
    { key: 'onboarded', value: true },
    { key: 'lastSeenVersion', value: APP_VERSION },
  ])
  const main = (await db.accounts.toArray()).find((a) => a.type === undefined)!
  await db.accounts.update(main.id, { openingMinor: 1_000_000 })
  const card = await addCreditCard('HDFC card', { creditLimitMinor: 500_000, dueDay: 28 }, 100_000)
  await tx({ merchant: 'Cash lunch', amountMinor: 20_000, accountId: main.id })
  await tx({ merchant: 'Croma', amountMinor: 250_000, accountId: card })
  const user = userEvent.setup()
  render(<App />)
  return { user, main, card }
}

describe('Credit cards on Home', () => {
  it('shows what is owed on a card of its own, and opens the cards with the log', async () => {
    const { user } = await open()
    const button = await screen.findByRole('button', { name: /Credit cards: you owe ₹3,500/ })
    await user.click(button)
    const sheet = await screen.findByRole('dialog', { name: 'Credit cards' })
    expect(within(sheet).getByRole('region', { name: 'HDFC card standing' })).toHaveTextContent('₹3,500')
    expect(within(sheet).getByRole('region', { name: 'HDFC card log' })).toHaveTextContent('Croma')
  })

  it('keeps the card out of the balance: spending on it is not taken from the bank', async () => {
    const { user } = await open()
    await user.click(await screen.findByRole('button', { name: 'Show balance' }))
    // 10,000 opening, less the 200 spent from it. The 2,500 on the card is owed, not gone.
    expect(await screen.findByText('₹9,800')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Balance by account' })).toBeNull()
  })

  it('counts a purchase on the card as spending, for the month', async () => {
    await open()
    // 200 from the bank and 2,500 on the card.
    expect(await screen.findByText(/Spent so far in/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('₹2,700').length).toBeGreaterThan(0))
  })

  it('opens an entry from the log to change it, with the cards closed first', async () => {
    const { user } = await open()
    await user.click(await screen.findByRole('button', { name: /Credit cards: you owe/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Credit cards' })
    await user.click(await within(sheet).findByRole('button', { name: /Croma/ }))
    expect(await screen.findByRole('heading', { name: 'Edit transaction' })).toBeInTheDocument()
  })

  it('is not there with no card', async () => {
    await db.settings.bulkPut([
      { key: 'onboarded', value: true },
      { key: 'lastSeenVersion', value: APP_VERSION },
    ])
    await tx()
    render(<App />)
    await screen.findByText(/Spent so far in/)
    expect(screen.queryByRole('button', { name: /Credit cards:/ })).toBeNull()
  })
})
