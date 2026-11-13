import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { safeToSpend } from '../insights/safeToSpend'
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

  it('sets the big number large in the serif display voice, which runs between 40 and 52 px', () => {
    expect(render()).toContain('type-display')
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

  it('says what the budget is in that line, when there is one, so the bar above it needs no figures of its own', () => {
    expect(text(render({ budgetMinor: 3_000_000 }))).toContain('Budget ₹30,000 · 2 expenses · about ₹24 a day')
    expect(text(render())).not.toContain('Budget')
  })

  it('is left-aligned under the amount, with or without a budget, and not centred under anything', () => {
    expect(render({ budgetMinor: 3_000_000 })).not.toMatch(/text-center/)
    expect(render()).not.toMatch(/text-center/)
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

  it('shows the budget as one plain bar under the amount, with where that leaves you in words, and no half circle', () => {
    const html = render({ budgetMinor: 3_000_000 })
    // The amount, then the bar and the words, then the line, then the days.
    expect(html.indexOf('₹680')).toBeLessThan(html.indexOf('role="meter"'))
    expect(html.indexOf('role="meter"')).toBeLessThan(html.indexOf('Budget ₹30,000'))
    expect(html.indexOf('Budget ₹30,000')).toBeLessThan(html.indexOf('aria-label="Recent spending"'))
    expect(text(html)).toContain('₹29,320 left')
    expect(html).not.toContain('<svg viewBox')
    expect(html).not.toContain('<line ')
  })

  it('says what is spent once, with the same big amount whether or not there is a budget', () => {
    for (const budgetMinor of [null, 3_000_000]) {
      const html = render({ budgetMinor })
      expect(html).toContain('type-display')
      expect(html.match(/Spent so far in October/g)).toHaveLength(1)
    }
  })

  it('leaves out the bar when there is no budget', () => {
    expect(render()).not.toContain('role="meter"')
  })

  it('leaves out the bar’s own row of figures, since the amount is already above it', () => {
    const t = text(render({ budgetMinor: 3_000_000 }))
    expect(t).not.toContain('of ₹30,000')
    expect(t).not.toMatch(/\d+%/)
  })

  it('says nothing was spent, in words, with the budget’s bar under it, when there is a budget but no spending', () => {
    const html = render({ budgetMinor: 3_000_000, totalMinor: 0, expenseCount: 0 })
    expect(html).toContain('role="meter"')
    expect(text(html)).toContain('Nothing spent in October yet.')
    expect(text(html)).toContain('₹30,000 left')
    expect(text(html)).not.toContain('about')
  })

  it('shows the comparison with the month before under the line, to the left like the rest', () => {
    const html = render({ budgetMinor: 3_000_000, deltaPct: 12 })
    expect(text(html)).toContain('12% more than September')
    expect(/<p class="mt-3 flex[^"]*"/.exec(html)![0]).not.toContain('justify-center')
    expect(html.indexOf('about ₹24 a day')).toBeLessThan(html.indexOf('12% more'))
  })

  it('shows Today, Yesterday and Last 7 days as one quiet row, divided by thin lines, not as boxes', () => {
    const html = render()
    expect(html).toMatch(/aria-label="Recent spending" class="[^"]*divide-x/)
    expect(html).not.toMatch(/aria-label="Today: [^"]*" class="[^"]*bg-surface-2/)
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

describe('SpendingOverview: what you can spend today', () => {
  const rupees = (n: number) => n * 100
  const nov13 = new Date(2026, 10, 13)
  const calm = (over: Partial<Parameters<typeof safeToSpend>[0]> = {}, props: Partial<typeof base> = {}) =>
    render({
      monthName: 'November',
      totalMinor: rupees(55_000),
      budgetMinor: rupees(120_000),
      safe: safeToSpend({ budgetMinor: rupees(120_000), spentMinor: rupees(55_000), todayMinor: 0, today: nov13, ...over }),
      ...props,
    } as never)

  it('leads with how much can be spent today, not with what has been spent', () => {
    const html = calm()
    expect(text(html)).toContain('You can spend today')
    expect(html).toContain('data-testid="safe-today"')
    expect(html).toContain('₹3,611')
    expect(text(html)).not.toContain('Spent so far in November')
  })

  it('says in a line what that means for the month', () => {
    expect(text(calm())).toContain('Spend up to this each day and you finish November on budget.')
  })

  it('says what today has already taken, and what is left of its share', () => {
    const html = calm({ spentMinor: rupees(55_000), todayMinor: rupees(1_100) })
    expect(text(html)).toContain('About ₹3,672 a day keeps November on budget. You have already spent ₹1,100 today.')
    expect(html).toContain('₹2,572')
  })

  it('says so when the day’s share is used', () => {
    const html = calm({ spentMinor: rupees(60_000), todayMinor: rupees(5_000) })
    expect(html).toContain('₹0')
    expect(text(html)).toContain("s ₹3,611 is used. Spending more takes from the days ahead.")
  })

  it('draws the month as one bar of how much of the budget is spent, with a mark where an even month would be', () => {
    const html = calm()
    expect(html).toMatch(/role="img"[^>]*aria-label="₹55,000 spent of ₹120,000\. An even month would be at ₹52,000 by now\."/)
    expect(html).toContain('width:45.83')
    expect(html).toContain('data-pace')
    expect(html).toContain('left:43.33')
    expect(text(html)).toContain('₹55,000 spent')
    expect(text(html)).toContain('of ₹120,000')
  })

  it('says in words where the month stands against that mark: more, less or right on it', () => {
    expect(text(calm())).toContain('The blue mark is where an even month would be by now. You have spent ₹3,000 more than that.')
    expect(text(calm({ spentMinor: rupees(40_000) }))).toContain('You have spent ₹12,000 less than that.')
    expect(text(calm({ spentMinor: rupees(52_500) }))).toContain('You are right on it.')
  })

  it('keeps Today, Yesterday and Last 7 days under it', () => {
    expect(text(calm())).toContain('Today')
    expect(text(calm())).toContain('Last 7 days')
  })

  it('is the old headline when the month is over, when there is no budget or when the budget is used up', () => {
    expect(text(calm({}, { isCurrent: false }))).toContain('Spent in November')
    expect(text(render({ budgetMinor: null, safe: null }))).toContain('Spent so far in October')
    const over = render({ safe: safeToSpend({ budgetMinor: rupees(10_000), spentMinor: rupees(12_000), todayMinor: 0, today: nov13 }), budgetMinor: rupees(10_000) })
    expect(text(over)).toContain('Spent so far in October')
    expect(over).toContain('role="meter"')
  })
})
