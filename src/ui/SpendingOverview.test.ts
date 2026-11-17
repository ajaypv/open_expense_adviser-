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
    const html = render({ totalMinor: 0 })
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

describe('SpendingOverview: the row under it', () => {
  it('has no sentences: what a day comes to, in four words, and no count of expenses', () => {
    const t = text(render())
    expect(t).toContain('₹24 a day')
    expect(t).not.toContain('about')
    expect(t).not.toContain('expenses')
    expect(t).not.toContain('Daily average')
    expect(render()).not.toContain('<dl')
  })

  it('leaves out what a day comes to when it rounds to nothing, rather than say ₹0 a day', () => {
    expect(text(render({ dailyAverageMinor: 0 }))).not.toContain('a day')
  })

  it('compares with the month before in one pill, with the short name of the month, and says the whole of it to a screen reader', () => {
    const html = render({ deltaPct: 12, partial: true })
    const pill = /<p data-delta[^>]*>([\s\S]*?)<\/p>/.exec(html)![1]
    expect(text(pill)).toContain('12% vs Sep')
    expect(pill).toMatch(/<span class="sr-only">12% more than the same days in September<\/span>/)
    expect(pill).toMatch(/<span aria-hidden="true">12% vs Sep<\/span>/)
    expect(text(render({ deltaPct: -8 }))).toContain('8% vs Sep')
  })

  it('says "Same as" with no arrow when it is the same', () => {
    const html = render({ deltaPct: 0 })
    expect(html).not.toContain('data-delta')
    expect(text(html)).toContain('Same as Sep')
  })

  it('has no pill with nothing to compare with', () => {
    expect(render({ deltaPct: null })).not.toContain('data-delta')
  })

  it('sits under the amount and above the recent days, the pill to the left and the day figure to the right', () => {
    const html = render({ deltaPct: 12 })
    expect(html.indexOf('₹680')).toBeLessThan(html.indexOf('data-delta'))
    expect(html.indexOf('data-delta')).toBeLessThan(html.indexOf('a day'))
    expect(html.indexOf('a day')).toBeLessThan(html.indexOf('aria-label="Recent spending"'))
    expect(render({ deltaPct: 12 })).not.toMatch(/text-center/)
  })

  it('says what the budget is at the right of the bar’s line, with a small flag in place of the word (a screen reader still hears it), and not at all when there is none', () => {
    const html = render({ budgetMinor: 3_000_000 })
    expect(text(html)).toContain('Budget ₹30,000')
    expect(html).toContain('<span class="sr-only">Budget</span><span aria-hidden="true" data-budget-flag="true">')
    expect(text(render())).not.toContain('Budget')
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
    expect(html.indexOf('role="meter"')).toBeLessThan(html.indexOf('data-budget-flag'))
    expect(html.indexOf('data-budget-flag')).toBeLessThan(html.indexOf('aria-label="Recent spending"'))
    expect(text(html)).toContain('Budget ₹30,000')
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
    const html = render({ budgetMinor: 3_000_000, totalMinor: 0 })
    expect(html).toContain('role="meter"')
    expect(text(html)).toContain('Nothing spent in October yet.')
    expect(text(html)).toContain('₹30,000 left')
    expect(text(html)).not.toContain('about')
  })

  it('shows the comparison with the month before under the bar, to the left like the rest, and the day figure after it', () => {
    const html = render({ budgetMinor: 3_000_000, deltaPct: 12 })
    expect(text(html)).toContain('12% more than September')
    expect(html.indexOf('role="meter"')).toBeLessThan(html.indexOf('data-delta'))
    expect(html.indexOf('data-delta')).toBeLessThan(html.indexOf('₹24'))
  })

  it('shows Today, Yesterday and Last 7 days as three even tiles, each its own soft card, not a row split by lines', () => {
    const html = render()
    expect(html).toMatch(/aria-label="Recent spending" class="[^"]*grid-cols-3 gap-2/)
    expect(html).not.toMatch(/aria-label="Recent spending" class="[^"]*divide-x/)
    expect(html).toMatch(/aria-label="Today: [^"]*" class="[^"]*rounded-2xl bg-surface-2/)
    expect(html).toMatch(/aria-label="Yesterday: ₹0" class="[^"]*rounded-2xl bg-surface-2/)
  })

  it('leads with a small round arrow for money going out, beside what was spent', () => {
    const html = render()
    expect(html).toMatch(/data-icon="arrowUp"[^>]*class="[^"]*rounded-full[^"]*"/)
    expect(html.indexOf('data-icon="arrowUp"')).toBeLessThan(html.indexOf('Spent so far in'))
  })

  it('sets what a day comes to in bold, and the words after it as they were', () => {
    const html = render()
    expect(html).toMatch(/<b class="num text-ink">₹[\d,]+<\/b> a day/)
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
