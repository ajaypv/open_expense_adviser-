import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LedgerTx } from '../data/buildLedger'
import type { Category } from '../db/schema'
import { makeLedger } from '../test/ledger'
import { Welcome } from '../ui/Welcome'
import { WhatsNew } from '../ui/WhatsNew'
import { LockScreen } from '../security/LockScreen'
import { Activity } from './Activity'
import { Insights } from './Insights'
import { AccountsSection } from './settings/AccountsSection'
import { BudgetSection } from './settings/BudgetSection'
import { CurrencySection } from './settings/CurrencySection'
import { DataSection } from './settings/DataSection'
import { DisplaySection } from './settings/DisplaySection'
import { RecurringSection } from './settings/RecurringSection'
import { RemindersSection } from './settings/RemindersSection'
import { SecuritySection } from './settings/SecuritySection'

const cats: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Transport', color: 'var(--s3)' },
  { id: 3, name: 'Income', color: 'var(--ink-2)' },
]
const categoryById = new Map(cats.map((c) => [c.id, c]))

let id = 0
const tx = (date: string, amount: number, over: Partial<LedgerTx> = {}): LedgerTx => ({
  id: ++id, kind: 'expense', amountMinor: amount * 100, currency: 'INR', categoryId: 1, merchant: '', note: '', date,
  paymentMethod: '', source: 'manual', createdAt: id, ...over,
})

const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el)

describe('Activity', () => {
  const today = new Date(2026, 9, 28)
  const txs = [tx('2026-10-28', 450, { merchant: 'Swiggy' }), tx('2026-10-27', 230, { merchant: 'Uber', categoryId: 2 }), tx('2026-10-27', 5000, { kind: 'income', categoryId: 3, merchant: 'Employer' })]
  const render = (list: LedgerTx[]) =>
    html(createElement(Activity, { ledger: makeLedger({ txs: list, categories: cats, categoryById }), today, categoryFilter: null, onCategoryFilter: () => {}, onEdit: () => {} }))

  it('offers filters and select mode, and lists each day with its transactions', () => {
    const out = render(txs)
    expect(out).toContain('Filters')
    expect(out).toContain('>Select<')
    expect(out).toContain('Today')
    expect(out).toContain('Yesterday')
    for (const name of ['Swiggy', 'Uber', 'Employer']) expect(out).toContain(name)
    expect(out).not.toMatch(/NaN|undefined/)
  })

  it('keeps Select off with nothing to select, and explains the empty list', () => {
    const out = render([])
    expect(out).toContain('Your transactions will show up here')
    expect(out).toMatch(/<button[^>]*disabled[^>]*>Select</)
  })

  it('does not count a transfer as sent or received in a day total', () => {
    const out = render([tx('2026-10-28', 2000, { kind: 'transfer', accountId: 1, toAccountId: 2 })])
    expect(out).toContain('Transfer')
    expect(out).not.toMatch(/₹2,000<\/p>|\+₹2,000/) // the heading total stays empty
  })
})

describe('Insights additions', () => {
  const today = new Date(2026, 9, 28)
  // Six ordinary Transport purchases, one huge one this month, across several months.
  const usual = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((m) => tx(`${m}-05`, 100, { categoryId: 2, merchant: 'Cab' }))
  const big = tx('2026-10-12', 900, { categoryId: 2, merchant: 'Airport cab' })
  const food = tx('2026-10-03', 600, { merchant: 'Cafe' })
  const salary = tx('2026-10-01', 2000, { kind: 'income', categoryId: 3, merchant: 'Employer' })
  const expenses = [...usual, big, food]

  const render = (over: Parameters<typeof makeLedger>[0] = {}) =>
    html(
      createElement(Insights, {
        ledger: makeLedger({ txs: [...expenses, salary], expenses, income: [salary], categories: cats, categoryById, ...over }),
        month: '2026-10', onMonth: () => {}, today, onOpenSettings: () => {},
      }),
    )

  it('shows money in and out, with how much was kept', () => {
    const out = render()
    expect(out).toContain('Money in and out')
    expect(out).toContain('₹2,000') // received
    expect(out).toContain('₹1,600') // sent this month: 100 + 900 + 600
    expect(out).toContain('You kept <b class="font-semibold">₹400</b>, 20% of what came in')
  })

  it('says so plainly when more went out than came in', () => {
    const small = tx('2026-10-01', 1000, { kind: 'income', categoryId: 3, merchant: 'Employer' })
    const out = render({ txs: [...expenses, small], income: [small] })
    expect(out).toContain('₹600 more</b> than came in so far')
  })

  it('shows spending against each category limit', () => {
    const out = render({ categoryBudgets: new Map([[2, 150_000]]) })
    expect(out).toContain('Budgets by category')
    expect(out).toContain('Transport')
    expect(out).toContain('role="meter"')
  })

  it('flags a purchase far above the usual, in words', () => {
    const out = render()
    expect(out).toContain('Bigger than usual')
    expect(out).toContain('Airport cab')
    expect(out).toMatch(/9 times the usual Transport/)
  })

  it('shows trends and the last twelve months once there is more than one month of data', () => {
    const out = render()
    expect(out).toContain('Trends by category')
    expect(out).toContain('The last 12 months')
    expect(out).toContain('Show as table')
  })

  it('leaves those out in a first month, rather than showing empty charts', () => {
    const only = [tx('2026-10-03', 600, { merchant: 'Cafe' })]
    const out = html(
      createElement(Insights, { ledger: makeLedger({ txs: only, expenses: only, categories: cats, categoryById }), month: '2026-10', onMonth: () => {}, today, onOpenSettings: () => {} }),
    )
    for (const missing of ['Trends by category', 'The last 12 months', 'Bigger than usual', 'Budgets by category', 'Money in and out']) {
      expect(out).not.toContain(missing)
    }
    expect(out).not.toMatch(/NaN|undefined|Infinity/)
  })
})

