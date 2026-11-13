import { readFileSync } from 'node:fs'
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
    expect(html).not.toContain('Sent in')
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

  it('lists received money in Recent transactions with a plus sign, not just spending', () => {
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

  it('puts the goals button in a header, at the right of the greeting and date and above the month switcher', () => {
    const dateTitle = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(today)
    const html = renderWith([])
    expect(html).toContain('<header')
    expect(html.indexOf(dateTitle)).toBeLessThan(html.indexOf('aria-label="Goals. None yet"'))
    expect(html.indexOf('aria-label="Goals. None yet"')).toBeLessThan(html.indexOf('aria-label="Previous month"'))
  })

  it('says on the button how much is saved overall', () => {
    expect(renderWith([{ id: 1, name: 'Goa trip', targetMinor: 2_500_000, savedMinor: 500_000, createdAt: 1 }])).toContain('aria-label="Goals. 1 goal, 20% saved"')
  })

  it('shows the goal that matters most on Home, with what it means, near the bottom', () => {
    const html = renderWith([{ id: 1, name: 'Goa trip', targetMinor: 2_500_000, savedMinor: 500_000, createdAt: 1 }])
    expect(html).toContain('Goa trip')
    expect(html).toContain('₹5,000 of ₹25,000')
    expect(html).not.toContain('Saving for something?')
    expect(html.indexOf('Goa trip')).toBeGreaterThan(html.indexOf('Where it went'))
  })

  it('shows no goals block when there are none', () => {
    expect(renderWith([])).not.toContain('See goals')
  })

  it('is there on a first launch too, so a goal can be set before anything is logged', () => {
    const html = renderWith([], [])
    expect(html).toContain('Let’s add your first one.')
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
    expect(html).toContain('aria-label="Today: ₹500. See these transactions"') // 450 + 50; the salary is not spending
    expect(html).toContain('aria-label="Yesterday: ₹230. See these transactions"')
    expect(html).toContain('aria-label="Last 7 days: ₹1,730. See these transactions"') // 500 + 230 + 1,000
    for (const label of ['>Today<', '>Yesterday<', '>Last 7 days<']) expect(html).toContain(label)
  })

  it('shows zero for a day with nothing spent', () => {
    const html = renderMonth('2026-10', [tx('expense', '2026-10-20', 100, 1, 'Old')])
    expect(html).toContain('aria-label="Today: ₹0"')
    expect(html).not.toContain('Today: ₹0. See these transactions') // nothing to show, so nothing to tap
    expect(html).toContain('aria-label="Yesterday: ₹0"')
  })

  it('is only shown for the current month, because these are measured from today', () => {
    expect(renderMonth('2026-09')).not.toContain('Recent spending')
  })

  it('is left out on a first launch with nothing logged', () => {
    expect(renderMonth('2026-10', [])).not.toContain('Recent spending')
  })
})

