// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db, type Account, type Category, type Recurring } from '../db/schema'
import { RuleSheet } from './RuleSheet'
import { ToastProvider } from './toast'

const categories: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Bills & Utilities', color: 'var(--s2)' },
  { id: 3, name: 'Entertainment & Travel', color: 'var(--s3)' },
  { id: 4, name: 'Other', color: 'var(--other)' },
  { id: 5, name: 'Income', color: 'var(--ink-2)' },
]
const oneAccount: Account[] = [{ id: 1, name: 'Main', openingMinor: null }]
const twoAccounts: Account[] = [...oneAccount, { id: 2, name: 'HDFC', openingMinor: null }]
const today = new Date(2026, 9, 30)

function setup(over: Record<string, unknown> = {}) {
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <RuleSheet open rule={null} categories={categories} accounts={oneAccount} currency="INR" today={today} onClose={onClose} {...over} />
    </ToastProvider>,
  )
  return { onClose, user: userEvent.setup() }
}

const rows = () => db.recurring.toArray()
const saved = (): Recurring => ({
  id: 7, kind: 'expense', amountMinor: 1_250_000, currency: 'INR', categoryId: 2, merchant: 'Home loan', note: '', paymentMethod: '',
  frequency: 'monthly', nextDue: '2026-11-05', anchorDay: 5, tag: 'loan', active: true,
})

afterEach(() => vi.restoreAllMocks())

describe('Add a regular payment', () => {
  it('saves a loan EMI with its type, amount, date and the day of the month it keeps to', async () => {
    const { user, onClose } = setup()
    await user.type(screen.getByLabelText('Name'), 'Home loan')
    await user.type(screen.getByLabelText('Amount'), '12,500')
    await user.click(screen.getByRole('button', { name: 'Type' }))
    await user.click(await screen.findByRole('radio', { name: /Loan EMI/ }))
    fireEvent.change(screen.getByLabelText('Next payment date'), { target: { value: '2026-11-05' } })
    await user.click(screen.getByRole('button', { name: 'Add payment' }))

    await waitFor(async () => expect(await rows()).toHaveLength(1))
    expect((await rows())[0]).toMatchObject({
      kind: 'expense', merchant: 'Home loan', amountMinor: 1_250_000, currency: 'INR', frequency: 'monthly',
      nextDue: '2026-11-05', anchorDay: 5, tag: 'loan', active: true, categoryId: 2,
    })
    expect(onClose).toHaveBeenCalled()
    expect(await screen.findByText('Added Home loan')).toBeInTheDocument()
  })

  it('can repeat every week', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Name'), 'Maid')
    await user.type(screen.getByLabelText('Amount'), '200')
    await user.click(screen.getByRole('radio', { name: 'Every week' }))
    fireEvent.change(screen.getByLabelText('Next payment date'), { target: { value: '2026-11-02' } })
    await user.click(screen.getByRole('button', { name: 'Add payment' }))
    await waitFor(async () => expect((await rows())[0]).toMatchObject({ frequency: 'weekly', nextDue: '2026-11-02' }))
  })

  it('records money coming in, filed under Income, with a type that fits', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('radio', { name: 'Coming in' }))
    await user.type(screen.getByLabelText('Name'), 'Salary')
    await user.type(screen.getByLabelText('Amount'), '80000')
    fireEvent.change(screen.getByLabelText('Next payment date'), { target: { value: '2026-11-01' } })
    await user.click(screen.getByRole('button', { name: 'Add payment' }))
    await waitFor(async () => expect((await rows())[0]).toMatchObject({ kind: 'income', tag: 'income', categoryId: 5 }))
  })

  it('offers the types that fit the direction', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Type' }))
    expect(await screen.findByRole('radio', { name: /UPI AutoPay/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Salary or income/ })).toBeNull()
  })

  it('lets the payment come out of a chosen account when there is more than one', async () => {
    const { user } = setup({ accounts: twoAccounts })
    await user.type(screen.getByLabelText('Name'), 'Car loan')
    await user.type(screen.getByLabelText('Amount'), '8000')
    await user.click(screen.getByRole('button', { name: 'Account' }))
    await user.click(await screen.findByRole('radio', { name: 'HDFC' }))
    fireEvent.change(screen.getByLabelText('Next payment date'), { target: { value: '2026-11-10' } })
    await user.click(screen.getByRole('button', { name: 'Add payment' }))
    await waitFor(async () => expect((await rows())[0]).toMatchObject({ accountId: 2 }))
  })

  it('does not ask which account when there is only one', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Account' })).toBeNull()
  })
})