describe('Welcome, What’s new and the lock screen', () => {
  it('welcomes with three optional questions and a way to skip', () => {
    const out = html(createElement(Welcome, { open: true, currency: 'INR', accounts: [{ id: 1, name: 'Main', openingMinor: null }] }))
    for (const text of ['Welcome', 'Currency', 'What do you have today?', 'Monthly budget', 'Get started', 'Skip for now']) expect(out).toContain(text)
  })

  it('lists what changed in the newest version', () => {
    const out = html(createElement(WhatsNew, { open: true, onClose: () => {} }))
    expect(out).toContain('What’s new in 0.3.0')
    expect(out).toContain('Got it')
    expect(out).toContain('Lock the app with a PIN')
  })

  it('asks for the PIN, and explains what a forgotten one means', () => {
    const out = html(createElement(LockScreen))
    expect(out).toContain('Enter your PIN')
    expect(out).toContain('type="password"')
    expect(out).toContain('inputMode="numeric"')
    expect(out).toContain('Forgot your PIN?')
    expect(out).toContain('can’t be recovered')
    expect(out).toContain('Type ERASE')
  })
})

describe('Settings sections', () => {
  const ledger = makeLedger({ categories: cats, categoryById, expenseCategories: cats.slice(0, 2) })

  it('Accounts: lists each account without revealing a balance', () => {
    const out = html(createElement(AccountsSection, { ledger: makeLedger({ accounts: [{ id: 1, name: 'Main', openingMinor: 500_000 }, { id: 2, name: 'Cash', openingMinor: null }], balanceSet: true }) }))
    expect(out).toContain('Accounts and balance')
    expect(out).toContain('Main')
    expect(out).toContain('Balance set')
    expect(out).toContain('Balance not set')
    expect(out).toContain('Add an account')
    expect(out).not.toContain('5,000')
  })

  it('Budget: has an overall limit and per-category limits', () => {
    const out = html(createElement(BudgetSection, { ledger: makeLedger({ ...ledger, categoryBudgets: new Map([[1, 800_000]]) }) }))
    expect(out).toContain('Monthly budget')
    expect(out).toContain('Limits by category')
    expect(out).toContain('1 set')
    expect(out).toContain('Food &amp; Dining monthly limit')
  })

  it('Currency: warns when a currency used has no rate', () => {
    const out = html(createElement(CurrencySection, { ledger: makeLedger({ missingRates: ['USD'], rates: {} }) }))
    expect(out).toContain('Rate needed')
    expect(out).toContain('Set a rate for USD')
    expect(out).toContain('Value of 1 USD in INR')
  })

  it('Currency: the main currency opens a searchable list with names, not the browser menu', () => {
    const out = html(createElement(CurrencySection, { ledger: makeLedger({ currency: 'INR' }) }))
    expect(out).not.toContain('<select')
    expect(out).toMatch(/<button[^>]*id="currency"[^>]*aria-haspopup="dialog"/)
    expect(out).toContain('Indian Rupee')
    expect(out).toContain('US Dollar')
    expect(out).toContain('type="search"')
  })

  it('Recurring: explains itself when empty', () => {
    expect(html(createElement(RecurringSection, { ledger }))).toContain('Nothing repeats yet')
  })

  it('Recurring: lists a rule and how it repeats', () => {
    const rule = { id: 1, kind: 'expense' as const, amountMinor: 1_800_000, currency: 'INR', categoryId: 1, merchant: 'Rent', note: '', paymentMethod: '', frequency: 'monthly' as const, nextDue: '2026-11-01', active: true }
    const out = html(createElement(RecurringSection, { ledger: makeLedger({ ...ledger, recurring: [rule] }) }))
    expect(out).toContain('Rent')
    expect(out).toContain('₹18,000')
    expect(out).toContain('Every month on the 1st')
    expect(out).toContain('Delete recurring Rent')
  })

  it('Reminders and App lock: offer their switches and say what they do', () => {
    const reminders = html(createElement(RemindersSection))
    // Off by default, and where notifications can't be shown the section says reminders appear in the app.
    for (const text of ['Remind me to log', 'Budget alerts', 'Reminders will appear inside the app']) expect(reminders).toContain(text)
    const security = html(createElement(SecuritySection))
    expect(security).toContain('App lock')
    expect(security).toContain('Set a PIN')
    expect(security).toContain('doesn’t scramble the data')
  })

  it('Appearance: text size, hide amounts and number format', () => {
    const out = html(createElement(DisplaySection, { theme: 'system', onTheme: () => {} }))
    for (const text of ['Text size', 'Largest', 'Hide amounts', 'Indian grouping', 'International grouping']) expect(out).toContain(text)
    expect((out.match(/name="number-format"/g) ?? []).length).toBe(3)
  })

  it('Your data: backs up, restores and shows the trash', () => {
    const trashed = { id: 9, kind: 'expense' as const, amountMinor: 45000, currency: 'INR', categoryId: 1, merchant: 'Swiggy', note: '', date: '2026-10-05', paymentMethod: '', source: 'manual' as const, createdAt: 1, deletedAt: Date.now() - 2 * 86_400_000 }
    const out = html(createElement(DataSection, { ledger: makeLedger({ ...ledger, txs: [tx('2026-10-05', 10)], trash: [trashed] }) }))
    for (const text of ['Back up everything', 'Restore from a backup', 'Export transactions', 'Recently deleted', '1 kept for 30 days', 'Swiggy', '28 days left', 'Restore']) {
      expect(out).toContain(text)
    }
  })
})
