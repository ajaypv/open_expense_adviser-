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
    expect(html).not.toContain('Daily average')
  })

  it('compares with the month before in words and an arrow, not colour alone', () => {
    const more = render({ deltaPct: 12 })
    expect(text(more)).toContain('12% more than September')
    expect(text(render({ deltaPct: -8 }))).toContain('8% less than September')
    expect(text(render({ deltaPct: 0 }))).toContain('The same as September')
    expect(text(render({ deltaPct: 12, partial: true }))).toContain('than the same days in September')
  })
})

describe('SpendingOverview: the two facts under it', () => {
  it('shows the daily average and how many expenses were logged, side by side', () => {
    const t = text(render())
    expect(t).toContain('Daily average')
    expect(t).toContain('₹24')
    expect(t).toContain('Expenses logged')
    expect(render()).toMatch(/<dl[^>]*grid-cols-2/)
  })
})

describe('SpendingOverview: the budget', () => {
  it('explains what setting one does, rather than just inviting it', () => {
    const t = text(render())
    expect(t).toContain('Your budget')
    expect(t).toContain('Set a monthly budget to see how much you have left.')
    expect(render()).toContain('>Set budget<')
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
    expect(html.indexOf('aria-label="Recent spending"')).toBeGreaterThan(html.indexOf('Your budget'))
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
