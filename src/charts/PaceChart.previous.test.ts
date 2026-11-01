import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PaceChart, PaceTable } from './PaceChart'

// Amounts are stored in hundredths, so ₹100 is 10000.
const rupees = (n: number) => n * 100

/** Running totals for a month of `days` days where nothing was spent until `from`, then `amount` on that day. */
const lateSpender = (days: number, from: number, amount: number) =>
  Array.from({ length: days }, (_, i) => (i + 1 >= from ? rupees(amount) : 0))

const base = { monthKey: '2026-11', currentLabel: 'November', previousLabel: 'October', currency: 'INR', lastDay: 1 }
const render = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(PaceChart, { ...base, ...over } as never))
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

/** The x of every point on a line, from its path; the chart is 0 to 100 across. */
const xs = (html: string, stroke: string) => {
  const d = html.match(new RegExp(`<path d="([^"]+)"[^>]*stroke="${stroke.replace(/[()]/g, '\\$&')}"`))?.[1] ?? ''
  return [...d.matchAll(/[ML]([\d.]+) [\d.]+/g)].map((m) => Number(m[1]))
}

// November so far: ₹2,794 on day 1. October: nothing until the 29th, then ₹12,520 by the 31st.
const november = Array.from({ length: 30 }, (_, i) => (i === 0 ? rupees(2794) : null))
const october = lateSpender(31, 29, 12520)

describe('PaceChart: last month is never mistaken for nothing', () => {
  it('shows what last month came to in all, not the zero of its first day', () => {
    const t = text(render({ current: november, previous: october }))
    expect(t).toContain('October (whole month) ₹12,520')
    expect(t).not.toContain('October ₹0')
  })

  it('counts every day of the longer month: spending on the 31st is part of the total', () => {
    const withLastDay = [...lateSpender(30, 29, 10000), rupees(12520)] // ₹10,000 by the 29th, ₹12,520 by the 31st
    const t = text(render({ current: november, previous: withLastDay }))
    expect(t).toContain('October (whole month) ₹12,520')
  })

  it('draws the whole of the longer month, with this month stopping where it is up to', () => {
    const html = render({ current: november, previous: october })
    expect(Math.max(...xs(html, 'var(--other)'))).toBe(100) // last month runs the full width
    expect(xs(html, 'var(--other)')).toHaveLength(31) // every one of its 31 days
    expect(Math.max(...xs(html, 'var(--s1)'))).toBeLessThan(100) // this month has 30 days, so it ends a day short
  })

  it('labels the end of the axis with the length of the longer month', () => {
    const html = render({ current: november, previous: october })
    expect(html).toMatch(/<span>31<\/span>\s*<\/div>/)
  })

  it('does not trim a shorter previous month, and still ends this month at the right edge', () => {
    const september = lateSpender(30, 10, 500)
    const thirtyOne = Array.from({ length: 31 }, (_, i) => (i === 0 ? rupees(100) : null))
    const html = render({ monthKey: '2026-10', currentLabel: 'October', previousLabel: 'September', current: thirtyOne, previous: september, lastDay: 1 })
    expect(Math.max(...xs(html, 'var(--s1)'))).toBeLessThanOrEqual(100)
    expect(xs(html, 'var(--other)')).toHaveLength(30)
    expect(text(html)).toContain('September (whole month) ₹500')
  })

  it('says nothing about last month when there is none, as in the first month of use', () => {
    const t = text(render({ current: november, previous: [] }))
    expect(t).not.toContain('came to')
    expect(t).not.toContain('October')
  })

  it('gives the table the whole of last month too', () => {
    const html = renderToStaticMarkup(
      createElement(PaceTable, { current: november, previous: october, lastDay: 1, monthKey: '2026-11', currentLabel: 'November', previousLabel: 'October', currency: 'INR' }),
    )
    expect(html).not.toMatch(/NaN|undefined/)
  })
})

describe('PaceTable: last month in the table', () => {
  const table = (over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(PaceTable, { current: november, previous: october, lastDay: 1, monthKey: '2026-11', currentLabel: 'November', previousLabel: 'October', currency: 'INR', ...over } as never),
    )

  it('names the last-month column for what it is: the running total by that day, not a total', () => {
    const html = table()
    expect(html).toContain('October by then')
    expect(html).not.toContain('October total')
  })

  it('ends with last month in full, so its real spending is always in the table', () => {
    const html = table()
    expect(html).toMatch(/<tfoot>/)
    expect(text(html)).toContain('October, whole month ₹12,520')
  })

  it('counts every day of a longer last month in that figure', () => {
    const withLastDay = [...lateSpender(30, 29, 10000), rupees(12520)]
    expect(text(table({ previous: withLastDay }))).toContain('October, whole month ₹12,520')
  })

  it('still shows the day-1 comparison against zero, now that it is plainly "by then"', () => {
    const t = text(table())
    expect(t).toContain('October by then')
    expect(t).toContain('₹2,794 more')
  })

  it('has no last-month column or whole-month row in the first month of use', () => {
    const html = table({ previous: [] })
    expect(html).not.toContain('October')
    expect(html).not.toContain('<tfoot>')
  })
})
