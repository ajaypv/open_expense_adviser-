import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { dayInsights, dayView, versusAverage } from './days'

let id = 0
const spend = (date: string, rupees: number, categoryId = 1, merchant = 'x'): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId, merchant, note: '',
  date, paymentMethod: '', source: 'manual', createdAt: id,
})

// October 2026 starts on a Thursday: the 3rd and 4th are the first weekend, the 10th and 11th the next.
const MONTH = '2026-10'

describe('dayView: the days', () => {
  it('has an entry for every day of the month, with the day, the date and whether it has happened', () => {
    const v = dayView([], MONTH, 10, null)
    expect(v.days).toHaveLength(31)
    expect(v.days[0]).toMatchObject({ day: 1, date: '2026-10-01', future: false })
    expect(v.days[9]).toMatchObject({ day: 10, future: false })
    expect(v.days[10]).toMatchObject({ day: 11, future: true })
    expect(v.elapsed).toBe(10)
  })

  it('counts the whole month as having happened for a finished month', () => {
    const v = dayView([], '2026-09', null, null)
    expect(v.days).toHaveLength(30)
    expect(v.elapsed).toBe(30)
    expect(v.days.some((d) => d.future)).toBe(false)
  })

  it('adds up each day and keeps its expenses, biggest first', () => {
    const v = dayView([spend('2026-10-05', 100, 1, 'Cafe'), spend('2026-10-05', 300, 1, 'Uber'), spend('2026-10-05', 200, 1, 'Lunch')], MONTH, 10, null)
    const d = v.days[4]
    expect(d.minor).toBe(60_000)
    expect(d.txs.map((t) => t.merchant)).toEqual(['Uber', 'Lunch', 'Cafe'])
  })

  it('ignores anything outside the month', () => {
    const v = dayView([spend('2026-09-30', 999), spend('2026-11-01', 999), spend('2026-10-02', 50)], MONTH, 10, null)
    expect(v.totalMinor).toBe(5_000)
  })

  it('marks Saturdays and Sundays', () => {
    const v = dayView([], MONTH, null, null)
    expect(v.days.filter((d) => d.weekend).map((d) => d.day)).toEqual([3, 4, 10, 11, 17, 18, 24, 25, 31])
  })
})

describe('dayView: the figures', () => {
  it('averages over the days that have happened, not the whole month', () => {
    // ₹1,000 by the 10th is ₹100 a day.
    const v = dayView([spend('2026-10-02', 1000)], MONTH, 10, null)
    expect(v.totalMinor).toBe(100_000)
    expect(v.averageMinor).toBe(10_000)
  })

  it('finds the biggest day, the later one on a tie', () => {
    const v = dayView([spend('2026-10-02', 500), spend('2026-10-06', 500), spend('2026-10-03', 100)], MONTH, 10, null)
    expect(v.peak?.day).toBe(6)
  })

  it('has no biggest day when nothing was spent', () => {
    expect(dayView([], MONTH, 10, null).peak).toBeNull()
  })

  it('counts days with nothing spent, and the run of them up to the last day that has happened', () => {
    const v = dayView([spend('2026-10-02', 10), spend('2026-10-06', 10)], MONTH, 10, null)
    // Spent on the 2nd and 6th; nothing on the other eight.
    expect(v.quietDays).toBe(8)
    expect(v.quietNow).toBe(4) // the 7th to the 10th
  })

  it('has no run of quiet days when the last day had spending', () => {
    expect(dayView([spend('2026-10-10', 10)], MONTH, 10, null).quietNow).toBe(0)
  })

  it('compares what a weekend day costs with a weekday, once there are two of each', () => {
    // Elapsed to the 12th: weekends are 3, 4, 10, 11 and weekdays the other eight.
    const txs = [spend('2026-10-03', 400), spend('2026-10-04', 400), spend('2026-10-10', 400), spend('2026-10-11', 400), ...[1, 2, 5, 6, 7, 8, 9, 12].map((d) => spend(`2026-10-${String(d).padStart(2, '0')}`, 200))]
    const v = dayView(txs, MONTH, 12, null)
    expect(v.weekendRatio).toBeCloseTo(2, 5)
  })

  it('has no weekend comparison without two of each kind of day, or when one kind was free', () => {
    expect(dayView([spend('2026-10-01', 100)], MONTH, 3, null).weekendRatio).toBeNull() // one weekend day so far
    expect(dayView([spend('2026-10-03', 100), spend('2026-10-04', 100)], MONTH, 12, null).weekendRatio).toBeNull() // weekdays free
  })

  it('takes the daily share of the budget and counts the days above it', () => {
    // ₹31,000 over 31 days is ₹1,000 a day.
    const v = dayView([spend('2026-10-02', 1200), spend('2026-10-03', 1000), spend('2026-10-04', 800)], MONTH, 10, 3_100_000)
    expect(v.limitMinor).toBe(100_000)
    expect(v.overDays).toBe(1)
  })

  it('has no daily share without a budget', () => {
    const v = dayView([spend('2026-10-02', 1200)], MONTH, 10, null)
    expect(v.limitMinor).toBeNull()
    expect(v.overDays).toBe(0)
  })
})

