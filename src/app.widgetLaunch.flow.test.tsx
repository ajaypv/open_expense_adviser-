// @vitest-environment jsdom
import './test/dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { reloadDisplay } from './data/display'
import { localDateString } from './db/money'
import { db } from './db/schema'
import { APP_VERSION } from './pwa/version'
import { resetLockForTests } from './security/lock'

// The Android app, with the phone's side of the Timeline widget played by these: the phone says the app was opened from the widget.
const phone = vi.hoisted(() => ({ view: vi.fn() }))
vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }))
vi.mock('./widget/native', async (original) => ({
  ...(await original<typeof import('./widget/native')>()),
  isAndroidApp: () => true,
  takeLaunchView: phone.view,
  publishToAndroid: vi.fn().mockResolvedValue(true),
  publishTimelineToAndroid: vi.fn().mockResolvedValue(true),
}))

beforeEach(async () => {
  reloadDisplay()
  resetLockForTests()
  phone.view.mockReset().mockResolvedValue(null)
  await db.settings.bulkPut([
    { key: 'onboarded', value: true },
    { key: 'lastSeenVersion', value: APP_VERSION },
  ])
  await db.transactions.add({
    kind: 'expense', amountMinor: 45_000, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '', date: localDateString(),
    paymentMethod: '', source: 'manual', createdAt: Date.now(),
  } as never)
})

const pressed = (name: string) => within(screen.getByRole('group', { name: 'Home view' })).getByRole('button', { name }).getAttribute('aria-pressed')

describe('the Timeline widget on the Android home screen', () => {
  it('opens Home on its Timeline, which is on the left of the Overview, when the app was opened from the widget', async () => {
    phone.view.mockResolvedValue('timeline')
    render(<App />)
    await screen.findByRole('group', { name: 'Home view' })
    await waitFor(() => expect(pressed('Timeline')).toBe('true'))
    expect(pressed('Overview')).toBe('false')
    expect(await screen.findByRole('list', { name: 'Spending, day by day' })).toBeInTheDocument()
  })

  it('opens Home on the Overview, as always, when the app was opened some other way', async () => {
    render(<App />)
    await screen.findByText('Recent transactions')
    await waitFor(() => expect(phone.view).toHaveBeenCalled())
    expect(pressed('Overview')).toBe('true')
  })
})
