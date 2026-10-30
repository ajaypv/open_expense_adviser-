import { describe, expect, it } from 'vitest'
import { formatTime, from12, joinTime, minuteChoices, splitTime, to12 } from './timeParts'

describe('splitTime and joinTime', () => {
  it('reads and writes the HH:MM form that reminders are stored in', () => {
    expect(splitTime('21:05')).toEqual({ hour: 21, minute: 5 })
    expect(joinTime(9, 0)).toBe('09:00')
    expect(joinTime(21, 5)).toBe('21:05')
  })

  it('falls back to the usual evening time for anything unreadable', () => {
    for (const bad of ['', 'soon', '25:00', '12:60', '9']) expect(splitTime(bad)).toEqual({ hour: 21, minute: 0 })
  })
})

describe('12-hour clock', () => {
  it('turns a 24-hour time into hour and AM or PM', () => {
    expect(to12(0)).toEqual({ hour: 12, pm: false })
    expect(to12(9)).toEqual({ hour: 9, pm: false })
    expect(to12(12)).toEqual({ hour: 12, pm: true })
    expect(to12(13)).toEqual({ hour: 1, pm: true })
    expect(to12(23)).toEqual({ hour: 11, pm: true })
  })

  it('turns them back, so midnight and noon land on the right side', () => {
    expect(from12(12, false)).toBe(0)
    expect(from12(12, true)).toBe(12)
    expect(from12(1, true)).toBe(13)
    expect(from12(9, false)).toBe(9)
    for (let h = 0; h < 24; h++) expect(from12(to12(h).hour, to12(h).pm)).toBe(h)
  })
})

describe('formatTime', () => {
  it('writes a time the way the clock is set', () => {
    expect(formatTime('21:00', true)).toBe('9:00 PM')
    expect(formatTime('00:30', true)).toBe('12:30 AM')
    expect(formatTime('12:00', true)).toBe('12:00 PM')
    expect(formatTime('09:05', false)).toBe('09:05')
  })
})

describe('minuteChoices', () => {
  it('offers every five minutes', () => {
    expect(minuteChoices(0)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
  })

  it('keeps a minute that was set another way, in its place', () => {
    expect(minuteChoices(7)).toEqual([0, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
  })
})
