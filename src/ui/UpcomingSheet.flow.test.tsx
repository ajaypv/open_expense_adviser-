// @vitest-environment jsdom
import '../test/dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Account, Recurring } from '../db/schema'
import { makeLedger, type TestLedger } from '../test/ledger'
import { UpcomingSheet } from './UpcomingSheet'

const today = new Date(2026, 9, 30) // Friday 30 Oct 2026

let id = 0
const rule = (over: Partial<Recurring> = {}): Recurring => ({
  id: ++id, kind: 'expense', amountMinor: 100_000, currency: 'INR', categoryId: 1, merchant: 'Gym', note: '', paymentMethod: '',
  frequency: 'monthly', nextDue: '2026-11-05', active: true, ...over,
})
const emi = () => rule({ merchant: 'Home loan', amountMinor: 1_250_000, nextDue: '2026-11-05', tag: 'loan' })
const netflix = () => rule({ merchant: 'Netflix', amountMinor: 49_900, nextDue: '2026-11-01', tag: 'autopay' })
const salary = () => rule({ merchant: 'Salary', kind: 'income', amountMinor: 8_000_000, nextDue: '2026-11-01', tag: 'income' })

const main: Account = { id: 1, name: 'Main', openingMinor: 2_000_000 }

function ledgerWith(rules: Recurring[], balanceMinor: number | null = 2_000_000, over: Partial<TestLedger> = {}) {
  const set = balanceMinor !== null
  return makeLedger({
    recurring: rules,
    accounts: [{ ...main, openingMinor: set ? balanceMinor : null }],
    balances: new Map([[1, { accountId: 1, netMinor: 0, estimatedMinor: balanceMinor ?? 0 }]]),
    balanceSet: set,
    estimatedBalanceMinor: balanceMinor ?? 0,
    ...over,
  })
}

function setup(ledger: TestLedger) {
  const onAdd = vi.fn()
  const onEdit = vi.fn()
  const onClose = vi.fn()
  render(<UpcomingSheet open onClose={onClose} ledger={ledger} today={today} onAdd={onAdd} onEdit={onEdit} />)
  return { onAdd, onEdit, onClose, user: userEvent.setup(), sheet: screen.getByRole('dialog', { name: 'Upcoming payments' }) }
}

describe('Upcoming payments: nothing set up', () => {
  it('invites the first one, and is honest that the app cannot see a bank or UPI app', async () => {
    const { sheet, onAdd, user } = setup(ledgerWith([]))
    expect(within(sheet).getByText('Nothing set up yet')).toBeInTheDocument()
    expect(sheet).toHaveTextContent(/can.t see your bank or UPI/)
    expect(sheet).toHaveTextContent(/Loan EMIs/)
    await user.click(within(sheet).getByRole('button', { name: 'Add a payment' }))
    expect(onAdd).toHaveBeenCalledOnce()
  })
})

describe('Upcoming payments: the schedule', () => {
  it('lists what is coming in date order, with the type, the days left and the amount', () => {
    const { sheet } = setup(ledgerWith([emi(), netflix(), salary()]))
    const rows = within(sheet).getAllByRole('button', { name: /^Edit / })
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/^Edit Netflix, UPI AutoPay, In 2 days, ₹499 going out/),
      expect.stringMatching(/^Edit Salary, Salary or income, In 2 days, ₹80,000 coming in/),
      expect.stringMatching(/^Edit Home loan, Loan EMI, In 6 days, ₹12,500 going out/),
    ])
    expect(within(sheet).getByText('+₹80,000')).toBeInTheDocument()
  })

  it('opens a payment to change it', async () => {
    const { sheet, onEdit, user } = setup(ledgerWith([emi()]))
    await user.click(within(sheet).getByRole('button', { name: /^Edit Home loan/ }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ merchant: 'Home loan' }))
  })

  it('has a way to add another', async () => {
    const { sheet, onAdd, user } = setup(ledgerWith([emi()]))
    await user.click(within(sheet).getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledOnce()
  })

  it('looks further ahead when asked, so a monthly payment shows up again', async () => {
    const { sheet, user } = setup(ledgerWith([emi()]))
    expect(within(sheet).getAllByRole('button', { name: /^Edit Home loan/ })).toHaveLength(1)
    await user.click(within(sheet).getByRole('button', { name: '90 days' }))
    expect(within(sheet).getAllByRole('button', { name: /^Edit Home loan/ })).toHaveLength(3)
    expect(within(sheet).getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sheet).getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('flags a payment that is late, in words as well as an icon', () => {
    const { sheet } = setup(ledgerWith([rule({ merchant: 'Electricity', nextDue: '2026-10-28' })]))
    expect(within(sheet).getByText('Overdue by 2 days')).toBeInTheDocument()
  })

  it('keeps a paused payment out of the schedule but still lists it, so it can be turned back on', async () => {
    const { sheet, onEdit, user } = setup(ledgerWith([emi(), rule({ merchant: 'Gym', active: false })]))
    expect(within(sheet).getAllByRole('button', { name: /^Edit Home loan/ })).toHaveLength(1)
    const paused = within(sheet).getByRole('region', { name: 'Paused' })
    await user.click(within(paused).getByRole('button', { name: /^Edit Gym/ }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ merchant: 'Gym' }))
  })
})