describe('Home: the budget invitation', () => {
  const renderBudget = (budgetMinor: number | null, month = '2026-10', withSuggestions = false) =>
    renderToStaticMarkup(
      createElement(Home, {
        ledger: makeLedger({
          txs, expenses: txs.filter((t) => t.kind === 'expense'), income: txs.filter((t) => t.kind === 'income'), categories,
          expenseCategories: categories.slice(0, 1), categoryById: new Map(categories.map((c) => [c.id, c])), budgetMinor,
          recurring: [{ id: 1, kind: 'expense', amountMinor: 1_250_000, currency: 'INR', categoryId: 1, merchant: 'Home loan', note: '', paymentMethod: '', frequency: 'monthly', nextDue: '2026-11-05', active: true }],
        }),
        month, onMonth: () => {}, today, onPickCategory: () => {}, onEdit: () => {}, onExample: () => {}, onOpenSettings: () => {},
        onSeeAll: () => {}, balanceShown: false, onToggleBalance: () => {}, suggestions: withSuggestions ? [regular] : [], onSuggestion: () => {}, logNudge: false, onAdd: () => {},
        onOpenGoals: () => {}, onOpenUpcoming: () => {}, onPickPeriod: () => {}, onOpenInsights: () => {},
      }),
    )

  it('sits below the suggestions, and above the day-by-day chart', () => {
    const html = renderBudget(null, '2026-10', true)
    const at = (s: string) => html.indexOf(s)
    expect(at('Suggested for now')).toBeGreaterThan(-1)
    expect(at('Set a monthly budget')).toBeGreaterThan(at('Suggested for now'))
    expect(at('Set a monthly budget')).toBeLessThan(at('Day by day'))
  })

  it('shows the suggestions as tiles with a line saying what to do', () => {
    const html = renderBudget(3_000_000, '2026-10', true)
    expect(html).toContain('Your usual ones around this time. Tap + to add one now, or tap the tile to check it first.')
    expect(html).toContain('w-[9.5rem]') // a tile, not a slim chip
    expect(html).toContain('Usually on Wednesdays')
  })

  it('sits below the cash flow and the payments that are coming up, not inside the spending card', () => {
    const html = renderBudget(null)
    expect(html).toContain('Set a monthly budget to see how much you have left.')
    const at = (s: string) => html.indexOf(s)
    expect(at('Set a monthly budget')).toBeGreaterThan(at('aria-label="Money received and your balance"'))
    expect(at('Set a monthly budget')).toBeGreaterThan(at('aria-label="Plan ahead"'))
    expect(at('Set a monthly budget')).toBeLessThan(at('Recent transactions'))
    // and not part of the overview card above
    const overview = html.slice(at('aria-label="Summary"'), at('aria-label="Money received and your balance"'))
    expect(overview).not.toContain('Set a monthly budget')
  })

  it('is not shown once a budget is set, and the progress stays in the overview', () => {
    const html = renderBudget(3_000_000)
    expect(html).not.toContain('Set a monthly budget')
    expect(html.indexOf('role="meter"')).toBeLessThan(html.indexOf('aria-label="Money received and your balance"'))
  })

  it('is there for a month that is over too, after the cash flow', () => {
    const html = renderBudget(null, '2026-09')
    expect(html).toContain('Set a monthly budget')
    expect(html.indexOf('Set a monthly budget')).toBeGreaterThan(html.indexOf('aria-label="Money received and your balance"'))
  })
})

