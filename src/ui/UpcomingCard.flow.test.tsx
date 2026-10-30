// @vitest-environment jsdom
import '../test/dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Recurring } from '../db/schema'
import { makeLedger, type TestLedger } from '../test/ledger'
import { UpcomingCard } from './UpcomingCard'

const today = new Date(2026, 9, 30)
let id = 0
const rule = (over: Partial<Recurring> = {}): Recurring => ({
  id: ++id, kind: 'expense', amountMinor: 100_000, currency: 'INR', categoryId: 1, merchant: 'Gym', note: '', paymentMethod: '',
  frequency: 'monthly', nextDue: '2026-11-05', active: true, ...over,
})
const emi = () => rule({ merchant: 'Home loan', amountMinor: 1_250_000, nextDue: '2026-11-05', tag: 'loan' })

function ledgerWith(rules: Recurring[], balanceMinor: number | null = 5_000_000): TestLedger {
  const set = balanceMinor !== null
  return makeLedger({
    recurring: rules,
    accounts: [{ id: 1, name: 'Main', openingMinor: set ? balanceMinor : null }],
    balances: new Map([[1, { accountId: 1, netMinor: 0, estimatedMinor: balanceMinor ?? 0 }]]),
    balanceSet: set,
    estimatedBalanceMinor: balanceMinor ?? 0,
  })
}

function setup(ledger: TestLedger) {
  const onOpen = vi.fn()
  const view = render(<UpcomingCard ledger={ledger} today={today} onOpen={onOpen} />)
  return { onOpen, view, user: userEvent.setup() }
}

describe('Coming up (on Home)', () => {
  it('invites a first payment when nothing is set up, as one quiet line', async () => {
    const { onOpen, user } = setup(ledgerWith([]))
    await user.click(screen.getByRole('button', { name: /Track loans, auto-payments and salary/ }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('shows the next payments with how many days away they are', () => {
    setup(ledgerWith([emi(), rule({ merchant: 'Netflix', amountMinor: 49_900, nextDue: '2026-11-01' })]))
    const card = screen.getByRole('region', { name: 'Coming up' })
    expect(within(card).getByText('Netflix')).toBeInTheDocument()
    expect(within(card).getByText('Home loan')).toBeInTheDocument()
    expect(card).toHaveTextContent('In 2 days')
    expect(card).toHaveTextContent('In 6 days')
    expect(card.textContent!.indexOf('Netflix')).toBeLessThan(card.textContent!.indexOf('Home loan'))
  })

  it('shows only the next three, and says how many more there are', () => {
    const rules = ['A', 'B', 'C', 'D', 'E'].map((m, i) => rule({ merchant: m, nextDue: `2026-11-0${i + 1}` }))
    setup(ledgerWith(rules))
    const card = screen.getByRole('region', { name: 'Coming up' })
    expect(within(card).queryByText('D')).toBeNull()
    expect(card).toHaveTextContent('2 more')
  })

  it('opens the full view from See all', async () => {
    const { onOpen, user } = setup(ledgerWith([emi()]))
    await user.click(screen.getByRole('button', { name: 'See all upcoming payments' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('says the balance covers the next 30 days when it does', () => {
    setup(ledgerWith([emi()], 5_000_000))
    expect(screen.getByRole('region', { name: 'Coming up' })).toHaveTextContent('Your balance covers the next 30 days')
  })

  it('warns, with an icon and words, when the balance will not cover them', () => {
    setup(ledgerWith([emi()], 100_000))
    const card = screen.getByRole('region', { name: 'Coming up' })
    expect(card).toHaveTextContent(/Short by ₹11,500 from (5 Nov|Nov 5)/)
  })

  it('makes no claim about the balance when it was never set', () => {
    setup(ledgerWith([emi()], null))
    const card = screen.getByRole('region', { name: 'Coming up' })
    expect(card).toHaveTextContent('Set your balance to check these are covered')
    expect(card).not.toHaveTextContent('Short by')
  })

  it('says so when something is set up but nothing is due soon', () => {
    setup(ledgerWith([rule({ nextDue: '2027-03-01' })]))
    expect(screen.getByRole('region', { name: 'Coming up' })).toHaveTextContent('Nothing due in the next 30 days')
  })

  it('treats payments that are all paused as nothing set up', () => {
    setup(ledgerWith([rule({ active: false })]))
    expect(screen.getByRole('button', { name: /Track loans, auto-payments and salary/ })).toBeInTheDocument()
  })
})