describe('Upcoming payments: the month and the next days', () => {
  it('says what is still to go out and come in this month', () => {
    const { sheet } = setup(ledgerWith([rule({ merchant: 'Wifi', amountMinor: 79_900, nextDue: '2026-10-31' }), rule({ merchant: 'Refund', kind: 'income', amountMinor: 20_000, nextDue: '2026-10-31' }), emi()]))
    const month = within(sheet).getByRole('region', { name: 'October' })
    expect(month).toHaveTextContent('Still to go out₹799')
    expect(month).toHaveTextContent('Still to come in₹200')
    expect(month).toHaveTextContent('2 payments left this month')
  })

  it('says so when nothing more is due this month', () => {
    const { sheet } = setup(ledgerWith([emi()]))
    expect(within(sheet).getByRole('region', { name: 'October' })).toHaveTextContent('Nothing else is due this month')
  })

  it('totals the look-ahead, going out and coming in apart', () => {
    const { sheet } = setup(ledgerWith([emi(), netflix(), salary()]))
    const ahead = within(sheet).getByRole('region', { name: 'Next 30 days' })
    expect(ahead).toHaveTextContent('Going out₹12,999')
    expect(ahead).toHaveTextContent('Coming in₹80,000')
  })
})

describe('Upcoming payments: is the balance enough?', () => {
  it('says the balance covers it, and how low it gets', () => {
    const { sheet } = setup(ledgerWith([emi(), netflix()], 5_000_000))
    const check = within(sheet).getByRole('region', { name: 'Is your balance enough?' })
    expect(check).toHaveTextContent('Your balance covers these payments')
    expect(check).toHaveTextContent(/lowest it gets is ₹37,001/i)
    expect(check).not.toHaveTextContent('short')
  })

  it('says by how much and from when it falls short, and what to add', () => {
    const { sheet } = setup(ledgerWith([emi(), netflix()], 100_000))
    const check = within(sheet).getByRole('region', { name: 'Is your balance enough?' })
    expect(check).toHaveTextContent(/short by ₹11,999 from (5 Nov|Nov 5)/)
    expect(check).toHaveTextContent('Add at least ₹11,999')
  })

  it('counts a salary that arrives before the payment', () => {
    const { sheet } = setup(ledgerWith([emi(), salary()], 100_000))
    expect(within(sheet).getByRole('region', { name: 'Is your balance enough?' })).toHaveTextContent('Your balance covers these payments')
  })

  it('does not claim a shortage when the balance was never set, and says how to fix that', () => {
    const { sheet } = setup(ledgerWith([emi()], null))
    const check = within(sheet).getByRole('region', { name: 'Is your balance enough?' })
    expect(check).toHaveTextContent('Set your balance in Settings')
    expect(check).not.toHaveTextContent('short by')
  })

  it('checks each account when there are several, since a loan leaves from one bank account', () => {
    const accounts: Account[] = [{ id: 1, name: 'Main', openingMinor: 5_000_000 }, { id: 2, name: 'HDFC', openingMinor: 100_000 }]
    const ledger = makeLedger({
      recurring: [rule({ merchant: 'Car loan', amountMinor: 300_000, accountId: 2, nextDue: '2026-11-05' }), rule({ merchant: 'Wifi', amountMinor: 50_000, nextDue: '2026-11-06' })],
      accounts,
      balances: new Map([[1, { accountId: 1, netMinor: 0, estimatedMinor: 5_000_000 }], [2, { accountId: 2, netMinor: 0, estimatedMinor: 100_000 }]]),
      balanceSet: true,
      estimatedBalanceMinor: 5_100_000,
    })
    const { sheet } = setup(ledger)
    const check = within(sheet).getByRole('region', { name: 'Is your balance enough?' })
    expect(check).toHaveTextContent(/HDFC.*short by ₹2,000/)
    expect(check).toHaveTextContent(/Main.*enough/)
  })

  it('warns when an amount is in a currency with no rate, since it is counted at face value', () => {
    const { sheet } = setup(ledgerWith([rule({ merchant: 'Hosting', currency: 'USD', amountMinor: 1000, nextDue: '2026-11-03' })]))
    expect(sheet).toHaveTextContent(/USD.*face value/)
  })
})
