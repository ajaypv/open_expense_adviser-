import { describe, expect, it } from 'vitest'
import type { Goal } from '../db/schema'
import { describeTimeLeft, goalProgress, sortGoals } from './goals'

const today = new Date(2026, 9, 30) // 30 Oct 2026

let id = 0
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: ++id, name: 'New phone', targetMinor: 1_000_000, savedMinor: 0, createdAt: id, ...over,
})

describe('goalProgress', () => {
  it('says how far along a goal is and how much is left', () => {
    const p = goalProgress(goal({ savedMinor: 250_000 }), today)
    expect(p).toMatchObject({ fraction: 0.25, remainingMinor: 750_000, reached: false, daysLeft: null, pace: null })
  })

  it('is reached once the saved amount covers the target, and never shows more than full', () => {
    const p = goalProgress(goal({ savedMinor: 1_200_000, dueDate: '2026-12-01' }), today)
    expect(p).toMatchObject({ fraction: 1, remainingMinor: 0, reached: true, pace: null })
  })

  it('counts the days to the date, with today as zero', () => {
    expect(goalProgress(goal({ dueDate: '2026-10-30' }), today).daysLeft).toBe(0)
    expect(goalProgress(goal({ dueDate: '2026-11-06' }), today).daysLeft).toBe(7)
    expect(goalProgress(goal({ dueDate: '2026-10-28' }), today).daysLeft).toBe(-2)
  })

  it('suggests a weekly amount when the date is close, rounded up to a whole unit', () => {
    // Two weeks to go, ₹1,000 still needed.
    const p = goalProgress(goal({ targetMinor: 100_000, dueDate: '2026-11-13' }), today)
    expect(p.pace).toEqual({ amountMinor: 50_000, per: 'week' })
    // Three weeks, ₹1,000 needed: 333.33 a week rounds up to ₹334.
    expect(goalProgress(goal({ targetMinor: 100_000, dueDate: '2026-11-20' }), today).pace).toEqual({ amountMinor: 33_400, per: 'week' })
  })

  it('suggests a monthly amount when the date is far off', () => {
    // 90 days is three months: ₹8,000 still needed is 2,666.67 a month, rounded up.
    const p = goalProgress(goal({ savedMinor: 200_000, dueDate: '2027-01-28' }), today)
    expect(p.daysLeft).toBe(90)
    expect(p.pace).toEqual({ amountMinor: 266_700, per: 'month' })
  })

  it('suggests nothing without a future date', () => {
    expect(goalProgress(goal(), today).pace).toBeNull()
    expect(goalProgress(goal({ dueDate: '2026-10-30' }), today).pace).toBeNull() // due today
    expect(goalProgress(goal({ dueDate: '2026-10-01' }), today).pace).toBeNull() // already passed
  })
})

describe('describeTimeLeft', () => {
  it('says nothing when there is no date', () => {
    expect(describeTimeLeft(null)).toBe('')
  })

  it('uses days, then weeks, then months as the date gets further away', () => {
    expect(describeTimeLeft(0)).toBe('Due today')
    expect(describeTimeLeft(1)).toBe('1 day left')
    expect(describeTimeLeft(9)).toBe('9 days left')
    expect(describeTimeLeft(21)).toBe('3 weeks left')
    expect(describeTimeLeft(90)).toBe('3 months left')
  })

  it('says how late a date has passed', () => {
    expect(describeTimeLeft(-1)).toBe('Overdue by 1 day')
    expect(describeTimeLeft(-12)).toBe('Overdue by 12 days')
  })
})

describe('sortGoals', () => {
  it('puts what is due soonest first, undated goals after dated ones, and reached goals last', () => {
    const later = goal({ name: 'Later', dueDate: '2027-03-01' })
    const sooner = goal({ name: 'Sooner', dueDate: '2026-12-01' })
    const open = goal({ name: 'Open-ended' })
    const done = goal({ name: 'Done', savedMinor: 1_000_000, dueDate: '2026-11-01' })
    expect(sortGoals([done, open, later, sooner]).map((g) => g.name)).toEqual(['Sooner', 'Later', 'Open-ended', 'Done'])
  })

  it('keeps the order goals were made in when nothing else separates them, and leaves the input alone', () => {
    const a = goal({ name: 'A' })
    const b = goal({ name: 'B' })
    const input = [b, a]
    expect(sortGoals(input).map((g) => g.name)).toEqual(['A', 'B'])
    expect(input.map((g) => g.name)).toEqual(['B', 'A'])
  })
})
