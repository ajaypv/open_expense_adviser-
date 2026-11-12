// @vitest-environment jsdom
import '../test/dom'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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

function mount(rules: Recurring[], balance: number | null = null, onOpen?: () => void) {
  const ledger = makeLedger({
    categories, expenseCategories: categories, categoryById: new Map(categories.map((c) => [c.id, c])),
    recurring: rules, balanceSet: balance !== null, estimatedBalanceMinor: balance ?? 0,
  })
  const { container } = render(<PlanAhead ledger={ledger} today={today} onOpen={onOpen} />)
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
  it('has a View button only where there is a page to open, and it opens it', async () => {
    mount([emi, rent])
    expect(within(section()).queryByRole('button')).toBeNull()
    cleanup()
    const onOpen = vi.fn()
    mount([emi, rent], null, onOpen)
    await userEvent.click(within(section()).getByRole('button', { name: 'View plan ahead' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    // One button, so a screen reader hears it once; it reads differently from the Coming up card's.
    expect(within(section()).getAllByRole('button')).toHaveLength(1)
  })

  it('is a row of cards that scrolls sideways: every payment, soonest first, then the amount to keep aside', () => {
    mount([emi, rent, salary])
    const strip = section().querySelector('ul')!
    expect(strip.className).toContain('overflow-x-auto')
    expect(strip.className).toContain('snap-x')
    expect(strip.querySelectorAll(':scope > li')).toHaveLength(4) // rent, salary, EMI, to pay
    expect(strip.querySelectorAll('[data-leaf]')).toHaveLength(3) // each payment has its date as a leaf
    const text = strip.textContent!
    expect(text.indexOf('Rent')).toBeLessThan(text.indexOf('Salary'))
    expect(text.indexOf('Salary')).toBeLessThan(text.indexOf('Home loan'))
  })

  it('says what kind a payment is on its card, unless it is one the plan points out', () => {
    mount([emi, rent, salary])
    expect(section().querySelector('[data-kind="payment"]')).toHaveTextContent('Bill') // the rent: the EMI is the biggest, so rent is not
    expect(section().querySelector('[data-kind="payment"]')).toHaveTextContent('Rent')
  })

  it('puts the warning first when the balance will not cover what is due, and last otherwise', () => {
    mount([emi, rent], 1_000_000)
    expect(section().querySelector('ul > li:first-child')).toHaveAttribute('data-tone', 'short')
    cleanup()
    mount([emi, rent])
    expect(section().querySelector('ul > li:last-child')).toHaveAttribute('data-tone', 'plain')
    expect(section().querySelector('ul > li:first-child')).toHaveAttribute('data-kind', 'payment') // rent, the soonest
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


describe('PlanAhead: the sentence, the balance line and the long list', () => {
  const money = (rules: Recurring[], balance: number | null) => {
    cleanup()
    mount(rules, balance)
    return section()
  }

  it('says what goes out and what comes in over the next 30 days', () => {
    const s = money([emi, rent, salary], null)
    expect(s).toHaveTextContent('In the next 30 days, ₹18,500 goes out and ₹80,000 comes in.')
  })

  it('leaves out "comes in" when nothing does', () => {
    expect(money([emi, rent], null)).toHaveTextContent('In the next 30 days, ₹18,500 goes out.')
    expect(section()).not.toHaveTextContent('comes in')
  })

  it('says in a line whether the balance covers it, in words as well as an icon', () => {
    expect(money([emi, rent], 9_000_000)).toHaveTextContent('Your balance covers the next 30 days.')
    expect(money([emi, rent], 1_000_000)).toHaveTextContent('Your balance will not cover all of these.')
    expect(money([emi, rent], null)).toHaveTextContent('Set your balance to check these are covered.')
    expect(section()).not.toHaveTextContent('will not cover')
  })

  it('shows only the first six, and a last card says how many more, opening the page', async () => {
    const rules = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((m, i) => rule({ merchant: m, amountMinor: 20_000 - i, nextDue: '2026-11-0' + (i + 1), tag: 'bill' }))
    const onOpen = vi.fn()
    cleanup()
    mount(rules, null, onOpen)
    expect(within(section()).queryByText('H')).toBeNull()
    expect(within(section()).getByText('A')).toBeInTheDocument()
    await userEvent.click(within(section()).getByRole('button', { name: 'See all 8 payments' }))
    expect(onOpen).toHaveBeenCalledOnce()
    expect(section()).toHaveTextContent('+2')
  })

  it('always shows the ones it points out, even when they are far off', () => {
    const near = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((m, i) => rule({ merchant: m, amountMinor: 10_000, nextDue: '2026-11-0' + (i + 1), tag: 'bill' }))
    const big = rule({ merchant: 'Insurance', amountMinor: 9_000_000, nextDue: '2026-11-25', tag: 'bill' })
    const s = money([...near, big], null)
    expect(within(s).getByText('Insurance')).toBeInTheDocument()
    expect(s.querySelector('[data-kind="biggest"]')).toHaveTextContent('Biggest payment ahead')
  })

  it('says so when something is set up but nothing is due soon', () => {
    expect(money([rule({ nextDue: '2027-03-01' })], null)).toHaveTextContent('Nothing due in the next 30 days.')
  })

  it('invites a first payment, as one quiet line, when nothing is set up (or all is paused)', async () => {
    cleanup()
    const onSetUp = vi.fn()
    const ledger = makeLedger({ categories, categoryById: new Map(categories.map((c) => [c.id, c])), recurring: [{ ...emi, active: false }] })
    render(<PlanAhead ledger={ledger} today={today} onSetUp={onSetUp} />)
    await userEvent.click(screen.getByRole('button', { name: /Track loans, auto-payments and salary/ }))
    expect(onSetUp).toHaveBeenCalledOnce()
    expect(screen.queryByRole('region', { name: 'Plan ahead' })).toBeNull()
  })
})

describe('PlanAhead: colours', () => {
  const cats: Category[] = [
    { id: 1, name: 'Bills', color: 'var(--s1)' },
    { id: 2, name: 'Entertainment', color: 'var(--s4)' },
  ]
  const leaves = (rules: Recurring[]) => {
    cleanup()
    const ledger = makeLedger({ categories: cats, expenseCategories: cats, categoryById: new Map(cats.map((c) => [c.id, c])), recurring: rules })
    render(<PlanAhead ledger={ledger} today={today} />)
    return Array.from(section().querySelectorAll<HTMLElement>('[data-leaf]')).map((l) => l.getAttribute('data-colour'))
  }

  it('colours each card with its category, as the suggestion tiles are, so they do not all look alike', () => {
    const colours = leaves([rule({ merchant: 'Rent', categoryId: 1, nextDue: '2026-10-31' }), rule({ merchant: 'Netflix', categoryId: 2, nextDue: '2026-11-02' })])
    expect(colours).toEqual(['var(--s1)', 'var(--s4)'])
  })

  it('keeps a late payment red, whatever its category', () => {
    const colours = leaves([rule({ merchant: 'Rent', categoryId: 2, nextDue: '2026-10-25' }), rule({ merchant: 'Netflix', categoryId: 2, nextDue: '2026-11-02' })])
    expect(colours.slice(0, 2)).toEqual(['var(--critical)', 'var(--s4)'])
  })
})
