// @vitest-environment jsdom
import './test/dom'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { reloadDisplay } from './data/display'
import { localDateString } from './db/money'
import { db } from './db/schema'
import { APP_VERSION } from './pwa/version'
import { resetLockForTests } from './security/lock'
import { backDepth } from './ui/backStack'

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }))

beforeEach(() => {
  reloadDisplay()
  resetLockForTests()
})

async function open() {
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
  await screen.findByText('Recent transactions')
  return user
}

const mainNav = () => within(screen.getByRole('navigation', { name: 'Main' }))
const pressBack = () =>
  act(async () => {
    history.back()
    await new Promise((r) => setTimeout(r, 30))
  })

describe('AI insights: the ways in', () => {
  it('opens from the top of Insights, and closes from its button', async () => {
    const user = await open()
    await user.click(mainNav().getByRole('button', { name: 'Insights' }))
    await user.click(await screen.findByRole('button', { name: /^AI insights/ }))
    const sheet = await screen.findByRole('dialog', { name: 'AI insights' })
    expect(await within(sheet).findByText('Where the money went')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'AI insights' })).toBeNull())
  })

  it('opens from the insight card on Home', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'AI summary' }))
    const sheet = await screen.findByRole('dialog', { name: 'AI insights' })
    expect(within(sheet).getByText(/You have spent ₹450 in/)).toBeInTheDocument()
  })

  it('is closed by the phone back button, and leaves you where you were', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'AI summary' }))
    await screen.findByRole('dialog', { name: 'AI insights' })
    await pressBack()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'AI insights' })).toBeNull())
    expect(mainNav().getByRole('button', { current: 'page' })).toHaveAccessibleName('Home')
    expect(backDepth()).toBe(0)
  })

  it('does not appear on Insights before anything has been spent', async () => {
    await db.settings.bulkPut([
      { key: 'onboarded', value: true },
      { key: 'lastSeenVersion', value: APP_VERSION },
    ])
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Let’s add your first one.')
    await user.click(mainNav().getByRole('button', { name: 'Insights' }))
    await screen.findByText(/Nothing to report/)
    expect(screen.queryByRole('button', { name: /^AI insights/ })).toBeNull()
  })
})