describe('dayView: what each day was made of', () => {
  it('lists the biggest categories of the month as the legend, biggest first', () => {
    const v = dayView([spend('2026-10-02', 100, 1), spend('2026-10-03', 500, 2), spend('2026-10-04', 300, 3)], MONTH, 10, null)
    expect(v.legend.map((l) => l.categoryId)).toEqual([2, 3, 1])
  })

  it('folds categories past the fifth into one "everything else" slice', () => {
    const txs = [1, 2, 3, 4, 5, 6, 7].map((c) => spend('2026-10-02', 1000 - c * 10, c))
    const v = dayView(txs, MONTH, 10, null)
    expect(v.legend).toHaveLength(6)
    expect(v.legend.at(-1)).toMatchObject({ categoryId: null, minor: (940 + 930) * 100 })
    // Both of the smallest land in that one slice on the day.
    expect(v.days[1].slices.at(-1)).toMatchObject({ categoryId: null })
  })

  it('stacks every day in the order of the legend, so a category keeps its place from day to day', () => {
    const v = dayView(
      [spend('2026-10-02', 100, 1), spend('2026-10-02', 500, 2), spend('2026-10-03', 400, 2), spend('2026-10-03', 50, 1)],
      MONTH,
      10,
      null,
    )
    expect(v.days[1].slices.map((s) => s.categoryId)).toEqual([2, 1])
    expect(v.days[2].slices.map((s) => s.categoryId)).toEqual([2, 1])
  })

  it('has slices that add up to the day', () => {
    const v = dayView([spend('2026-10-02', 100, 1), spend('2026-10-02', 250, 2)], MONTH, 10, null)
    expect(v.days[1].slices.reduce((a, s) => a + s.minor, 0)).toBe(v.days[1].minor)
  })
})

describe('versusAverage', () => {
  it('says nothing was spent for a free day', () => {
    expect(versusAverage(0, 10_000)).toBe('Nothing spent')
  })

  it('says how far above or below, and close to it', () => {
    expect(versusAverage(14_000, 10_000)).toBe('40% above your average')
    expect(versusAverage(5_000, 10_000)).toBe('50% below your average')
    expect(versusAverage(10_500, 10_000)).toBe('About your average')
    expect(versusAverage(9_500, 10_000)).toBe('About your average')
  })

  it('uses a multiple for a day at least twice the average', () => {
    expect(versusAverage(23_000, 10_000)).toBe('2.3× your average')
    expect(versusAverage(20_000, 10_000)).toBe('2× your average')
  })

  it('has nothing to compare with when the average is nothing', () => {
    expect(versusAverage(5_000, 0)).toBe('')
  })
})

