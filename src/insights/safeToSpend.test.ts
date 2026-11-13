import { describe, expect, it } from 'vitest'
import { safeToSpend } from './safeToSpend'

const nov13 = new Date(2026, 10, 13) // 18 days left in a 30-day month, today included
const rupees = (n: number) => n * 100

describe('safeToSpend: what is left of today', () => {
  it('spreads what is left over the days from today to the end of the month, today included', () => {
    // ₹1,20,000 budget, ₹55,000 spent, none of it today: ₹65,000 over 18 days.
    const s = safeToSpend({ budgetMinor: rupees(120_000), spentMinor: rupees(55_000), todayMinor: 0, today: nov13 })!
    expect(s.daysLeft).toBe(18)
    expect(s.perDayMinor).toBe(rupees(3_611))
    expect(s.leftTodayMinor).toBe(rupees(3_611))
    expect(s.over).toBe(false)
  })

  it('takes off what today has already spent, without making the other days smaller for it', () => {
    // ₹1,100 of the ₹55,000 was spent today, so ₹53,900 was spent before it and ₹66,100 was left when the day began.
    const s = safeToSpend({ budgetMinor: rupees(120_000), spentMinor: rupees(55_000), todayMinor: rupees(1_100), today: nov13 })!
    expect(s.perDayMinor).toBe(rupees(3_672))
    expect(s.leftTodayMinor).toBe(rupees(2_572))
  })

  it('has nothing left of today once the day has taken its share, and says so rather than going below zero', () => {
    const s = safeToSpend({ budgetMinor: rupees(120_000), spentMinor: rupees(60_000), todayMinor: rupees(5_000), today: nov13 })!
    expect(s.perDayMinor).toBe(rupees(3_611)) // ₹65,000 was left when the day began
    expect(s.leftTodayMinor).toBe(0)
    expect(s.over).toBe(false)
  })

  it('rounds down to a whole currency unit, so it never promises a paisa it has not got', () => {
    const s = safeToSpend({ budgetMinor: rupees(10_000), spentMinor: 0, todayMinor: 0, today: new Date(2026, 10, 1) })!
    expect(s.perDayMinor % 100).toBe(0)
    expect(s.perDayMinor * 30).toBeLessThanOrEqual(rupees(10_000))
  })

  it('has the whole day to spend it on the first day, and one day on the last', () => {
    expect(safeToSpend({ budgetMinor: rupees(30_000), spentMinor: 0, todayMinor: 0, today: new Date(2026, 10, 1) })!.daysLeft).toBe(30)
    const last = safeToSpend({ budgetMinor: rupees(30_000), spentMinor: rupees(28_000), todayMinor: 0, today: new Date(2026, 10, 30) })!
    expect(last.daysLeft).toBe(1)
    expect(last.perDayMinor).toBe(rupees(2_000))
  })

  it('is over when the budget is used up, with nothing left of today', () => {
    const s = safeToSpend({ budgetMinor: rupees(120_000), spentMinor: rupees(124_200), todayMinor: rupees(500), today: new Date(2026, 10, 26) })!
    expect(s.over).toBe(true)
    expect(s.leftTodayMinor).toBe(0)
    expect(s.perDayMinor).toBe(0)
  })

  it('says nothing with no budget', () => {
    expect(safeToSpend({ budgetMinor: 0, spentMinor: 100, todayMinor: 0, today: nov13 })).toBeNull()
  })
})

describe('safeToSpend: where the month stands against an even pace', () => {
  it('puts the even pace where an even month would be by the end of today', () => {
    // 13 of 30 days of ₹1,20,000 is ₹52,000.
    const s = safeToSpend({ budgetMinor: rupees(120_000), spentMinor: rupees(55_000), todayMinor: 0, today: nov13 })!
    expect(s.evenPaceMinor).toBe(rupees(52_000))
    expect(s.paceDiffMinor).toBe(rupees(3_000))
    expect(s.paceShare).toBeCloseTo(0.4333, 3)
    expect(s.spentShare).toBeCloseTo(0.4583, 3)
  })

  it('is below the pace when less than an even month has been spent', () => {
    const s = safeToSpend({ budgetMinor: rupees(120_000), spentMinor: rupees(40_000), todayMinor: 0, today: nov13 })!
    expect(s.paceDiffMinor).toBe(-rupees(12_000))
  })

  it('keeps both shares to the bar, however far over', () => {
    const s = safeToSpend({ budgetMinor: rupees(10_000), spentMinor: rupees(30_000), todayMinor: 0, today: nov13 })!
    expect(s.spentShare).toBe(1)
    expect(s.paceShare).toBeLessThanOrEqual(1)
  })
})
