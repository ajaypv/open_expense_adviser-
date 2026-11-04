// @vitest-environment jsdom
import '../test/dom'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Category, Recurring } from '../db/schema'
import { makeLedger } from '../test/ledger'
import { PlanAhead } from './PlanAhead'

const today = new Date(2026, 9, 28) // Wed 28 Oct 2026
const categories: Category[] = [{ id: 1, name: 'Bills', color: 'var(--s1)' }]

let id = 0
const rule = (over: Partial<Recurring>): Recurring => ({
  id: ++id, kind: 'expense', amountMinor: 100_000, currency: 'INR', categoryId: 1, merchant: 'Thing', note: '', paymentMethod: '',
  frequency: 'monthly', nextDue: '2026-11-05', active: true, ...over,
})
const emi = rule({ merchant: 'Home loan', amountMinor: 1_250_000, tag: 'loan', nextDue: '2026-11-05' })
const rent = rule({ merchant: 'Rent', amountMinor: 600_000, tag: 'bill', nextDue: '2026-10-31' })
const salary = rule({ merchant: 'Salary', kind: 'income', amountMinor: 8_000_000, tag: 'income', nextDue: '2026-11-01' })

function mount(rules: Recurring[], balance: number | null = null) {
  const ledger = makeLedger({
    categories, expenseCategories: categories, categoryById: new Map(categories.map((c) => [c.id, c])),
    recurring: rules, balanceSet: balance !== null, estimatedBalanceMinor: balance ?? 0,
  })
  const { container } = render(<PlanAhead ledger={ledger} today={today} />)
  return { container }
}

const section = () => screen.getByRole('region', { name: 'Plan ahead' })
const row = (kind: string) => section().querySelector<HTMLElement>(`[data-kind="${kind}"]`)!

describe('PlanAhead: the rows', () => {
  it('shows the next EMI with its date, how soon, and the amount', () => {
    mount([emi, rent])
    const r = row('emi')
    expect(r).toHaveTextContent('Next EMI')
    expect(r).toHaveTextContent('Home loan')
    expect(r).toHaveTextContent(/Nov.*5|5.*Nov/)
    expect(r).toHaveTextContent('in 8 days')
    expect(r).toHaveTextContent('₹12,500')
  })

  it('says when the EMI is also the biggest payment', () => {
    mount([emi, rent])
    expect(row('emi')).toHaveTextContent('Next EMI, and your biggest payment')
    expect(section().querySelector('[data-kind="biggest"]')).toBeNull()
  })

  it('shows the biggest payment on its own when it is not the EMI', () => {
    mount([rule({ ...emi, id: 99, amountMinor: 500_000 }), rent])
    expect(row('biggest')).toHaveTextContent('Biggest payment ahead')
    expect(row('biggest')).toHaveTextContent('Rent')
    expect(row('biggest')).toHaveTextContent('in 3 days')
  })

  it('shows when money comes in, with a plus', () => {
    mount([emi, rent, salary])
    expect(row('income')).toHaveTextContent('Money coming in')
    expect(row('income')).toHaveTextContent('Salary')
    expect(row('income')).toHaveTextContent('+₹80,000')
  })

  it('marks a late payment in words as well as colour', () => {
    mount([rule({ merchant: 'Electricity', amountMinor: 900_000, tag: 'bill', nextDue: '2026-10-25' }), rent])
    expect(row('biggest')).toHaveTextContent('overdue by 3 days')
  })

  it('says today and tomorrow in words', () => {
    mount([rule({ merchant: 'Gym', amountMinor: 300_000, nextDue: '2026-10-28' }), rule({ merchant: 'Phone', amountMinor: 100_000, nextDue: '2026-10-29', tag: 'loan' })])
    expect(section()).toHaveTextContent('today')
    expect(section()).toHaveTextContent('tomorrow')
  })
})

describe('PlanAhead: what to save', () => {
  it('says how much more to save, by when, and about how much a day, when the balance will not cover it', () => {
    // ₹10,000 against ₹6,000 rent and the ₹12,500 EMI: short by ₹8,500 from 5 Nov, 8 days away.
    mount([emi, rent], 1_000_000)
    const box = section().querySelector('[data-tone="short"]')!
    expect(box).toHaveTextContent('Save ₹8,500 more by')
    expect(box).toHaveTextContent(/Nov.*5|5.*Nov/)
    expect(box).toHaveTextContent('About ₹1,063 a day gets you there')
  })

  it('says what is due and what to keep aside when no balance is set', () => {
    mount([emi, rent])
    const box = section().querySelector('[data-tone="plain"]')!
    expect(box).toHaveTextContent('₹18,500 to pay in the next 30 days')
    expect(box).toHaveTextContent('Set aside about ₹617 a day')
    expect(box).toHaveTextContent('Add your balance to check it is covered')
  })

  it('has no box when the balance covers it', () => {
    mount([emi, rent], 9_000_000)
    expect(section().querySelector('[data-tone]')).toBeNull()
  })
})

describe('PlanAhead: around it', () => {
  it('has no button of its own to open the list, since Coming up has it and two would be read out alike', () => {
    mount([emi, rent])
    expect(within(section()).queryByRole('button')).toBeNull()
  })

  it('is not there at all with no regular payments set up', () => {
    const { container } = mount([])
    expect(container).toBeEmptyDOMElement()
  })

  it('is not there when every payment is switched off', () => {
    const { container } = mount([{ ...emi, active: false }])
    expect(container).toBeEmptyDOMElement()
  })
})
