// @vitest-environment jsdom
import '../../test/dom'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const phone = vi.hoisted(() => ({
  native: true,
  status: vi.fn(),
  save: vi.fn(),
  listener: vi.fn(),
  appInfo: vi.fn(),
  clear: vi.fn(),
  allow: vi.fn(),
}))
vi.mock('../../native/platform', () => ({ isNativeApp: () => phone.native }))
vi.mock('../../payments/native', () => ({
  readStatus: phone.status,
  saveApps: phone.save,
  openListenerSettings: phone.listener,
  openAppSettings: phone.appInfo,
  clearUnread: phone.clear,
}))
vi.mock('../../reminders/notify', () => ({ requestNotificationPermission: phone.allow }))

import type { PaymentStatus } from '../../payments/native'
import { toNativeApps } from '../../payments/apps'
import { PaymentsSection } from './PaymentsSection'

const status = (over: Partial<PaymentStatus> = {}): PaymentStatus => ({
  listening: true,
  notifications: true,
  configured: true,
  apps: toNativeApps(['phonepe', 'gpay']),
  unread: [],
  ...over,
})
const savedPackages = () => phone.save.mock.calls.at(-1)![0].map((a: { package: string }) => a.package)
const mount = async (over: Partial<PaymentStatus> = {}) => {
  phone.status.mockResolvedValue(status(over))
  render(<PaymentsSection />)
  await screen.findByRole('heading', { name: 'Payment pop-ups' })
}

beforeEach(() => {
  phone.native = true
  for (const fn of [phone.status, phone.save, phone.listener, phone.appInfo, phone.clear, phone.allow]) fn.mockReset()
  phone.save.mockResolvedValue(true)
})

describe('Settings: payment pop-ups, in a browser', () => {
  it('says it is not on this device, and why, with nothing to switch', () => {
    phone.native = false
    render(<PaymentsSection />)
    expect(screen.getByText('Not on this device')).toBeInTheDocument()
    expect(screen.getByText(/A web page cannot read another app’s notifications/)).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(phone.status).not.toHaveBeenCalled()
  })
})

describe('Settings: payment pop-ups, in the Android app', () => {
  it('says what it does, and that only the chosen apps are read, on the phone', async () => {
    await mount()
    expect(screen.getByText(/a pop-up offers to add it/)).toBeInTheDocument()
    expect(screen.getByText(/Only the apps you choose below are read, on this phone/)).toBeInTheDocument()
  })

  it('is on when notification access is given and an app is chosen', async () => {
    await mount()
    expect(await screen.findByText('Notification access is on.')).toBeInTheDocument()
    expect(screen.getByText('On')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on notification access' })).toBeNull()
  })

  it('is off, and offers the phone’s own screen to give access, until it is given', async () => {
    await mount({ listening: false })
    expect(await screen.findByText('Notification access is off.')).toBeInTheDocument()
    expect(screen.getByText('Off')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Turn on notification access' }))
    expect(phone.listener).toHaveBeenCalledOnce()
  })

  it('explains the restricted setting on newer Android, and opens App info for it', async () => {
    await mount({ listening: false })
    expect(await screen.findByText(/Allow restricted settings/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open App info' }))
    expect(phone.appInfo).toHaveBeenCalledOnce()
  })

  it('is off when no app is chosen, even with access', async () => {
    await mount({ apps: [] })
    expect(await screen.findByText('Off')).toBeInTheDocument()
  })

  it('shows which apps are on', async () => {
    await mount()
    expect(await screen.findByRole('switch', { name: /^PhonePe/ })).toBeChecked()
    expect(screen.getByRole('switch', { name: /^Google Pay/ })).toBeChecked()
    expect(screen.getByRole('switch', { name: /^CRED/ })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: /^Bank messages/ })).not.toBeChecked()
  })

  it('turns an app on, keeping the others', async () => {
    await mount()
    fireEvent.click(await screen.findByRole('switch', { name: /^CRED/ }))
    await waitFor(() => expect(phone.save).toHaveBeenCalled())
    expect(savedPackages()).toEqual(expect.arrayContaining(['com.phonepe.app', 'com.google.android.apps.nbu.paisa.user', 'com.dreamplug.androidapp']))
  })

  it('turns an app off, keeping the others', async () => {
    await mount()
    fireEvent.click(await screen.findByRole('switch', { name: /^PhonePe/ }))
    await waitFor(() => expect(phone.save).toHaveBeenCalled())
    expect(savedPackages()).toEqual(['com.google.android.apps.nbu.paisa.user'])
  })

  it('turns the messages app on with all its packages, marked as messages', async () => {
    await mount()
    fireEvent.click(await screen.findByRole('switch', { name: /^Bank messages/ }))
    await waitFor(() => expect(phone.save).toHaveBeenCalled())
    const saved = phone.save.mock.calls.at(-1)![0] as { package: string; sms: boolean }[]
    expect(saved.filter((a) => a.sms).map((a) => a.package)).toEqual(['com.google.android.apps.messaging', 'com.samsung.android.messaging', 'com.android.mms'])
  })

  it('starts with the usual payment apps on, and the messages app off, until the person chooses', async () => {
    await mount({ configured: false, apps: [] })
    await waitFor(() => expect(phone.save).toHaveBeenCalledOnce())
    expect(savedPackages()).toEqual(['com.phonepe.app', 'com.google.android.apps.nbu.paisa.user', 'com.dreamplug.androidapp', 'net.one97.paytm', 'in.org.npci.upiapp'])
  })

  it('does not choose for the person again once they have chosen', async () => {
    await mount({ apps: [] })
    await screen.findByText('Off')
    expect(phone.save).not.toHaveBeenCalled()
  })

  it('asks for notifications when the phone is not letting the pop-ups show', async () => {
    await mount({ notifications: false })
    expect(await screen.findByText(/not letting this app show notifications/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Allow notifications' }))
    await waitFor(() => expect(phone.allow).toHaveBeenCalledOnce())
  })

  it('does not ask for notifications when they are allowed', async () => {
    await mount()
    await screen.findByText('Notification access is on.')
    expect(screen.queryByRole('button', { name: 'Allow notifications' })).toBeNull()
  })

  it('looks again when the person comes back from the phone’s Settings', async () => {
    await mount({ listening: false })
    await screen.findByText('Notification access is off.')
    phone.status.mockResolvedValue(status({ listening: true }))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(await screen.findByText('Notification access is on.')).toBeInTheDocument()
  })

  it('shows what could not be read, with the app it came from, and clears it', async () => {
    await mount({ unread: [{ package: 'com.phonepe.app', text: 'Rs 250 moved to Swiggy', at: 1 }, { package: 'net.one97.paytm', text: 'Rs 99 gone', at: 2 }] })
    const summary = await screen.findByText('2 notifications could not be read')
    fireEvent.click(summary)
    const list = screen.getByRole('list')
    expect(within(list).getByText('Rs 250 moved to Swiggy')).toBeInTheDocument()
    expect(within(list).getByText('PhonePe')).toBeInTheDocument()
    expect(within(list).getByText('Paytm')).toBeInTheDocument()
    phone.status.mockResolvedValue(status())
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(phone.clear).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByText(/could not be read/)).toBeNull())
  })

  it('says nothing about unread notifications when there are none', async () => {
    await mount()
    await screen.findByText('Notification access is on.')
    expect(screen.queryByText(/could not be read/)).toBeNull()
  })
})