describe('Home: what comes first', () => {
  const renderFull = () => {
    const summary = balanceFrom(txs, 100_000_00)
    const ledger = makeLedger({
      txs, expenses: txs.filter((t) => t.kind === 'expense'), income: txs.filter((t) => t.kind === 'income'), categories,
      expenseCategories: categories.slice(0, 1), categoryById: new Map(categories.map((c) => [c.id, c])), balanceSet: true,
      estimatedBalanceMinor: summary.estimatedMinor, netMinor: summary.netMinor,
      goals: [{ id: 1, name: 'Goa trip', targetMinor: 2_500_000, savedMinor: 500_000, createdAt: 1 }],
      recurring: [{ id: 1, kind: 'expense', amountMinor: 1_250_000, currency: 'INR', categoryId: 1, merchant: 'Home loan', note: '', paymentMethod: '', frequency: 'monthly', nextDue: '2026-11-05', active: true }],
    })
    return renderToStaticMarkup(
      createElement(Home, {
        ledger, month: '2026-10', onMonth: () => {}, today, onPickCategory: () => {}, onEdit: () => {}, onExample: () => {}, onOpenSettings: () => {},
        onSeeAll: () => {}, balanceShown: false, onToggleBalance: () => {}, suggestions: [], onSuggestion: () => {}, logNudge: false, onAdd: () => {},
        onOpenGoals: () => {}, onOpenUpcoming: () => {}, onPickPeriod: () => {}, onOpenInsights: () => {},
      }),
    )
  }

  it('answers "where do I stand" first, then cash, what is coming, the day-by-day chart, recent activity, where it went, advice and goals', () => {
    const html = renderFull()
    const order = [
      'aria-label="Summary"',
      'aria-label="Plan ahead"',
      'aria-label="Money received and your balance"',
      'aria-label="Budget"',
      'Day by day',
      'Recent transactions',
      'Where it went',
      'Understand your spending',
      'aria-label="Goals summary"',
    ]
    const positions = order.map((marker) => html.indexOf(marker))
    expect(positions.every((p) => p >= 0), JSON.stringify(order.filter((_, i) => positions[i] < 0))).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('has one calm headline number, then the tools around it, not a stack of equal cards', () => {
    const html = renderFull()
    expect((html.match(/type-display/g) ?? []).length).toBe(1)
  })

  describe('type: two voices, not one weight for everything', () => {
    // The greeting, the title of each section and the figures that matter are in the serif; what is read in small type is in the theme's sans.
    const classes = (html: string, name: string) => (html.match(new RegExp(`class="[^"]*\\b${name}\\b[^"]*"`, 'g')) ?? []).length

    it('sets the greeting in the serif, and every section title in the same one size', () => {
      const html = renderFull()
      expect(classes(html, 'type-greeting')).toBe(1)
      // Plan ahead, Day by day, Where the money flows, Recent transactions, Where it went, Goals and the insights card.
      expect(classes(html, 'type-title')).toBeGreaterThanOrEqual(6)
      for (const title of ['Plan ahead', 'Day by day', 'Where the money flows', 'Recent transactions', 'Where it went']) {
        expect(html).toMatch(new RegExp(`<h2[^>]*class="[^"]*type-title[^"]*"[^>]*>${title}<`))
      }
    })

    it('sets the numbers in the theme’s sans, bold and level, and only the words in the serif', () => {
      const html = renderFull()
      expect(classes(html, 'type-display')).toBe(1)
      expect(classes(html, 'type-figure')).toBeGreaterThanOrEqual(2)
      // No figure is set in the serif.
      expect(html).not.toMatch(/class="[^"]*type-(headline|title|greeting)[^"]*"[^>]*>[^<]*₹/)
      const css = readFileSync('src/index.css', 'utf8')
      expect(css).toMatch(/\.type-display,\s*\.type-figure \{\s*font-family: var\(--font-ui, var\(--font-sans\)\);\s*font-variant-numeric: tabular-nums/)
      expect(css).toMatch(/\.type-greeting,\s*\.type-headline,\s*\.type-title \{\s*font-family: var\(--font-voice\)/)
    })

    it('does not give any section a sans of its own: Plan ahead is in the theme font like the rest', () => {
      expect(renderFull()).not.toContain('font-cred')
    })

    it('does not put the old bold-sans heading on any title', () => {
      expect(renderFull()).not.toMatch(/<h2[^>]*class="[^"]*text-xl font-bold tracking-tight/)
    })
  })

  it('offers the insights as the next step, in words and a button', () => {
    expect(renderFull()).toContain('>See insights<')
  })
})

describe('Home: plan ahead', () => {
  const rule = (over: Record<string, unknown>) => ({
    id: 1, kind: 'expense', amountMinor: 600_000, currency: 'INR', categoryId: 1, merchant: 'Rent', note: '', paymentMethod: '',
    frequency: 'monthly', nextDue: '2026-10-31', active: true, ...over,
  })
  const renderAhead = (month = '2026-10') =>
    renderToStaticMarkup(
      createElement(Home, {
        ledger: makeLedger({
          txs, expenses: txs.filter((t) => t.kind === 'expense'), income: txs.filter((t) => t.kind === 'income'), categories,
          expenseCategories: categories.slice(0, 1), categoryById: new Map(categories.map((c) => [c.id, c])), budgetMinor: 3_000_000,
          recurring: [rule({}), rule({ id: 2, merchant: 'Home loan', amountMinor: 1_250_000, tag: 'loan', nextDue: '2026-11-05' })],
        } as never),
        month, onMonth: () => {}, today, onPickCategory: () => {}, onEdit: () => {}, onExample: () => {}, onOpenSettings: () => {},
        onSeeAll: () => {}, balanceShown: false, onToggleBalance: () => {}, suggestions: [], onSuggestion: () => {}, logNudge: false, onAdd: () => {},
        onOpenGoals: () => {}, onOpenUpcoming: () => {}, onPickPeriod: () => {}, onOpenInsights: () => {},
      }),
    )

  it('sits in the spending card, under the Today, Yesterday and Last 7 days figures', () => {
    const html = renderAhead()
    const card = html.slice(html.indexOf('aria-label="Summary"'), html.indexOf('aria-label="Money received and your balance"'))
    expect(card).toContain('aria-label="Plan ahead"')
    expect(card.indexOf('aria-label="Recent spending"')).toBeLessThan(card.indexOf('aria-label="Plan ahead"'))
  })

  it('names the next EMI and what to keep aside', () => {
    const html = renderAhead()
    expect(html).toContain('Next EMI')
    expect(html).toContain('Home loan')
    expect(html).toContain('to pay in the next 30 days')
  })

  it('is left out of a month that is over, since it looks ahead from today', () => {
    expect(renderAhead('2026-09')).not.toContain('aria-label="Plan ahead"')
  })
})
