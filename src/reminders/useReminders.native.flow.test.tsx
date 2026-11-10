// @vitest-environment jsdom
import '../test/dom'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeLedger } from '../test/ledger'

const app = vi.hoisted(() => ({ native: true }))
vi.mock('../native/platform', () => ({ isNativeApp: () => app.native }))
vi.mock('./native', async (original) => ({
  ...(await original<typeof import('./native')>()),
  nativePermission: vi.fn(),
  requestNativePermission: vi.fn(),
  setLogReminders: vi.fn().mockResolvedValue(true),
  showNow: vi.fn().mockResolvedValue(true),
}))

import { nativePermission, requestNativePermission, setLogReminders, showNow } from './native'
import { requestNotificationPermission } from './notify'
import { setReminderPrefs } from './store'
import { useReminders } from './useReminders'

const permission = vi.mocked(nativePermission)
const set = vi.mocked(setLogReminders)
const lastPlan = () => set.mock.calls.at(-1)![0]
const mount = (txs: unknown[] = []) => renderHook(() => useReminders(makeLedger({ txs: txs as never }), vi.fn()))

beforeEach(() => {
  app.native = true
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 10, 10, 0)) // 10 November, 10:00
  permission.mockReset().mockResolvedValue('granted')
  set.mockClear()
  vi.mocked(showNow).mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the daily reminder, set with the phone', () => {
  it('is planned for each of the next days at the chosen time, when switched on and allowed', async () => {
    await setReminderPrefs({ logReminder: true, logTime: '21:00' })
    mount()
    await waitFor(() => expect(set).toHaveBeenCalled())
    await waitFor(() => expect(lastPlan()).toHaveLength(7))
    expect(lastPlan()[0]).toEqual({ id: 1, at: new Date(2026, 10, 10, 21, 0) })
    expect(lastPlan()[6]).toEqual({ id: 7, at: new Date(2026, 10, 16, 21, 0) })
  })

  it('has today’s taken back when something has been logged today', async () => {
    await setReminderPrefs({ logReminder: true, logTime: '21:00' })
    mount([{ id: 1, source: 'manual', date: '2026-11-10', createdAt: new Date(2026, 10, 10, 9).getTime() }])
    await waitFor(() => expect(lastPlan().map((p) => p.id)).toEqual([2, 3, 4, 5, 6, 7]))
  })

  it('is cleared when the switch is off', async () => {
    await setReminderPrefs({ logReminder: false })
    mount()
    await waitFor(() => expect(set).toHaveBeenCalledWith([]))
  })

  it('is cleared when the phone does not allow notifications', async () => {
    permission.mockResolvedValue('denied')
    await setReminderPrefs({ logReminder: true, logTime: '21:00' })
    mount()
    await waitFor(() => expect(set).toHaveBeenCalledWith([]))
    expect(lastPlan()).toEqual([])
  })

  it('is planned the moment the person allows notifications', async () => {
    permission.mockResolvedValue('default')
    await setReminderPrefs({ logReminder: true, logTime: '21:00' })
    mount()
    await waitFor(() => expect(set).toHaveBeenCalledWith([]))
    permission.mockResolvedValue('granted')
    vi.mocked(requestNativePermission).mockResolvedValue('granted')
    await requestNotificationPermission()
    await waitFor(() => expect(lastPlan()).toHaveLength(7))
  })

  it('is not also shown straight away by the app, which would be a second one', async () => {
    vi.setSystemTime(new Date(2026, 10, 10, 22, 0)) // past the time, nothing logged
    await setReminderPrefs({ logReminder: true, logTime: '21:00' })
    const view = mount()
    await waitFor(() => expect(set).toHaveBeenCalled())
    expect(view.result.current.logNudge).toBe(true) // still shown inside the app
    expect(showNow).not.toHaveBeenCalled()
  })

  it('is left alone in a browser, where the phone cannot be asked', async () => {
    app.native = false
    await setReminderPrefs({ logReminder: true, logTime: '21:00' })
    mount()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(set).not.toHaveBeenCalled()
  })
})
