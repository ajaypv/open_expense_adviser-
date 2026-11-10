import { beforeEach, describe, expect, it, vi } from 'vitest'

const plugin = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
}))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: plugin }))

import { idFor, nativePermission, reminderTimes, requestNativePermission, REMINDER_DAYS, setLogReminders, showNow } from './native'

beforeEach(() => {
  for (const fn of Object.values(plugin)) fn.mockReset()
  plugin.schedule.mockResolvedValue({ notifications: [] })
  plugin.cancel.mockResolvedValue(undefined)
})

describe('reminderTimes: when the daily reminder should go off', () => {
  const at = (day: number, hours: number, minutes = 0) => new Date(2026, 10, day, hours, minutes)

  it('is at the chosen time on each of the next days, starting today while that time is still to come', () => {
    const planned = reminderTimes(at(10, 10), '21:00', false)
    expect(planned).toHaveLength(REMINDER_DAYS)
    expect(planned[0]).toEqual({ id: 1, at: at(10, 21) })
    expect(planned[1]).toEqual({ id: 2, at: at(11, 21) })
    expect(planned.at(-1)).toEqual({ id: 7, at: at(16, 21) })
  })

  it('starts tomorrow once today’s time has passed, keeping each day’s own number', () => {
    const planned = reminderTimes(at(10, 21, 30), '21:00', false)
    expect(planned).toHaveLength(REMINDER_DAYS - 1)
    expect(planned[0]).toEqual({ id: 2, at: at(11, 21) })
  })

  it('leaves out today when something has been logged already, and keeps the rest', () => {
    const planned = reminderTimes(at(10, 10), '21:00', true)
    expect(planned.map((p) => p.id)).toEqual([2, 3, 4, 5, 6, 7])
  })

  it('does not take back a day that is not today when today is logged', () => {
    expect(reminderTimes(at(10, 22), '21:00', true).map((p) => p.id)).toEqual([2, 3, 4, 5, 6, 7])
  })

  it('does not set one for the very minute it is', () => {
    expect(reminderTimes(at(10, 21), '21:00', false)[0].id).toBe(2)
  })

  it('goes over the end of the month and the year', () => {
    const planned = reminderTimes(new Date(2026, 11, 29, 6), '08:15', false)
    expect(planned.map((p) => p.at.getTime())).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => new Date(2026, 11, 29 + i, 8, 15).getTime()))
    expect(planned[3].at).toEqual(new Date(2027, 0, 1, 8, 15))
  })

  it('can look further ahead or less far', () => {
    expect(reminderTimes(at(10, 10), '21:00', false, 3)).toHaveLength(3)
    expect(reminderTimes(at(10, 10), '21:00', false, 0)).toEqual([])
  })
})

describe('idFor', () => {
  it('gives the same number for the same name and different ones for different names', () => {
    expect(idFor('budget-overall')).toBe(idFor('budget-overall'))
    expect(idFor('budget-overall')).not.toBe(idFor('budget-cat:3'))
  })

  it('stays clear of the numbers used for the daily reminders, and is a whole number', () => {
    for (const tag of ['daily-reminder', 'budget-overall', 'budget-cat:12', 'x', '']) {
      const id = idFor(tag)
      expect(Number.isInteger(id)).toBe(true)
      expect(id).toBeGreaterThan(REMINDER_DAYS)
      expect(id).toBeLessThan(2_147_483_647)
    }
  })
})

describe('permission', () => {
  it.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['prompt', 'default'],
    ['prompt-with-rationale', 'default'],
  ])('reads the phone’s %s as %s', async (display, expected) => {
    plugin.checkPermissions.mockResolvedValue({ display })
    expect(await nativePermission()).toBe(expected)
  })

  it('says unsupported when the phone cannot be asked', async () => {
    plugin.checkPermissions.mockRejectedValue(new Error('not implemented'))
    expect(await nativePermission()).toBe('unsupported')
  })

  it('asks with the phone’s own prompt and passes the answer on', async () => {
    plugin.requestPermissions.mockResolvedValue({ display: 'granted' })
    expect(await requestNativePermission()).toBe('granted')
    plugin.requestPermissions.mockResolvedValue({ display: 'denied' })
    expect(await requestNativePermission()).toBe('denied')
  })

  it('counts a prompt that cannot be shown as a no', async () => {
    plugin.requestPermissions.mockRejectedValue(new Error('x'))
    expect(await requestNativePermission()).toBe('denied')
  })
})

describe('showNow', () => {
  it('shows a notification at once, under a number made from its name', async () => {
    expect(await showNow('Budget', '80% used', 'budget-overall')).toBe(true)
    const [{ notifications }] = plugin.schedule.mock.calls[0]
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ id: idFor('budget-overall'), title: 'Budget', body: '80% used', smallIcon: 'ic_stat_notify' })
    expect(notifications[0].schedule).toBeUndefined()
  })

  it('says so, rather than failing, when the phone refuses', async () => {
    plugin.schedule.mockRejectedValue(new Error('no'))
    expect(await showNow('a', 'b', 'c')).toBe(false)
  })
})

describe('setLogReminders', () => {
  const planned = reminderTimes(new Date(2026, 10, 10, 10), '21:00', false, 3)

  it('takes back the old ones and sets the new, to go off even when the phone is resting', async () => {
    expect(await setLogReminders(planned)).toBe(true)
    expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id })) })
    const [{ notifications }] = plugin.schedule.mock.calls[0]
    expect(notifications.map((n: { id: number }) => n.id)).toEqual([1, 2, 3])
    expect(notifications[0]).toMatchObject({ title: 'Log today’s spending', body: 'Nothing added today yet. It only takes a few seconds.', smallIcon: 'ic_stat_notify' })
    expect(notifications[0].schedule).toEqual({ at: planned[0].at, allowWhileIdle: true })
    expect(plugin.cancel.mock.invocationCallOrder[0]).toBeLessThan(plugin.schedule.mock.invocationCallOrder[0])
  })

  it('only takes back the old ones when there are none to set (switched off, or not allowed)', async () => {
    expect(await setLogReminders([])).toBe(false)
    expect(plugin.cancel).toHaveBeenCalledOnce()
    expect(plugin.schedule).not.toHaveBeenCalled()
  })

  it('says so, rather than failing, when the phone refuses', async () => {
    plugin.schedule.mockRejectedValue(new Error('no'))
    expect(await setLogReminders(planned)).toBe(false)
  })
})