describe('dayInsights', () => {
  const money = (m: number) => `₹${m / 100}`
  const label = (d: string) => d
  const insights = (txs: Transaction[], last = 12, budget: number | null = null) => dayInsights(dayView(txs, MONTH, last, budget), money, label)

  it('says nothing when nothing was spent', () => {
    expect(insights([])).toEqual([])
  })

  it('names the biggest day, tied to that day so it can be shown', () => {
    const [first] = insights([spend('2026-10-06', 500), spend('2026-10-02', 100)])
    expect(first).toEqual({ key: 'peak', text: 'Biggest day: 2026-10-06, ₹500', day: 6 })
  })

  it('says how many days were above the budget share, or that none were', () => {
    const over = insights([spend('2026-10-02', 1200), spend('2026-10-03', 1500)], 12, 3_100_000)
    expect(over.find((i) => i.key === 'budget')?.text).toBe('2 days above your daily budget of ₹1000')
    const none = insights([spend('2026-10-02', 200)], 12, 3_100_000)
    expect(none.find((i) => i.key === 'budget')?.text).toBe('No day above your daily budget of ₹1000')
    expect(insights([spend('2026-10-02', 200)]).some((i) => i.key === 'budget')).toBe(false)
  })

  it('says weekends cost more, or weekdays do, when the gap is clear', () => {
    const weekdays = [1, 2, 5, 6, 7, 8, 9, 12]
    const dated = (d: number, r: number) => spend(`2026-10-${String(d).padStart(2, '0')}`, r)
    const heavyWeekends = [3, 4, 10, 11].map((d) => dated(d, 300)).concat(weekdays.map((d) => dated(d, 200)))
    expect(insights(heavyWeekends).find((i) => i.key === 'weekend')?.text).toBe('Weekend days cost you about 50% more than weekdays')
    const heavyWeekdays = [3, 4, 10, 11].map((d) => dated(d, 100)).concat(weekdays.map((d) => dated(d, 200)))
    expect(insights(heavyWeekdays).find((i) => i.key === 'weekday')?.text).toBe('Weekdays cost you about 100% more than weekend days')
  })

  it('says nothing about weekends when the gap is small', () => {
    const dated = (d: number) => spend(`2026-10-${String(d).padStart(2, '0')}`, 200)
    const even = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(dated)
    const found = insights(even).map((i) => i.key)
    expect(found).not.toContain('weekend')
    expect(found).not.toContain('weekday')
  })

  it('says how long it has been since anything was spent, or else how many days were quiet', () => {
    expect(insights([spend('2026-10-02', 100)], 6).find((i) => i.key === 'quiet-now')?.text).toBe('Nothing spent for the last 4 days')
    expect(insights([spend('2026-10-02', 100), spend('2026-10-06', 100)], 6).find((i) => i.key === 'quiet')?.text).toBe('4 days with nothing spent')
    expect(insights([1, 2, 3, 4, 5].map((d) => spend('2026-10-0' + d, 100)), 5).some((i) => i.key.startsWith('quiet'))).toBe(false)
  })

  it('says a single quiet day in the singular', () => {
    const txs = [1, 3, 4].map((d) => spend(`2026-10-0${d}`, 100))
    expect(insights(txs, 4).find((i) => i.key === 'quiet')?.text).toBe('1 day with nothing spent')
  })

  it('gives at most four', () => {
    const dated = (d: number, r: number) => spend(`2026-10-${String(d).padStart(2, '0')}`, r)
    const txs = [3, 4, 10, 11].map((d) => dated(d, 500)).concat([1, 2, 5, 6].map((d) => dated(d, 100)))
    expect(insights(txs, 12, 3_100_000).length).toBeLessThanOrEqual(4)
  })
})

describe('dayInsights: a big gap between weekends and weekdays', () => {
  it('says how many times as much from three times up, since a percentage in the thousands is hard to read', () => {
    const view = { totalMinor: 1, peak: null, limitMinor: null, overDays: 0, quietNow: 0, quietDays: 0, weekendRatio: 15 } as unknown as Parameters<typeof dayInsights>[0]
    const text = dayInsights(view, (m) => String(m), (d) => d).find((i) => i.key === 'weekend')?.text
    expect(text).toBe('Weekend days cost you about 15× what weekdays do')
    const small = dayInsights({ ...view, weekendRatio: 3.46 } as typeof view, (m) => String(m), (d) => d).find((i) => i.key === 'weekend')?.text
    expect(small).toBe('Weekend days cost you about 3.5× what weekdays do')
    const back = dayInsights({ ...view, weekendRatio: 1 / 4 } as typeof view, (m) => String(m), (d) => d).find((i) => i.key === 'weekday')?.text
    expect(back).toBe('Weekdays cost you about 4× what weekend days do')
  })
})
