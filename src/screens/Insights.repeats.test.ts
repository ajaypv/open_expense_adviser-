import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { makeLedger } from '../test/ledger'
import { Insights } from './Insights'

const today = new Date(2026, 9, 28) // Wed 28 Oct 2026

const categories: Category[] = [
  { id: 1, name: 'Transport', color: 'var(--s3)' },
  { id: 2, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 3, name: 'Rent & Housing', color: 'var(--s6)' },
]

let id = 0
const tx = (merchant: string, date: string, rupees: number, categoryId = 1): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId, merchant, note: '',
  date, paymentMethod: '', source: 'manual', createdAt: id,
})
const days = (merchant: string, list: number[], rupees: number, month = '2026-10', categoryId = 1) =>
  list.map((d) => tx(merchant, `${month}-${String(d).padStart(2, '0')}`, rupees, categoryId))

function render(txs: Transaction[], month = '2026-10') {
  const ledger = makeLedger({
    txs,
    expenses: txs,
    income: [],
    categories,
    expenseCategories: categories,
    categoryById: new Map(categories.map((c) => [c.id, c])),
    budgetMinor: null,
  })
  return renderToStaticMarkup(createElement(Insights, { ledger, month, onMonth: () => {}, today, onOpenSettings: () => {} }))
}

// October: the bus twelve times (₹20 each), lunch three times, rent once; rent also paid in July and August.
const october = [
  ...days('BMTC bus fare', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 20),
  ...days('Lunch', [1, 2, 3], 120, '2026-10', 2),
  ...days('Rent', [5], 6000, '2026-10', 3),
  ...days('Rent', [5], 6000, '2026-08', 3),
  ...days('Rent', [5], 6000, '2026-07', 3),
]

describe('Insights: Keeps coming back', () => {
  it('has a section for what you paid for again and again', () => {
    const html = render(october)
    expect(html).toContain('Keeps coming back')
    expect(html).toContain('What you paid for again and again in October.')
  })

  it('lists each with how many times, how often and the usual amount, most often first', () => {
    const html = render(october)
    const section = html.slice(html.indexOf('Keeps coming back'))
    expect(section).toContain('BMTC bus fare')
    expect(section).toContain('12 times')
    expect(section).toContain('12 times, almost every day, usually ₹20')
    expect(section).toContain('usually ₹20')
    expect(section.indexOf('BMTC bus fare')).toBeLessThan(section.indexOf('Lunch'))
    expect(section.indexOf('Lunch')).toBeLessThan(section.indexOf('Rent'))
  })

  it('names a monthly bill as one that comes every month', () => {
    const section = render(october)
    expect(section.slice(section.indexOf('Keeps coming back'))).toContain('Every month')
  })

  it('adds up what they came to and what share of the spending it is', () => {
    const html = render(october)
    // 240 + 360 + 6,000 = ₹6,600 of ₹6,600 spent in October, all of it.
    expect(html).toContain('Together ₹6,600, 100% of what you spent in October.')
  })

  it('draws the count as text a screen reader can use, and the badge as decoration', () => {
    const html = render(october)
    expect(html).toContain('12×')
    expect(html).toMatch(/aria-hidden="true"[^>]*>12×/)
  })

  it('is left out when nothing repeats', () => {
    const html = render([tx('Uber', '2026-10-01', 230), tx('Cafe', '2026-10-02', 450), tx('Lunch', '2026-10-03', 120)])
    expect(html).not.toContain('Keeps coming back')
  })

  it('follows the month being looked at', () => {
    const html = render([...days('Tea', [1, 2, 3, 4], 10, '2026-09', 2), ...days('Uber', [1], 200, '2026-10')], '2026-09')
    expect(html).toContain('What you paid for again and again in September.')
    expect(html).toContain('Tea')
    expect(render([...days('Tea', [1, 2, 3, 4], 10, '2026-09', 2), ...days('Uber', [1], 200, '2026-10')], '2026-10')).not.toContain('Keeps coming back')
  })

  it('never prints a broken number', () => {
    expect(render(october)).not.toMatch(/NaN|undefined|Infinity/)
  })
})
