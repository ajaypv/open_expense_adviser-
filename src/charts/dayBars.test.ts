import { describe, expect, it } from 'vitest'
import { dayRatio } from './dayBars'

describe('dayRatio', () => {
  it('compares a day with its share of the budget, a share being the budget over the days of the month', () => {
    expect(dayRatio(100_000, 3_000_000, 30)).toBe(1)
    expect(dayRatio(50_000, 3_000_000, 30)).toBe(0.5)
    expect(dayRatio(300_000, 3_000_000, 30)).toBe(3)
    expect(dayRatio(0, 3_000_000, 30)).toBe(0)
  })

  it('has nothing to compare with when there is no budget, and does not divide by no days', () => {
    expect(dayRatio(100, 0, 30)).toBe(0)
    expect(Number.isFinite(dayRatio(100, 3_000_000, 0))).toBe(true)
  })
})
