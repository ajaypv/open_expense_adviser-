import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SpendingOverview } from './SpendingOverview'

const base = {
  monthName: 'October',
  isCurrent: true,
  totalMinor: 68_000,
  deltaPct: null as number | null,
  partial: false,
  prevName: 'September',
  dailyAverageMinor: 2_400,
  expenseCount: 2,
  dailyMinor: Array.from({ length: 31 }, (_, i) => (i === 27 ? 50_000 : i === 26 ? 18_000 : 0)),
  todayDay: 28 as number | null,
  budgetMinor: null as number | null,
  currency: 'INR',
  periods: [
    { id: 'today', label: 'Today', amountMinor: 50_000, from: '2026-10-28', to: '2026-10-28' },
    { id: 'yesterday', label: 'Yesterday', amountMinor: 0, from: '2026-10-27', to: '2026-10-27' },
    { id: 'last7', label: 'Last 7 days', amountMinor: 68_000, from: '2026-10-22', to: '2026-10-28' },
  ],
  privacy: false,
  onTogglePrivacy: () => {},
  onSetBudget: () => {},
  onPickPeriod: () => {},
}
const render = (over: Partial<typeof base> = {}) => renderToStaticMarkup(createElement(SpendingOverview, { ...base, ...over }))
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

describe('SpendingOverview: the one number', () => {
  it('leads with what was spent so far this month, in plain words', () => {
    expect(text(render())).toContain('Spent so far in October')
    expect(render()).toContain('₹680')
  })

  it('says "Spent in" for a month that is over', () => {
    expect(text(render({ isCurrent: false }))).toContain('Spent in October')
  })

  it('keeps the big number prominent but no longer huge: between 36 and 40 px', () => {
    expect(render()).toContain('text-[clamp(2.25rem,10vw,2.5rem)]')
  })

  it('says so when nothing was spent, instead of showing a zero', () => {
    const html = render({ totalMinor: 0, expenseCount: 0 })
    expect(text(html)).toContain('Nothing spent in October yet.')
    expect(text(html)).not.toContain('about')
  })

  it('compares with the month before in words and an arrow, not colour alone', () => {
    const more = render({ deltaPct: 12 })
    expect(text(more)).toContain('12% more than September')
    expect(text(render({ deltaPct: -8 }))).toContain('8% less than September')
    expect(text(render({ deltaPct: 0 }))).toContain('The same as September')
    expect(text(render({ deltaPct: 12, partial: true }))).toContain('than the same days in September')
  })
})

