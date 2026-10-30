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

// The service-worker helper only exists in a real build.
vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }))

beforeEach(() => {
  reloadDisplay()
  resetLockForTests()
})

const onboard = () =>
  db.settings.bulkPut([
    { key: 'onboarded', value: true },
    { key: 'lastSeenVersion', value: APP_VERSION },
  ])

const tx = (over: Record<string, unknown> = {}) =>
  db.transactions.add({
    kind: 'expense', amountMinor: 45_000, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '', date: localDateString(),
    paymentMethod: '', source: 'manual', createdAt: Date.now() + Math.random(), ...over,
  } as never)

const open = async () => {
  await onboard()
  const user = userEvent.setup()
  render(<App />)
  return user
}

const mainNav = () => within(screen.getByRole('navigation', { name: 'Main' }))
const current = () => mainNav().getByRole('button', { current: 'page' })

/** Presses the phone's back button and lets the resulting event arrive. */
const pressBack = () =>
  act(async () => {
    history.back()
    await new Promise((r) => setTimeout(r, 30))
  })

describe('The back button moves back through the app instead of leaving it', () => {
  it.each(['Activity', 'Insights', 'Settings'])('takes you from %s back to Home', async (tab) => {
    await tx()
    const user = await open()
    await screen.findByText('Recent transactions')
    await user.click(mainNav().getByRole('button', { name: tab }))
    await waitFor(() => expect(current()).toHaveAccessibleName(tab))
    await pressBack()
    await waitFor(() => expect(current()).toHaveAccessibleName('Home'))
    expect(backDepth()).toBe(0) // nothing left to go back through: the next back press is the phone's own
  })

  it('goes straight to Home from a tab reached from another tab, in one press', async () => {
    await tx()
    const user = await open()
    await screen.findByText('Recent transactions')
    await user.click(mainNav().getByRole('button', { name: 'Activity' }))
    await user.click(mainNav().getByRole('button', { name: 'Insights' }))
    await pressBack()
    await waitFor(() => expect(current()).toHaveAccessibleName('Home'))
    expect(backDepth()).toBe(0)
  })

  it('leaves nothing behind when Home is reached with the tab bar instead', async () => {
    await tx()
    const user = await open()
    await screen.findByText('Recent transactions')
    await user.click(mainNav().getByRole('button', { name: 'Settings' }))
    await user.click(mainNav().getByRole('button', { name: 'Home' }))
    await new Promise((r) => setTimeout(r, 40))
    expect(backDepth()).toBe(0)
  })

  it('has nothing to catch on Home itself, so back leaves the app as the phone normally would', async () => {
    await tx()
    await open()
    await screen.findByText('Recent transactions')
    expect(backDepth()).toBe(0)
  })
})

describe('The back button closes what is open, and only that', () => {
  it('closes the goals sheet and stays on Home', async () => {
    await tx()
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /^Goals/ }))
    expect(await screen.findByRole('dialog', { name: 'Goals' })).toBeInTheDocument()
    await pressBack()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Goals' })).toBeNull())
    expect(current()).toHaveAccessibleName('Home')
  })

  it('closes a sheet opened inside another one first, and then the one beneath', async () => {
    await tx()
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /^Goals/ }))
    const overview = await screen.findByRole('dialog', { name: 'Goals' })
    await user.click(within(overview).getByRole('button', { name: 'Set a goal' }))
    expect(await screen.findByRole('dialog', { name: 'New goal' })).toBeInTheDocument()
    await pressBack()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New goal' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Goals' })).toBeInTheDocument() // still open beneath
    await pressBack()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Goals' })).toBeNull())
  })

  it('closes the add form', async () => {
    await tx()
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Add with the full form' }))
    expect(await screen.findByRole('dialog', { name: 'New transaction' })).toBeInTheDocument()
    await pressBack()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New transaction' })).toBeNull())
    expect(current()).toHaveAccessibleName('Home')
  })

  it('closes a list opened inside the add form, and leaves the form open', async () => {
    await tx()
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Add with the full form' }))
    const form = await screen.findByRole('dialog', { name: 'New transaction' })
    await user.click(within(form).getByRole('button', { name: 'Currency' }))
    expect(await screen.findByRole('dialog', { name: 'Currency' })).toBeInTheDocument()
    await pressBack()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Currency' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'New transaction' })).toBeInTheDocument()
  })

  it('closes the form on top of the upcoming payments first', async () => {
    await tx()
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Track loans, auto-payments and salary/ }))
    const upcoming = await screen.findByRole('dialog', { name: 'Upcoming payments' })
    await user.click(within(upcoming).getByRole('button', { name: 'Add a payment' }))
    expect(await screen.findByRole('dialog', { name: 'New regular payment' })).toBeInTheDocument()
    await pressBack()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New regular payment' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Upcoming payments' })).toBeInTheDocument()
  })

  it('closes a sheet on a tab other than Home, and stays on that tab', async () => {
    await tx()
    const user = await open()
    await user.click(mainNav().getByRole('button', { name: 'Activity' }))
    await user.click(await screen.findByRole('button', { name: 'Add with the full form' }))
    expect(await screen.findByRole('dialog', { name: 'New transaction' })).toBeInTheDocument()
    await pressBack()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New transaction' })).toBeNull())
    expect(current()).toHaveAccessibleName('Activity')
    await pressBack()
    await waitFor(() => expect(current()).toHaveAccessibleName('Home'))
  })

  it('closes the filters in Activity first, then goes Home', async () => {
    await tx()
    const user = await open()
    await user.click(mainNav().getByRole('button', { name: 'Activity' }))
    await user.click(await screen.findByRole('button', { name: /Filters/ }))
    expect(await screen.findByRole('region', { name: 'Filters' })).toBeInTheDocument()
    await pressBack()
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Filters' })).toBeNull())
    expect(current()).toHaveAccessibleName('Activity')
    await pressBack()
    await waitFor(() => expect(current()).toHaveAccessibleName('Home'))
  })

  it('leaves select mode in Activity first, then goes Home', async () => {
    await tx({ merchant: 'Cafe' })
    const user = await open()
    await user.click(mainNav().getByRole('button', { name: 'Activity' }))
    await user.click(await screen.findByRole('button', { name: 'Select' }))
    expect(await screen.findByText('Tap rows to select')).toBeInTheDocument()
    await pressBack()
    await waitFor(() => expect(screen.queryByText('Tap rows to select')).toBeNull())
    expect(current()).toHaveAccessibleName('Activity')
    await pressBack()
    await waitFor(() => expect(current()).toHaveAccessibleName('Home'))
  })

  it('keeps working after things are opened and closed many times, without piling up', async () => {
    await tx()
    const user = await open()
    for (let i = 0; i < 3; i++) {
      await user.click(await screen.findByRole('button', { name: /^Goals/ }))
      await screen.findByRole('dialog', { name: 'Goals' })
      await pressBack()
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Goals' })).toBeNull())
    }
    expect(backDepth()).toBe(0)
  })

  it('closes something opened with its own button without leaving a step behind', async () => {
    await tx()
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /^Goals/ }))
    const overview = await screen.findByRole('dialog', { name: 'Goals' })
    await user.click(within(overview).getByRole('button', { name: 'Close' }))
    await new Promise((r) => setTimeout(r, 40))
    expect(backDepth()).toBe(0)
  })
})
