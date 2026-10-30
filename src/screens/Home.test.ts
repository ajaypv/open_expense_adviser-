import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Category, Goal, Transaction } from '../db/schema'
import { balanceFrom } from '../insights/aggregates'
import { makeLedger } from '../test/ledger'
import type { Suggestion } from '../insights/suggestions'
import { Home } from './Home'

const today = new Date(2026, 9, 28)

const categories: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Income', color: 'var(--ink-2)' },
]

let id = 0
const tx = (kind: Transaction['kind'], date: string, amount: number, categoryId: number, merchant: string): Transaction => ({
  id: ++id, kind, amountMinor: amount * 100, currency: 'INR', categoryId, merchant, note: '', date, paymentMethod: '', source: 'manual', createdAt: id,
})

const txs = [
  tx('income', '2026-10-01', 80000, 2, 'Employer'),
  tx('expense', '2026-10-05', 450, 1, 'Cafe'),
  tx('expense', '2026-10-20', 230, 1, 'Uber'),
]

const regular: Suggestion = {
  key: 'expense:cafe', kind: 'expense', merchant: 'Cafe', amountMinor: 45000, categoryId: 1,
  paymentMethod: '', reason: 'Usually on Wednesdays', count: 3,
}

function render(balanceShown: boolean, opening = 100_000_00, suggestions: Suggestion[] = [], month = '2026-10') {
  const summary = balanceFrom(txs, opening)
  const ledger = makeLedger({
    txs,
    expenses: txs.filter((t) => t.kind !== 'income'),
    income: txs.filter((t) => t.kind === 'income'),
    categories,
    expenseCategories: categories.slice(0, 1),
    categoryById: new Map(categories.map((c) => [c.id, c])),
    balanceSet: true,
    estimatedBalanceMinor: summary.estimatedMinor,
    netMinor: summary.netMinor,
  })
  return renderToStaticMarkup(
    createElement(Home, {
      ledger, month, onMonth: () => {}, today, onPickCategory: () => {}, onEdit: () => {},
      onExample: () => {}, onOpenSettings: () => {}, onSeeAll: () => {}, balanceShown, onToggleBalance: () => {},
      suggestions, onSuggestion: () => {},
    }),
  )
}

describe('Home', () => {
  it('counts only money sent as spending, and shows money received separately', () => {
    const html = render(false)
    expect(html).toContain('₹680') // 450 + 230 sent; the salary is not spending
    expect(html).toContain('Sent in October')
    expect(html).toContain('Received in October')
    expect(html).toContain('₹80,000')
  })

  it('keeps the estimated balance out of the page until the user reveals it', () => {
    const hidden = render(false)
    expect(hidden).toContain('Show balance')
    expect(hidden).toContain('••••••')
    // opening 1,00,000 + 80,000 received - 680 sent = 1,79,320
    expect(hidden).not.toMatch(/1,79,320|179,320/)

    const shown = render(true)
    expect(shown).toContain('Hide balance')
    expect(shown).toMatch(/1,79,320|179,320/)
  })

  it('shows suggestions on Home only when it is given some, and only for the current month', () => {
    const html = render(false, 0, [regular])
    expect(html).toContain('Suggested for now')
    expect(html).toContain('Usually on Wednesdays')
    expect(html).toContain('₹450')
    expect(render(false, 0, [])).not.toContain('Suggested for now') // placement is elsewhere, or off
    expect(render(false, 0, [regular], '2026-09')).not.toContain('Suggested for now') // a past month
  })

  it('lists received money in Latest with a plus sign, not just spending', () => {
    const html = render(false)
    expect(html).toContain('Employer')
    expect(html).toContain('+₹80,000')
  })
})

