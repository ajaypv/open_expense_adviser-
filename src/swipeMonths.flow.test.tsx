// @vitest-environment jsdom
import './test/dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { reloadDisplay } from './data/display'
import { localDateString } from './db/money'
import { db } from './db/schema'
import { monthLabel, shiftMonth } from './insights/aggregates'
import { APP_VERSION } from './pwa/version'
import { resetLockForTests } from './security/lock'

// The service-worker helper only exists in a real build.
vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }))

beforeEach(() => {
  reloadDisplay()
  resetLockForTests()
})

const thisMonth = localDateString().slice(0, 7)
const lastMonth = shiftMonth(thisMonth, -1)

const open = async () => {
  await db.settings.bulkPut([
    { key: 'onboarded', value: true },
    { key: 'lastSeenVersion', value: APP_VERSION },
  ])
  const row = (date: string, merchant: string, amountMinor: number) =>
    db.transactions.add({
      kind: 'expense', amountMinor, currency: 'INR', categoryId: 1, merchant, note: '', date,
      paymentMethod: '', source: 'manual', createdAt: Date.now() + Math.random(),
    } as never)
  await row(localDateString(), 'TodayCafe', 45_000)
  await row(`${lastMonth}-15`, 'OldCab', 120_000)
  render(<App />)
  return userEvent.setup()
}

function pointer(type: string, x: number, y: number) {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
  Object.defineProperty(e, 'pointerType', { value: 'touch' })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  return e
}
const swipe = (el: Element, dx: number) => {
  fireEvent(el, pointer('pointerdown', 0, 0))
  fireEvent(el, pointer('pointermove', dx / 2, 2))
  fireEvent(el, pointer('pointermove', dx, 3))
  fireEvent(el, pointer('pointerup', dx, 3))
}
const card = () => screen.getByRole('region', { name: 'Summary' })
const monthButton = (key: string) => screen.getByRole('button', { name: `${monthLabel(key)}. Choose a month` })

describe('Swiping the spending card on Home changes the month', () => {
  it('goes to the previous month on a swipe to the right, and back on a swipe to the left', async () => {
    await open()
    await screen.findByRole('region', { name: 'Summary' })
    expect(monthButton(thisMonth)).toBeInTheDocument()

    swipe(card(), 110)
    await waitFor(() => expect(monthButton(lastMonth)).toBeInTheDocument())
    expect(screen.getByText(`Spent in ${monthLabel(lastMonth).split(' ')[0]}`)).toBeInTheDocument()

    swipe(card(), -110)
    await waitFor(() => expect(monthButton(thisMonth)).toBeInTheDocument())
    expect(screen.getByText(/Spent so far in/)).toBeInTheDocument()
  })

  it('stays on the month in progress when swiping to the left, since there is nothing after it', async () => {
    await open()
    await screen.findByRole('region', { name: 'Summary' })
    swipe(card(), -110)
    await new Promise((r) => setTimeout(r, 40))
    expect(monthButton(thisMonth)).toBeInTheDocument()
  })

  it('can keep going back, one month for each swipe', async () => {
    await open()
    await screen.findByRole('region', { name: 'Summary' })
    swipe(card(), 110)
    await waitFor(() => expect(monthButton(lastMonth)).toBeInTheDocument())
    swipe(card(), 110)
    await waitFor(() => expect(monthButton(shiftMonth(thisMonth, -2))).toBeInTheDocument())
  })

  it('leaves the month alone for a small movement or a tap', async () => {
    await open()
    await screen.findByRole('region', { name: 'Summary' })
    swipe(card(), 20)
    await new Promise((r) => setTimeout(r, 40))
    expect(monthButton(thisMonth)).toBeInTheDocument()
  })

  it('does not change the month for a swipe somewhere else on the page', async () => {
    await open()
    await screen.findByRole('region', { name: 'Summary' })
    swipe(screen.getByRole('region', { name: 'Money received and your balance' }), 110)
    await new Promise((r) => setTimeout(r, 40))
    expect(monthButton(thisMonth)).toBeInTheDocument()
  })

  it('still changes month with the arrows on the month switcher', async () => {
    const user = await open()
    await screen.findByRole('region', { name: 'Summary' })
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(monthButton(lastMonth)).toBeInTheDocument())
  })
})
