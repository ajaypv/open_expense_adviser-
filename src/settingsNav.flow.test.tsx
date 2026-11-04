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

const tx = () =>
  db.transactions.add({
    kind: 'expense', amountMinor: 45_000, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '', date: localDateString(),
    paymentMethod: '', source: 'manual', createdAt: Date.now(),
  } as never)

async function open() {
  await db.settings.bulkPut([
    { key: 'onboarded', value: true },
    { key: 'lastSeenVersion', value: APP_VERSION },
  ])
  await tx()
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('Recent transactions')
  return user
}

const mainNav = () => within(screen.getByRole('navigation', { name: 'Main' }))
const pages = () => within(screen.getByRole('navigation', { name: 'Settings pages' }))
const pressBack = () =>
  act(async () => {
    history.back()
    await new Promise((r) => setTimeout(r, 30))
  })

async function toSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(mainNav().getByRole('button', { name: 'Settings' }))
  await screen.findByRole('navigation', { name: 'Settings pages' })
}

describe('Settings: going to a page and back', () => {
  it('opens a page of its own from the list, and the back button returns to the list', async () => {
    const user = await open()
    await toSettings(user)
    await user.click(pages().getByRole('button', { name: /^Money/ }))
    expect(await screen.findByRole('heading', { name: 'Money' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Monthly budget' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Settings pages' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Back to Settings' }))
    expect(await screen.findByRole('navigation', { name: 'Settings pages' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })

  it.each([
    ['Money', 'Currency'],
    ['Automatic', 'Reminders'],
    ['Appearance', 'Theme, text and numbers'],
    ['Privacy and data', 'App lock'],
  ])('%s opens its own settings', async (page, heading) => {
    const user = await open()
    await toSettings(user)
    await user.click(pages().getByRole('button', { name: new RegExp(`^${page}`) }))
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('keeps the backup and the update at hand on the list, and a backup button works from there', async () => {
    const user = await open()
    await toSettings(user)
    expect(screen.getByRole('region', { name: 'Backup' })).toHaveTextContent('Never backed up')
    expect(screen.getByRole('region', { name: 'App update' })).toHaveTextContent(`Version ${APP_VERSION}`)
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled()
  })

  it('changes a setting on its page', async () => {
    const user = await open()
    await toSettings(user)
    await user.click(pages().getByRole('button', { name: /^Appearance/ }))
    await user.click(await screen.findByRole('switch', { name: /Hide amounts/ }))
    expect(screen.getByRole('switch', { name: /Hide amounts/ })).toBeChecked()
  })

  it('starts on the list again after leaving Settings and coming back', async () => {
    const user = await open()
    await toSettings(user)
    await user.click(pages().getByRole('button', { name: /^Appearance/ }))
    await screen.findByRole('heading', { name: 'Appearance' })
    await user.click(mainNav().getByRole('button', { name: 'Home' }))
    await user.click(mainNav().getByRole('button', { name: 'Settings' }))
    expect(await screen.findByRole('navigation', { name: 'Settings pages' })).toBeInTheDocument()
  })
})

describe('Settings: the phone back button', () => {
  it('goes from a page to the list, and then to Home', async () => {
    const user = await open()
    await toSettings(user)
    await user.click(pages().getByRole('button', { name: /^Money/ }))
    await screen.findByRole('heading', { name: 'Money' })

    await pressBack()
    expect(await screen.findByRole('navigation', { name: 'Settings pages' })).toBeInTheDocument()
    expect(mainNav().getByRole('button', { current: 'page' })).toHaveAccessibleName('Settings')

    await pressBack()
    await waitFor(() => expect(mainNav().getByRole('button', { current: 'page' })).toHaveAccessibleName('Home'))
    expect(backDepth()).toBe(0)
  })

  it('leaves nothing behind when the page is closed with its own button', async () => {
    const user = await open()
    await toSettings(user)
    await user.click(pages().getByRole('button', { name: /^Money/ }))
    await screen.findByRole('heading', { name: 'Money' })
    await user.click(screen.getByRole('button', { name: 'Back to Settings' }))
    await user.click(mainNav().getByRole('button', { name: 'Home' }))
    await new Promise((r) => setTimeout(r, 40))
    expect(backDepth()).toBe(0)
  })
})

describe('Settings: opened from a button elsewhere', () => {
  it('goes straight to the Money page from "Set budget" on Home', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Set budget' }))
    expect(await screen.findByRole('heading', { name: 'Money' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Monthly budget' })).toBeInTheDocument()
  })

  it('shows the list, not that page, the next time Settings is opened from the tab bar', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Set budget' }))
    await screen.findByRole('heading', { name: 'Money' })
    await user.click(mainNav().getByRole('button', { name: 'Home' }))
    await user.click(mainNav().getByRole('button', { name: 'Settings' }))
    expect(await screen.findByRole('navigation', { name: 'Settings pages' })).toBeInTheDocument()
  })
})
