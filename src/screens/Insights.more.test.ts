import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TrendBars } from '../charts/TrendBars'
import type { Category, Transaction } from '../db/schema'
import { makeLedger, type TestLedger } from '../test/ledger'
import { Insights } from './Insights'

const today = new Date(2026, 9, 28) // Wed 28 Oct 2026

const categories: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Transport', color: 'var(--s3)' },
  { id: 3, name: 'Income', color: 'var(--ink-2)' },
]

let id = 0
const tx = (date: string, amount: number, categoryId = 1, over: Partial<Transaction> = {}): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: amount * 100, currency: 'INR', categoryId, merchant: '', note: '', date,
  paymentMethod: '', source: 'manual', createdAt: id, ...over,
})
const salary = (date: string, amount: number) => tx(date, amount, 3, { kind: 'income', merchant: 'Employer' })

function render(rows: Transaction[], month: string, over: Partial<TestLedger> = {}, props: Record<string, unknown> = {}) {
  const expenses = rows.filter((t) => t.kind === 'expense')
  const ledger = makeLedger({
    txs: rows, expenses, income: rows.filter((t) => t.kind === 'income'), categories, expenseCategories: categories.slice(0, 2),
    categoryById: new Map(categories.map((c) => [c.id, c])), budgetMinor: null, ...over,
  })
  return renderToStaticMarkup(createElement(Insights, { ledger, month, onMonth: () => {}, today, onOpenSettings: () => {}, ...props }))
}

/** What a person reads: tags gone, entities decoded, spaces tidied. */
const text = (html: string) =>
  html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')

const october = [tx('2026-10-05', 450, 1, { merchant: 'Cafe' }), tx('2026-10-20', 230, 2, { merchant: 'Uber' })]

describe('the headline', () => {
  it('says what was spent in the month before saying what it was spent on', () => {
    const t = text(render(october, '2026-10'))
    expect(t).toContain('You spent ₹680 in October')
    expect(t).toContain('Food & Dining was the biggest part, 66%')
  })

  it('has a headline for a past month with nothing before it', () => {
    expect(text(render([tx('2026-05-05', 400)], '2026-05'))).toContain('You spent ₹400 in May')
  })
})

describe('a month with no expenses', () => {
  it('says that, and offers the latest month that has some, when other months do', () => {
    const html = render([tx('2026-09-05', 450)], '2026-10')
    expect(text(html)).toContain('No expenses logged in October.')
    expect(html).not.toContain('Insights appear once')
    expect(text(html)).toContain('Go to September')
  })

  it('still invites a first expense when nothing has ever been logged', () => {
    expect(text(render([], '2026-10'))).toContain('Nothing to report for October yet.')
  })

  it('still shows money received in a month where nothing was spent', () => {
    const html = render([salary('2026-10-01', 50_000)], '2026-10')
    expect(text(html)).toContain('Money in and out')
    expect(text(html)).toContain('₹50,000')
  })
})

describe('the order of the page', () => {
  it('puts where the money went straight after the first numbers, before the extras', () => {
    const rows = [
      ...october,
      tx('2026-09-03', 300, 1),
      tx('2026-09-10', 200, 2),
      salary('2026-10-01', 5_000),
    ]
    const html = render(rows, '2026-10', { budgetMinor: 3_000_000, categoryBudgets: new Map([[2, 150_000]]) })
    const at = (s: string) => html.indexOf(s)
    expect(at('Where it went')).toBeGreaterThan(0)
    expect(at('Where it went')).toBeLessThan(at('What changed'))
    expect(at('Where it went')).toBeLessThan(at('Budgets by category'))
    expect(at('Where it went')).toBeLessThan(at('Money in and out'))
  })

  it('lets a category be opened to see its expenses', () => {
    const html = render(october, '2026-10', {}, { onPickCategory: () => {} })
    expect(html).toContain('Show these expenses')
  })

  it('says what each part is for', () => {
    const t = text(render(october, '2026-10'))
    expect(t).toContain('Where your October spending went, biggest first.')
  })
})

describe('the month-end guess', () => {
  it('calls the projection a rough guess, not a promise', () => {
    const t = text(render(october, '2026-10'))
    expect(t).toContain('At this rate')
    expect(t).toContain('rough guess')
    expect(t).not.toContain('On pace for')
  })
})

describe('money in and out', () => {
  const rows = [tx('2026-09-05', 1000), salary('2026-09-01', 5000), ...october]

  it('speaks of "so far" this month, and gives no rate while the month is unfinished', () => {
    const t = text(render([...october, salary('2026-10-01', 2000)], '2026-10'))
    expect(t).toContain('So far this month you kept ₹1,320')
    expect(t).not.toMatch(/\d+% of what came in/)
  })

  it('gives the rate for a finished month', () => {
    const t = text(render(rows, '2026-09'))
    expect(t).toContain('You kept ₹4,000, 80% of what came in')
  })
})

describe('other currencies', () => {
  it('warns when some amounts are being counted at face value, and says what to do', () => {
    const html = render(october, '2026-10', { missingRates: ['USD'] })
    expect(text(html)).toContain('USD')
    expect(text(html)).toContain('face value')
    expect(html).toContain('Set exchange rates')
  })

  it('says nothing when every currency has a rate', () => {
    expect(text(render(october, '2026-10'))).not.toContain('face value')
  })
})

describe('places', () => {
  it('counts visits as "times", which also fits a subscription', () => {
    const rows = [tx('2026-10-01', 100, 1, { merchant: 'Cafe' }), tx('2026-10-02', 100, 1, { merchant: 'Cafe' }), tx('2026-10-03', 50, 2, { merchant: 'Uber' })]
    const t = text(render(rows, '2026-10'))
    expect(t).toContain('2 times')
    expect(t).toContain('1 time')
    expect(t).not.toContain('visit')
  })
})

describe('TrendBars wording', () => {
  const trend = { categoryId: 1, months: [0, 0, 1000_00, 1000_00, 1000_00, 2000_00], changePct: 100, averageMinor: 1000_00 }
  const render2 = (over: Record<string, unknown> = {}, t = trend) =>
    text(renderToStaticMarkup(createElement(TrendBars, { trends: [t], categoryById: new Map(categories.map((c) => [c.id, c])), currency: 'INR', monthName: 'October', ...over })))

  it('names the month and the usual amount it is measured against', () => {
    const t = render2()
    expect(t).toContain('₹2,000 in October')
    expect(t).toContain('100% more than your usual ₹1,000')
  })

  it('says why there is no comparison yet, and not that it is a month in progress when it is not', () => {
    expect(render2({}, { ...trend, changePct: null, averageMinor: 0 })).toContain('Not enough earlier months to compare yet')
  })

  it('says the month is still going when it is', () => {
    expect(render2({ inProgress: true }, { ...trend, changePct: null })).toContain('₹2,000 so far in October')
  })

  it('reads oldest to newest', () => {
    expect(render2()).toContain('Oldest to newest')
  })
})