describe('SpendingOverview: the line under it', () => {
  it('says in one plain sentence how many expenses there are and what a day comes to, not as two labelled figures', () => {
    const t = text(render())
    expect(t).toContain('2 expenses · about ₹24 a day')
    expect(t).not.toContain('Daily average')
    expect(t).not.toContain('Expenses logged')
    expect(render()).not.toContain('<dl')
  })

  it('says expense, not expenses, for one', () => {
    expect(text(render({ expenseCount: 1 }))).toContain('1 expense · about')
    expect(text(render({ expenseCount: 1 }))).not.toContain('1 expenses')
  })

  it('leaves out what a day comes to when it rounds to nothing, rather than say about ₹0 a day', () => {
    const t = text(render({ dailyAverageMinor: 0 }))
    expect(t).toContain('2 expenses')
    expect(t).not.toContain('a day')
  })

  it('sits under the amount and above the comparison and the recent days', () => {
    const html = render({ deltaPct: 12 })
    expect(html.indexOf('₹680')).toBeLessThan(html.indexOf('expenses · about'))
    expect(html.indexOf('expenses · about')).toBeLessThan(html.indexOf('12% more'))
    expect(html.indexOf('12% more')).toBeLessThan(html.indexOf('aria-label="Recent spending"'))
  })

  it('is centred under the half circle when there is a budget, and left under the plain amount when there is not', () => {
    expect(render({ budgetMinor: 3_000_000 })).toMatch(/text-center">2 expenses/)
    expect(render()).not.toMatch(/text-center">2 expenses/)
  })
})

describe('SpendingOverview: the budget', () => {
  it('leaves the invitation to set one out of the overview: it is a separate block lower down the page', () => {
    const t = text(render())
    expect(t).not.toContain('Your budget')
    expect(t).not.toContain('Set a monthly budget')
    expect(render()).not.toContain('>Set budget<')
  })

  it('shows progress once there is one, and no invitation', () => {
    const html = render({ budgetMinor: 3_000_000 })
    expect(html).toContain('role="meter"')
    expect(text(html)).not.toContain('Set a monthly budget')
    expect(text(html)).toContain('₹29,320 left')
  })
})

describe('SpendingOverview: today, yesterday and the week, kept small', () => {
  it('shows them as compact tiles inside the overview, each with its figure', () => {
    const html = render()
    expect(html).toContain('aria-label="Recent spending"')
    for (const label of ['Today', 'Yesterday', 'Last 7 days']) expect(html).toContain(`>${label}<`)
    expect(html).toContain('aria-label="Recent spending"')
  })

  it('makes the budget the headline once there is one, as a half circle with the figure in it, since that answers "am I okay?"', () => {
    const html = render({ budgetMinor: 3_000_000 })
    expect(html.indexOf('role="meter"')).toBeLessThan(html.indexOf('expenses · about'))
    expect(html.indexOf('role="meter"')).toBeLessThan(html.indexOf('aria-label="Recent spending"'))
    // What the figure is of is said once, just above the meter, and ahead of the facts under it.
    expect(html.indexOf('Spent so far in October')).toBeLessThan(html.indexOf('role="meter"'))
    expect(html.indexOf('Spent so far in October')).toBeLessThan(html.indexOf('expenses · about'))
    expect(html.match(/Spent so far in October/g)).toHaveLength(1)
    expect(html.match(/₹680/g)?.length).toBeGreaterThanOrEqual(1)
  })

  it('draws one bar for each day of the month in the meter', () => {
    const html = render({ budgetMinor: 3_000_000 })
    expect(html.match(/<line /g)).toHaveLength(31)
  })

  it('keeps the plain headline when there is no budget, and no meter', () => {
    const html = render()
    expect(html).not.toContain('role="meter"')
    expect(html).toContain('text-[clamp(2.25rem,10vw,2.5rem)]')
  })

  it('says nothing was spent inside the meter when there is a budget but no spending', () => {
    const html = render({ budgetMinor: 3_000_000, totalMinor: 0, expenseCount: 0 })
    expect(html).toContain('role="meter"')
    expect(text(html)).toContain('Nothing spent in October yet.')
    expect(text(html)).toContain('₹30,000 left')
    expect(text(html)).not.toContain('about')
  })

  it('shows the comparison with the month before under the meter, centred', () => {
    const html = render({ budgetMinor: 3_000_000, deltaPct: 12 })
    expect(text(html)).toContain('12% more than September')
    expect(html).toMatch(/justify-center[^"]*"[^>]*><span[^>]*>.*12% more/)
  })

  it('has no day tiles for a month that is over', () => {
    expect(render({ isCurrent: false, periods: [] })).not.toContain('aria-label="Recent spending"')
  })

  it('opens the transactions behind a figure, and leaves a day with nothing spent as plain text', () => {
    const html = render()
    expect(html).toContain('aria-label="Today: ₹500. See these transactions"')
    expect(html).toContain('aria-label="Last 7 days: ₹680. See these transactions"')
    expect(html).toContain('aria-label="Yesterday: ₹0"')
    expect(html).not.toContain('Yesterday: ₹0. See these transactions')
  })

  it('leaves them out for a month that is over, since they measure from today', () => {
    expect(render({ isCurrent: false, periods: [] })).not.toContain('Recent spending')
  })

  it('uses a smaller figure than the headline, so it does not compete with it', () => {
    const html = render()
    expect(html).not.toMatch(/Recent spending[\s\S]*text-xl font-bold/)
  })
})

describe('SpendingOverview: hiding amounts', () => {
  it('has a button that says what it will do, and whether it is on', () => {
    expect(render()).toContain('aria-label="Hide amounts"')
    expect(render({ privacy: true })).toContain('aria-label="Show amounts"')
    expect(render({ privacy: true })).toContain('aria-pressed="true"')
  })
})