describe('Add a regular payment: what it refuses', () => {
  it.each([
    ['no name', '', '500', '2026-11-05', 'Give it a name'],
    ['no amount', 'Gym', '', '2026-11-05', 'Enter an amount'],
    ['an amount of zero', 'Gym', '0', '2026-11-05', 'Enter an amount'],
    ['an amount that is not a number', 'Gym', '12abc', '2026-11-05', 'Enter an amount'],
    ['no date', 'Gym', '500', '', 'Choose the date'],
  ])('says so for %s, and saves nothing', async (_what, name, amount, date, message) => {
    const { user, onClose } = setup()
    if (name) await user.type(screen.getByLabelText('Name'), name)
    if (amount) await user.type(screen.getByLabelText('Amount'), amount)
    fireEvent.change(screen.getByLabelText('Next payment date'), { target: { value: date } })
    await user.click(screen.getByRole('button', { name: 'Add payment' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(await rows()).toHaveLength(0)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('saves once when Add payment is tapped twice at the same moment', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Name'), 'Gym')
    await user.type(screen.getByLabelText('Amount'), '500')
    fireEvent.change(screen.getByLabelText('Next payment date'), { target: { value: '2026-11-05' } })
    const add = screen.getByRole('button', { name: 'Add payment' })
    await import('@testing-library/react').then(({ act }) =>
      act(() => {
        add.click()
        add.click()
      }),
    )
    await waitFor(async () => expect(await rows()).toHaveLength(1))
    await new Promise((r) => setTimeout(r, 60))
    expect(await rows()).toHaveLength(1)
  })
})

describe('Change a regular payment', () => {
  it('starts from what is saved', () => {
    setup({ rule: saved() })
    expect(screen.getByLabelText('Name')).toHaveValue('Home loan')
    expect(screen.getByLabelText('Amount')).toHaveValue('12500')
    expect(screen.getByLabelText('Next payment date')).toHaveValue('2026-11-05')
    expect(screen.getByRole('radio', { name: 'Every month' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('saves a new amount and date, and keeps the day it falls on up to date', async () => {
    await db.recurring.add({ ...saved(), id: undefined } as never)
    const rule = (await rows())[0]
    const { user, onClose } = setup({ rule })
    const amount = screen.getByLabelText('Amount')
    await user.clear(amount)
    await user.type(amount, '13000')
    fireEvent.change(screen.getByLabelText('Next payment date'), { target: { value: '2026-11-07' } })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(async () => expect((await rows())[0]).toMatchObject({ amountMinor: 1_300_000, nextDue: '2026-11-07', anchorDay: 7, tag: 'loan' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('can be paused, and then it is no longer counted', async () => {
    await db.recurring.add({ ...saved(), id: undefined } as never)
    const rule = (await rows())[0]
    const { user } = setup({ rule })
    await user.click(screen.getByRole('switch', { name: /Pause this payment/ }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(async () => expect((await rows())[0].active).toBe(false))
  })

  it('is deleted after a question, and a no keeps it', async () => {
    await db.recurring.add({ ...saved(), id: undefined } as never)
    const rule = (await rows())[0]
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const { user, onClose } = setup({ rule })
    await user.click(screen.getByRole('button', { name: 'Delete this payment' }))
    expect(await rows()).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Delete this payment' }))
    await waitFor(async () => expect(await rows()).toHaveLength(0))
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(confirm.mock.calls[0][0]).toMatch(/Home loan/)
    expect(onClose).toHaveBeenCalled()
  })

  it('has no delete button for a new payment', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Delete this payment' })).toBeNull()
  })
})