describe('Home goals button', () => {
  const renderWith = (goals: Goal[], list = txs) =>
    renderToStaticMarkup(
      createElement(Home, {
        ledger: makeLedger({
          txs: list, expenses: list.filter((t) => t.kind === 'expense'), income: list.filter((t) => t.kind === 'income'), categories,
          expenseCategories: categories.slice(0, 1), categoryById: new Map(categories.map((c) => [c.id, c])), goals,
        }),
        month: '2026-10', onMonth: () => {}, today, onPickCategory: () => {}, onEdit: () => {}, onExample: () => {},
        onOpenSettings: () => {}, onSeeAll: () => {}, balanceShown: false, onToggleBalance: () => {}, suggestions: [],
        onSuggestion: () => {}, logNudge: false, onAdd: () => {}, onOpenGoals: () => {},
      }),
    )

  it('puts the goals button in a header, at the right of the date and above the month switcher', () => {
    const dateTitle = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(today)
    const html = renderWith([])
    expect(html).toContain('<header')
    expect(html.indexOf(dateTitle)).toBeLessThan(html.indexOf('aria-label="Goals. None yet"'))
    expect(html.indexOf('aria-label="Goals. None yet"')).toBeLessThan(html.indexOf('aria-label="Previous month"'))
  })

  it('says on the button how much is saved overall', () => {
    expect(renderWith([{ id: 1, name: 'Goa trip', targetMinor: 2_500_000, savedMinor: 500_000, createdAt: 1 }])).toContain('aria-label="Goals. 1 goal, 20% saved"')
  })

  it('keeps the goals themselves off Home; they open from the button', () => {
    const html = renderWith([{ id: 1, name: 'Goa trip', targetMinor: 2_500_000, savedMinor: 0, createdAt: 1 }])
    expect(html).not.toContain('Goa trip')
    expect(html).not.toContain('Saving for something?')
  })

  it('is there on a first launch too, so a goal can be set before anything is logged', () => {
    const html = renderWith([], [])
    expect(html).toContain('Nothing logged yet.')
    expect(html).toContain('aria-label="Goals. None yet"')
  })
})

describe('Home month picker', () => {
  it('marks the months that have transactions', () => {
    const html = render(false)
    expect(html).toContain('aria-label="October 2026, has transactions"')
    expect(html).not.toContain('aria-label="September 2026, has transactions"')
  })
})

describe('Home recent spending', () => {
  // "today" is 28 October 2026.
  const spent = [
    tx('expense', '2026-10-28', 450, 1, 'Cafe'),
    tx('expense', '2026-10-28', 50, 1, 'Tea'),
    tx('expense', '2026-10-27', 230, 1, 'Uber'),
    tx('expense', '2026-10-24', 1000, 1, 'Shop'),
    tx('expense', '2026-10-10', 700, 1, 'Older'),
    tx('income', '2026-10-28', 80000, 2, 'Employer'),
  ]
  const renderMonth = (month: string, list = spent) =>
    renderToStaticMarkup(
      createElement(Home, {
        ledger: makeLedger({
          txs: list, expenses: list.filter((t) => t.kind === 'expense'), income: list.filter((t) => t.kind === 'income'), categories,
          expenseCategories: categories.slice(0, 1), categoryById: new Map(categories.map((c) => [c.id, c])),
        }),
        month, onMonth: () => {}, today, onPickCategory: () => {}, onEdit: () => {}, onExample: () => {},
        onOpenSettings: () => {}, onSeeAll: () => {}, balanceShown: false, onToggleBalance: () => {}, suggestions: [],
        onSuggestion: () => {}, logNudge: false, onAdd: () => {},
      }),
    )

  it('shows what was spent today, yesterday and over the last seven days', () => {
    const html = renderMonth('2026-10')
    expect(html).toContain('aria-label="Recent spending"')
    expect(html).toContain('aria-label="Today: ₹500"') // 450 + 50; the salary is not spending
    expect(html).toContain('aria-label="Yesterday: ₹230"')
    expect(html).toContain('aria-label="Last 7 days: ₹1,730"') // 500 + 230 + 1,000
    for (const label of ['>Today<', '>Yesterday<', '>Last 7 days<']) expect(html).toContain(label)
  })

  it('shows zero for a day with nothing spent', () => {
    const html = renderMonth('2026-10', [tx('expense', '2026-10-20', 100, 1, 'Old')])
    expect(html).toContain('aria-label="Today: ₹0"')
    expect(html).toContain('aria-label="Yesterday: ₹0"')
  })

  it('is only shown for the current month, because these are measured from today', () => {
    expect(renderMonth('2026-09')).not.toContain('Recent spending')
  })

  it('is left out on a first launch with nothing logged', () => {
    expect(renderMonth('2026-10', [])).not.toContain('Recent spending')
  })
})
