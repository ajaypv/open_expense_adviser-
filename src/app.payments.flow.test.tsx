// @vitest-environment jsdom
import './test/dom'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { reloadDisplay } from './data/display'
import { localDateString } from './db/money'
import { db } from './db/schema'
import { APP_VERSION } from './pwa/version'
import { resetLockForTests } from './security/lock'

// The Android app, with the phone's side played by these.
const phone = vi.hoisted(() => ({ pending: vi.fn() }))
vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }))
vi.mock('./native/platform', () => ({ isNativeApp: () => true }))
vi.mock('./payments/native', async (original) => ({ ...(await original<typeof import('./payments/native')>()), readPending: phone.pending }))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }), exitApp: vi.fn() } }))
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: vi.fn().mockResolvedValue({ display: 'denied' }),
    requestPermissions: vi.fn().mockResolvedValue({ display: 'denied' }),
    schedule: vi.fn().mockResolvedValue({ notifications: [] }),
    cancel: vi.fn().mockResolvedValue(undefined),
  },
}))

const payment = (over: Record<string, unknown> = {}) => ({ id: 1, state: 'add', amountMinor: 25000, merchant: 'Swiggy', income: false, package: 'com.phonepe.app', at: Date.now(), ...over })

beforeEach(async () => {
  reloadDisplay()
  resetLockForTests()
  phone.pending.mockReset().mockResolvedValue([])
  await db.settings.bulkPut([
    { key: 'onboarded', value: true },
    { key: 'lastSeenVersion', value: APP_VERSION },
  ])
  await db.transactions.add({
    kind: 'expense', amountMinor: 45_000, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '', date: localDateString(),
    paymentMethod: '', source: 'manual', createdAt: Date.now(),
  } as never)
})

const open = async () => {
  render(<App />)
  await screen.findByText('Recent transactions')
}

describe('the Android app: payments from the pop-ups', () => {
  it('adds a payment whose Add button was pressed, and says so', async () => {
    phone.pending.mockResolvedValueOnce([payment()])
    await open()
    expect(await screen.findByText(/Added ₹250/)).toBeInTheDocument()
    const saved = (await db.transactions.where('merchant').equals('Swiggy').toArray())[0]
    expect(saved).toMatchObject({ kind: 'expense', amountMinor: 25000, currency: 'INR', paymentMethod: 'Online', note: 'via PhonePe', source: 'chat', date: localDateString() })
    expect(saved.categoryId).toBeGreaterThan(0)
  })

  it('adds money that came in as income', async () => {
    phone.pending.mockResolvedValueOnce([payment({ income: true, merchant: 'Ravi', amountMinor: 50000, package: 'com.google.android.apps.nbu.paisa.user' })])
    await open()
    expect(await screen.findByText(/Received ₹500/)).toBeInTheDocument()
    const saved = (await db.transactions.where('merchant').equals('Ravi').toArray())[0]
    expect(saved).toMatchObject({ kind: 'income', amountMinor: 50000, note: 'via Google Pay' })
  })

  it('files a payment under the day it was made when the app is opened later', async () => {
    const yesterday = new Date(Date.now() - 86_400_000)
    phone.pending.mockResolvedValueOnce([payment({ at: yesterday.getTime() })])
    await open()
    await screen.findByText(/Added ₹250/)
    const saved = (await db.transactions.where('merchant').equals('Swiggy').toArray())[0]
    expect(saved.date).toBe(localDateString(yesterday))
  })

  it('opens the add form with the payment filled in when its pop-up was touched, and saves nothing yet', async () => {
    phone.pending.mockResolvedValueOnce([payment({ state: 'edit' })])
    await open()
    expect(await screen.findByDisplayValue('Swiggy')).toBeInTheDocument()
    expect(screen.getByDisplayValue('250')).toBeInTheDocument()
    expect(await db.transactions.where('merchant').equals('Swiggy').count()).toBe(0)
  })

  it('adds nothing when nothing is waiting', async () => {
    await open()
    await waitFor(() => expect(phone.pending).toHaveBeenCalled())
    expect(await db.transactions.count()).toBe(1)
  })
})
