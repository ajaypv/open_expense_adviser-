import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { makeLedger } from '../test/ledger'
import { Insights } from './Insights'

const today = new Date(2026, 9, 28) // Wed 28 Oct 2026

const categories: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Transport', color: 'var(--s3)' },
  { id: 3, name: 'Shopping', color: 'var(--s4)' },
]

let id = 0
const tx = (date: string, amount: number, categoryId: number, merchant = ''): Transaction => ({
  id: ++id,
  kind: 'expense',
  amountMinor: amount * 100,
  currency: 'INR',
  categoryId,
  merchant,
  note: '',
  date,
  paymentMethod: '',
  source: 'manual',
  createdAt: id,
})

function render(txs: Transaction[], month: string, budgetMinor: number | null = 3_000_000, extra: Transaction[] = []) {
  const all = [...txs, ...extra]
  const ledger = makeLedger({
    txs: all,
    expenses: all.filter((t) => t.kind !== 'income'),
    income: all.filter((t) => t.kind === 'income'),
    categories,
    expenseCategories: categories,
    categoryById: new Map(categories.map((c) => [c.id, c])),
    budgetMinor,
  })
  return renderToStaticMarkup(
    createElement(Insights, { ledger, month, onMonth: () => {}, today, onOpenSettings: () => {} }),
  )
}

const noBrokenNumbers = (html: string) => {
  expect(html).not.toMatch(/NaN|undefined|Infinity/)
}

describe('Insights screen', () => {
  it('explains the empty state instead of rendering empty charts', () => {
    const html = render([], '2026-10')
    expect(html).toContain('Nothing to report for October yet.')
    expect(html).not.toContain('Spending pace')
    noBrokenNumbers(html)
  })

  it('works in the first month of use: one line, no comparison blocks', () => {
    const html = render([tx('2026-10-05', 450, 1, 'Cafe'), tx('2026-10-20', 230, 2, 'Uber')], '2026-10')
    expect(html).toContain('Spending pace')
    expect(html).toContain('Food &amp; Dining')
    expect(html).not.toContain('What changed')
    // No previous-month line, legend row or column. The month picker's list of months is hidden until opened.
    expect(html.replace(/<dialog[\s\S]*?<\/dialog>/g, '')).not.toContain('September')
    noBrokenNumbers(html)
  })

  it('shows every block when there is a previous month and enough data', () => {
    const txs = [
      tx('2026-09-03', 300, 1, 'Cafe'),
      tx('2026-09-10', 900, 3, 'Amazon'),
      tx('2026-10-02', 450, 1, 'Cafe'),
      tx('2026-10-05', 700, 1, 'Swiggy'),
      tx('2026-10-12', 230, 2, 'Uber'),
      tx('2026-10-19', 1500, 3, 'Amazon'),
      tx('2026-10-26', 120, 1, 'Cafe'),
    ]
    // A budget near the data keeps its line on the chart (a far-off one is left out, see below).
    const html = render(txs, '2026-10', 400_000)
    for (const text of ['Spending pace', 'What changed', 'Busiest days', 'Where it went', 'Places you spend most', 'Budget']) {
      expect(html).toContain(text)
    }
    expect(html).toContain('At this rate')
    expect(html).toContain('under budget')
    noBrokenNumbers(html)
  })

  it('compares a finished month in full and gives no month-end projection', () => {
    const txs = [
      tx('2026-08-04', 1000, 1, 'Cafe'),
      tx('2026-09-02', 500, 1, 'Cafe'),
      tx('2026-09-09', 500, 2, 'Uber'),
      tx('2026-09-15', 500, 1, 'Cafe'),
      tx('2026-09-20', 500, 3, 'Amazon'),
      tx('2026-09-28', 500, 1, 'Swiggy'),
    ]
    const html = render(txs, '2026-09')
    expect(html).toContain('You spent')
    expect(html).not.toContain('At this rate')
    noBrokenNumbers(html)
  })

  it('analyses money sent only: received money never counts as spending', () => {
    const spent = [tx('2026-10-05', 450, 1, 'Cafe'), tx('2026-10-20', 230, 2, 'Uber')]
    const salary: Transaction = { ...tx('2026-10-01', 80000, 1, 'Employer'), kind: 'income' }
    const withSalary = render(spent, '2026-10', null, [salary])
    // The only difference a salary makes is the "Money in and out" section; every spending block is identical.
    expect(withSalary).toContain('Money in and out')
    const withoutThatSection = withSalary.replace(/<section aria-labelledby="savings-h".*?<\/section>/, '')
    expect(withoutThatSection).toBe(render(spent, '2026-10', null))
    expect(withSalary).not.toContain('Employer')
    // A month with only received money is an empty spending month.
    expect(render([], '2026-10', null, [salary])).toContain('Nothing to report for October yet.')
  })

  it('stays well-formed with no budget and a very large budget that would flatten the chart', () => {
    const txs = [tx('2026-10-02', 100, 1, 'A'), tx('2026-10-03', 100, 2, 'B')]
    noBrokenNumbers(render(txs, '2026-10', null))
    const huge = render(txs, '2026-10', 100_000_000_00)
    noBrokenNumbers(huge)
    expect(huge).not.toContain('Budget ₹') // out of range, so no budget line on the chart
  })
})
