import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { buildTimeline, daysBetween, timelineRows } from './timeline'

const today = new Date(2026, 10, 6) // Fri 6 Nov 2026

let id = 0
const tx = (date: string, rupees: number, categoryId = 1, over: Partial<Transaction> = {}): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId, merchant: 'Shop', note: '', date,
  paymentMethod: '', source: 'manual', createdAt: id, ...over,
})

describe('daysBetween', () => {
  it('counts calendar days, across a month and a clock change', () => {
    expect(daysBetween('2026-10-30', '2026-11-06')).toBe(7)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-11-06', '2026-11-06')).toBe(0)
  })
})

describe('buildTimeline', () => {
  it('has a day for every date from today back, the quiet ones too, newest first', () => {
    const t = buildTimeline([tx('2026-11-06', 100), tx('2026-11-03', 250)], today, 30)
    expect(t.days.map((d) => d.date)).toEqual(['2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03'])
    expect(t.days.map((d) => d.daysAgo)).toEqual([0, 1, 2, 3])
    expect(t.days.map((d) => d.totalMinor / 100)).toEqual([100, 0, 0, 250])
  })

  it('stops at the first day anything was spent, or at the span', () => {
    const e = [tx('2026-10-01', 10), tx('2026-11-06', 10)]
    expect(buildTimeline(e, today, 100).days).toHaveLength(37)
    expect(buildTimeline(e, today, 10).days).toHaveLength(10)
  })

  it('says whether there is more before the days shown', () => {
    const e = [tx('2026-10-01', 10), tx('2026-11-06', 10)]
    expect(buildTimeline(e, today, 10).earlier).toBe(true)
    expect(buildTimeline(e, today, 37).earlier).toBe(false)
  })

  it('divides a day by category, biggest first, with the expenses latest first', () => {
    const t = buildTimeline([tx('2026-11-05', 100, 1), tx('2026-11-05', 400, 2), tx('2026-11-05', 50, 1)], today, 5)
    const d = t.days[1]
    expect(d.totalMinor).toBe(55_000)
    expect(d.count).toBe(3)
    expect(d.parts).toEqual([
      { categoryId: 2, minor: 40_000, count: 1 },
      { categoryId: 1, minor: 15_000, count: 2 },
    ])
    expect(d.txs.map((x) => x.amountMinor / 100)).toEqual([50, 400, 100])
  })

  it('counts only money sent, and nothing from the future or the trash', () => {
    const t = buildTimeline(
      [tx('2026-11-06', 100), tx('2026-11-06', 900, 1, { kind: 'income' }), tx('2026-11-07', 500), tx('2026-11-06', 70, 1, { deletedAt: 1 })],
      today,
      5,
    )
    expect(t.days).toHaveLength(1)
    expect(t.days[0].totalMinor).toBe(10_000)
  })

  it('has no days when nothing was spent', () => {
    const t = buildTimeline([], today, 30)
    expect(t.days).toEqual([])
    expect(t.maxMinor).toBe(0)
  })

  it('finds the biggest day, to scale the bars', () => {
    expect(buildTimeline([tx('2026-11-06', 100), tx('2026-11-04', 700)], today, 30).maxMinor).toBe(70_000)
  })

})

describe('timelineRows', () => {
  it('puts a month heading at the top and where the month changes', () => {
    const t = buildTimeline([tx('2026-11-06', 10), tx('2026-11-01', 10), tx('2026-10-31', 10)], today, 30)
    const rows = timelineRows(t.days)
    expect(rows.filter((r) => r.kind === 'month').map((r) => (r as { month: string }).month)).toEqual(['2026-11', '2026-10'])
    expect(rows[0].kind).toBe('month')
  })

  it('folds a run of quiet days into one line', () => {
    const t = buildTimeline([tx('2026-11-06', 10), tx('2026-11-01', 10)], today, 30)
    const rows = timelineRows(t.days)
    const quiet = rows.filter((r) => r.kind === 'quiet')
    expect(quiet).toEqual([{ kind: 'quiet', key: 'q-2026-11-05', from: '2026-11-02', to: '2026-11-05', count: 4 }])
  })

  it('keeps today as a row of its own even when nothing was spent', () => {
    const t = buildTimeline([tx('2026-11-04', 10)], today, 30)
    const day = timelineRows(t.days).filter((r) => r.kind === 'day')
    expect(day.map((r) => (r as { key: string }).key)).toEqual(['2026-11-06', '2026-11-04'])
  })

  it('does not run a quiet line across the start of a month', () => {
    const t = buildTimeline([tx('2026-11-06', 10), tx('2026-10-29', 10)], today, 30)
    const quiet = timelineRows(t.days).filter((r) => r.kind === 'quiet') as { count: number; from: string; to: string }[]
    expect(quiet.map((q) => [q.from, q.to, q.count])).toEqual([
      ['2026-11-01', '2026-11-05', 5],
      ['2026-10-30', '2026-10-31', 2],
    ])
  })
})

describe('buildTimeline: money received', () => {
  const salary = (date: string, rupees: number, over: Partial<Transaction> = {}) => tx(date, rupees, 1, { kind: 'income', merchant: 'Employer', ...over })

  it('tells what was received on each day, and keeps it out of the bars and the scale', () => {
    const t = buildTimeline([tx('2026-11-06', 100)], today, 5, [salary('2026-11-05', 80_000), salary('2026-11-06', 500)])
    expect(t.days[0].receivedMinor).toBe(50_000)
    expect(t.days[1].receivedMinor).toBe(8_000_000)
    expect(t.days[1].received.map((x) => x.merchant)).toEqual(['Employer'])
    expect(t.days[1].totalMinor).toBe(0)
    expect(t.maxMinor).toBe(10_000)
  })

  it('counts only money received, and nothing from the future or the trash', () => {
    const t = buildTimeline([tx('2026-11-06', 100)], today, 5, [
      salary('2026-11-06', 10),
      tx('2026-11-06', 900), // money sent, not received
      salary('2026-11-07', 500),
      salary('2026-11-06', 70, { deletedAt: 1 }),
    ])
    expect(t.days[0].receivedMinor).toBe(1_000)
  })

  it('reaches back to the first day money came in', () => {
    const t = buildTimeline([tx('2026-11-06', 10)], today, 30, [salary('2026-11-01', 100)])
    expect(t.days).toHaveLength(6)
  })

  it('has nothing received on a day when nothing was', () => {
    const t = buildTimeline([tx('2026-11-06', 10)], today, 30)
    expect(t.days[0].receivedMinor).toBe(0)
    expect(t.days[0].received).toEqual([])
  })

  it('makes a day with only money received a row of its own, not part of a run of quiet days', () => {
    const t = buildTimeline([tx('2026-11-06', 10), tx('2026-11-01', 10)], today, 30, [salary('2026-11-03', 100)])
    expect(timelineRows(t.days).map((r) => r.kind)).toEqual(['month', 'day', 'quiet', 'day', 'quiet', 'day'])
  })
})
