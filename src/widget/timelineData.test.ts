import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { buildTimelineWidgetData, heatColor, TIMELINE_WIDGET_DAYS } from './timelineData'

const money = (minor: number) => `₹${minor / 100}`
const today = new Date(2026, 10, 10, 15, 40) // Tue 10 Nov 2026
const tx = (id: number, date: string, rupees: number, over: Partial<Transaction> = {}): Transaction => ({
  id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '', date, paymentMethod: '', source: 'manual', createdAt: id, ...over,
})

describe('heatColor', () => {
  it('is the Timeline’s cool teal for little or nothing, amber in the middle and coral for the most', () => {
    expect(heatColor(0)).toBe('#139aa6')
    expect(heatColor(0.5)).toBe('#b57600')
    expect(heatColor(1)).toBe('#d9452e')
  })

  it('moves from one to the next without a jump', () => {
    const channels = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
    const [r0] = channels(heatColor(0))
    const [r1] = channels(heatColor(0.25))
    const [r2] = channels(heatColor(0.5))
    expect(r0).toBeLessThan(r1)
    expect(r1).toBeLessThan(r2)
  })

  it('keeps to the ends for a share outside 0 to 1', () => {
    expect(heatColor(-1)).toBe(heatColor(0))
    expect(heatColor(7)).toBe(heatColor(1))
  })
})

describe('buildTimelineWidgetData', () => {
  const expenses = [tx(1, '2026-11-10', 450), tx(2, '2026-11-10', 230), tx(3, '2026-11-09', 1360), tx(4, '2026-11-07', 680)]

  it('has a row for each of the last days, newest first, the quiet ones too', () => {
    const data = buildTimelineWidgetData(expenses, money, today)
    expect(data.rows).toHaveLength(4)
    expect(data.rows.map((r) => r.chip)).toEqual(['10', '9', '8', '7'])
  })

  it('names today and yesterday, then gives the weekday and date', () => {
    const rows = buildTimelineWidgetData(expenses, money, today).rows
    expect(rows[0].text).toMatch(/^Today · /)
    expect(rows[1].text).toMatch(/^Yesterday · /)
    expect(rows[2].text).toMatch(/Sun/)
    expect(rows[2].text).toMatch(/8/)
    expect(rows[2].text).toMatch(/Nov/)
  })

  it('counts the expenses of a day, in words, and says so when there are none', () => {
    const rows = buildTimelineWidgetData(expenses, money, today).rows
    expect(rows[0].text).toBe('Today · 2 expenses')
    expect(rows[1].text).toBe('Yesterday · 1 expense')
    expect(rows[2].text).toMatch(/· Nothing spent$/)
  })

  it('gives each day’s total in the app’s amounts', () => {
    const rows = buildTimelineWidgetData(expenses, money, today).rows
    expect(rows.map((r) => r.amount)).toEqual(['₹680', '₹1360', '₹0', '₹680'])
  })

  it('sizes each bar against the biggest day, and colours it by the same share', () => {
    const rows = buildTimelineWidgetData(expenses, money, today).rows
    expect(rows[1].share).toBe(1)
    expect(rows[0].share).toBe(0.5)
    expect(rows[2].share).toBe(0)
    expect(rows[1].color).toBe(heatColor(1))
    expect(rows[2].color).toBe(heatColor(0))
    expect(rows[0].color).toBe(heatColor(0.5))
  })

  it('totals the days it shows in the title', () => {
    expect(buildTimelineWidgetData(expenses, money, today).title).toBe('Last 4 days · ₹2720')
  })

  it('shows only the last six days however far back the spending goes', () => {
    const many = [tx(1, '2026-10-01', 100), tx(2, '2026-11-10', 100)]
    const data = buildTimelineWidgetData(many, money, today)
    expect(data.rows).toHaveLength(TIMELINE_WIDGET_DAYS)
    expect(data.title).toBe('Last 6 days · ₹100')
  })

  it('says Today alone when today is the only day with anything behind it', () => {
    const data = buildTimelineWidgetData([tx(1, '2026-11-10', 450)], money, today)
    expect(data.rows).toHaveLength(1)
    expect(data.title).toBe('Today · ₹450')
  })

  it('leaves out income, deleted expenses and days to come, as the Timeline does', () => {
    const data = buildTimelineWidgetData(
      [tx(1, '2026-11-10', 100), tx(2, '2026-11-10', 5000, { kind: 'income' }), tx(3, '2026-11-10', 700, { deletedAt: 5 }), tx(4, '2026-11-12', 900)],
      money,
      today,
    )
    expect(data.rows[0].amount).toBe('₹100')
    expect(data.rows).toHaveLength(1)
  })

  it('has no rows, and a plain title, when nothing has been spent yet', () => {
    const data = buildTimelineWidgetData([], money, today)
    expect(data.rows).toEqual([])
    expect(data.title).toBe('Timeline')
  })

  it('says when it was worked out', () => {
    const updated = buildTimelineWidgetData(expenses, money, today).updated
    expect(updated).toMatch(/^Updated /)
    expect(updated).toMatch(/Nov/)
    expect(updated).toMatch(/10/)
    expect(updated).toMatch(/3:40/)
  })

  it('has a share of zero for every day when none had anything', () => {
    const data = buildTimelineWidgetData([tx(1, '2026-11-08', 0)], money, today)
    expect(data.rows.every((r) => r.share === 0)).toBe(true)
  })
})
