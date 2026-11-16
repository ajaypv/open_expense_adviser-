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

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }))

beforeEach(() => {
  reloadDisplay()
  resetLockForTests()
})

const yesterday = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return localDateString(d)
}

// Cafe was last logged yesterday, so it is suggested now, at ₹450 under the first category.
async function open() {
  await db.settings.bulkPut([
    { key: 'onboarded', value: true },
    { key: 'lastSeenVersion', value: APP_VERSION },
    { key: 'suggestionPlacement', value: 'home' },
  ])
  await db.transactions.add({
    kind: 'expense', amountMinor: 45_000, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '', date: yesterday(),
    paymentMethod: 'UPI', source: 'manual', createdAt: Date.now() - 86_400_000,
  } as never)
  const user = userEvent.setup()
  render(<App />)
  await screen.findByRole('button', { name: /^Add Cafe, ₹450 now/ })
  return user
}

const cafes = async () => (await db.transactions.toArray()).filter((t) => t.merchant === 'Cafe')

describe('Home suggestions: a tap on a chip adds at once', () => {
  it('adds the usual amount for today, with the usual category and way of paying, and no form', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /^Add Cafe, ₹450 now/ }))
    await waitFor(async () => expect(await cafes()).toHaveLength(2))
    const added = (await cafes()).find((t) => t.date === localDateString())!
    expect(added).toMatchObject({ kind: 'expense', amountMinor: 45_000, categoryId: 1, merchant: 'Cafe', paymentMethod: 'UPI', source: 'manual' })
    // No form was opened to do it.
    expect(screen.queryByRole('dialog', { name: /add|edit/i })).toBeNull()
  })

  it('says what was added, with an Undo that takes it away completely', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /^Add Cafe, ₹450 now/ }))
    expect(await screen.findByText('Added Cafe, ₹450')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await cafes()).toHaveLength(1))
    // Gone for good, not waiting in the trash.
    expect((await db.transactions.toArray()).filter((t) => t.deletedAt !== undefined)).toHaveLength(0)
  })

  it('adds it only once however fast it is tapped', async () => {
    const user = await open()
    const plus = screen.getByRole('button', { name: /^Add Cafe, ₹450 now/ })
    await user.dblClick(plus)
    await waitFor(async () => expect(await cafes()).toHaveLength(2))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(await cafes()).toHaveLength(2)
  })
})
