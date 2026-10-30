import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PaceChart, PaceTable } from './PaceChart'

// Amounts are stored in hundredths, so ₹100 is 10000.
const rupees = (n: number) => n * 100

/** Running totals for a 31-day month: ₹100 on day 1, ₹50 more on day 3, ₹200 more on day 28; null after day 28. */
const october = Array.from({ length: 31 }, (_, i) => {
  if (i > 27) return null
  return rupees(100 + (i >= 2 ? 50 : 0) + (i >= 27 ? 200 : 0))
})
/** A previous month that was steadier: ₹10 a day for 30 days. */
const september = Array.from({ length: 30 }, (_, i) => rupees((i + 1) * 10))

const base = { monthKey: '2026-10', currentLabel: 'October', previousLabel: 'September', currency: 'INR', lastDay: 28 }
const table = (props: Partial<Parameters<typeof PaceTable>[0]> = {}) =>
  renderToStaticMarkup(createElement(PaceTable, { ...base, current: october, previous: september, ...props }))

describe('PaceTable', () => {
  it('lists the newest day first with its weekday, that day’s spend and the running total', () => {
    const html = table()
    expect(html.indexOf('>28<')).toBeLessThan(html.indexOf('>27<')) // newest first
    expect(html).toContain('Wed') // 28 Oct 2026 is a Wednesday
    expect(html).toContain('₹200') // spent on day 28
    expect(html).toContain('₹350') // running total on day 28
  })

  it('sets each total against the same day last month in words, not just colour', () => {
    const html = table()
    expect(html).toContain('₹70 more') // day 28: 350 against 280
    expect(html).toContain('₹120 less') // day 27: 150 against 270
  })

  it('shows 10 days first and offers the rest', () => {
    const html = table()
    expect(html).toContain('Show all 28 days')
    expect((html.match(/<tr class="border-t/g) ?? []).length).toBe(10) // body rows; the header row is separate
  })

  it('drops the comparison columns when there is no previous month', () => {
    const html = table({ previous: [] })
    expect(html).not.toContain('September')
    expect(html).not.toMatch(/more|less/)
    expect(html).toContain('October total')
  })

  it('has no NaN or undefined anywhere', () => {
    expect(table()).not.toMatch(/NaN|undefined|Infinity/)
    expect(table({ previous: [] })).not.toMatch(/NaN|undefined|Infinity/)
  })
})

describe('PaceChart table toggle', () => {
  it('starts closed: the table is not built until the user opens it', () => {
    const html = renderToStaticMarkup(
      createElement(PaceChart, { ...base, current: october, previous: september, budgetMinor: null }),
    )
    expect(html).toContain('Show as table')
    expect(html).not.toContain('<table')
  })
})

describe('PaceChart: months of different lengths', () => {
  const august = Array.from({ length: 31 }, (_, i) => rupees((i + 1) * 10))
  const septemberTotals = Array.from({ length: 30 }, (_, i) => rupees((i + 1) * 8))

  /** The x of every point on the grey line for last month; the chart is 0 to 100 across. */
  const greyXs = (html: string) => {
    const d = html.match(/<path d="([^"]+)"[^>]*stroke="var\(--other\)"/)?.[1] ?? ''
    return [...d.matchAll(/[ML]([\d.]+) [\d.]+/g)].map((m) => Number(m[1]))
  }

  it('keeps last month’s line inside the chart when that month had more days', () => {
    const html = renderToStaticMarkup(
      createElement(PaceChart, { ...base, monthKey: '2026-09', currentLabel: 'September', previousLabel: 'August', current: septemberTotals, previous: august, lastDay: 30 }),
    )
    const xs = greyXs(html)
    expect(xs.length).toBeGreaterThan(0)
    expect(Math.max(...xs)).toBeLessThanOrEqual(100)
  })

  it('still draws the whole of a shorter previous month', () => {
    const february = Array.from({ length: 28 }, (_, i) => rupees((i + 1) * 5))
    const html = renderToStaticMarkup(
      createElement(PaceChart, { ...base, previous: february, current: october, lastDay: 28 }),
    )
    expect(greyXs(html)).toHaveLength(28)
  })
})
