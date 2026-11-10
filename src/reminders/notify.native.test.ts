// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const app = vi.hoisted(() => ({ native: true }))
vi.mock('../native/platform', () => ({ isNativeApp: () => app.native }))
vi.mock('./native', () => ({ nativePermission: vi.fn(), requestNativePermission: vi.fn(), showNow: vi.fn() }))

import { nativePermission, requestNativePermission, showNow } from './native'
import { currentPermission, notify, onPermissionChange, requestNotificationPermission, schedulePeriodicReminder } from './notify'

const permission = vi.mocked(nativePermission)
const request = vi.mocked(requestNativePermission)
const show = vi.mocked(showNow)

beforeEach(() => {
  app.native = true
  permission.mockReset()
  request.mockReset()
  show.mockReset().mockResolvedValue(true)
})

describe('notifications inside the Android app', () => {
  it('shows a notification through the phone when it is allowed', async () => {
    permission.mockResolvedValue('granted')
    expect(await notify('Title', 'Body', 'tag')).toBe(true)
    expect(show).toHaveBeenCalledExactlyOnceWith('Title', 'Body', 'tag')
  })

  it.each(['denied', 'default', 'unsupported'] as const)('shows nothing, and says so, when the phone says %s', async (answer) => {
    permission.mockResolvedValue(answer)
    expect(await notify('Title', 'Body', 'tag')).toBe(false)
    expect(show).not.toHaveBeenCalled()
  })

  it('says the notification was not shown when the phone refused it', async () => {
    permission.mockResolvedValue('granted')
    show.mockResolvedValue(false)
    expect(await notify('Title', 'Body', 'tag')).toBe(false)
  })

  it('asks the phone, and tells whoever is waiting that the answer is in', async () => {
    request.mockResolvedValue('granted')
    const heard = vi.fn()
    const stop = onPermissionChange(heard)
    expect(await requestNotificationPermission()).toBe('granted')
    expect(heard).toHaveBeenCalledOnce()
    stop()
    await requestNotificationPermission()
    expect(heard).toHaveBeenCalledOnce()
  })

  it('tells them when the answer was no, too', async () => {
    request.mockResolvedValue('denied')
    const heard = vi.fn()
    const stop = onPermissionChange(heard)
    expect(await requestNotificationPermission()).toBe('denied')
    expect(heard).toHaveBeenCalledOnce()
    stop()
  })

  it('reads the permission from the phone', async () => {
    permission.mockResolvedValue('granted')
    expect(await currentPermission()).toBe('granted')
  })

  it('has nothing to ask the browser for: the reminders are set with the phone, so on means set', async () => {
    expect(await schedulePeriodicReminder(true)).toBe(true)
    expect(await schedulePeriodicReminder(false)).toBe(false)
  })
})

describe('notifications in a browser', () => {
  it('do not touch the phone', async () => {
    app.native = false
    expect(await currentPermission()).toBe('unsupported')
    expect(await notify('Title', 'Body', 'tag')).toBe(false)
    expect(await requestNotificationPermission()).toBe('unsupported')
    expect(permission).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
    expect(show).not.toHaveBeenCalled()
  })
})
