// @vitest-environment jsdom
import '../test/dom'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { LedgerTx } from '../data/buildLedger'
import { db, type Account, type Category } from '../db/schema'
import type { Suggestion } from '../insights/suggestions'
import { AddSheet } from './AddSheet'
import { ToastProvider } from './toast'

const categories: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Groceries', color: 'var(--s2)' },
  { id: 3, name: 'Other', color: 'var(--other)' },
  { id: 4, name: 'Income', color: 'var(--ink-2)' },
]
const oneAccount: Account[] = [{ id: 1, name: 'Main', openingMinor: null }]
const twoAccounts: Account[] = [...oneAccount, { id: 2, name: 'Cash', openingMinor: null }]

function setup(over: Record<string, unknown> = {}) {
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <AddSheet
        open
        editing={null}
        categories={categories}
        accounts={oneAccount}
        currency="INR"
        suggestions={[]}
        showSuggestions={false}
        prefill={null}
        startKind="expense"
        onClose={onClose}
        {...over}
      />
    </ToastProvider>,
  )
  return { onClose, user: userEvent.setup() }
}

const saved = () => db.transactions.toArray()

describe('Add form: saving', () => {
  it('saves what was typed as money sent, in whole minor units', async () => {
    const { user, onClose } = setup()
    await user.type(screen.getByLabelText('Amount'), '1,250.50')
    await user.click(screen.getByLabelText('Groceries'))
    await user.type(screen.getByLabelText('Merchant'), 'Big Basket')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(async () => expect(await saved()).toHaveLength(1))
    expect((await saved())[0]).toMatchObject({ kind: 'expense', amountMinor: 125_050, categoryId: 2, merchant: 'Big Basket', currency: 'INR', source: 'manual' })
    expect(onClose).toHaveBeenCalled()
  })

  it('files an expense under Other when no category was picked', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Amount'), '90')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    expect((await saved())[0].categoryId).toBe(3)
  })

  it('refuses a missing or zero amount, says so, and saves nothing', async () => {
    const { user, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an amount, like 250 or 250.50.')
    await user.type(screen.getByLabelText('Amount'), '0')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount, like 250 or 250.50.')
    expect(await saved()).toHaveLength(0)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clears the error as soon as the amount is corrected', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await screen.findByRole('alert')
    await user.type(screen.getByLabelText('Amount'), '5')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('saves received money under Income', async () => {
    const { user } = setup()
    await user.click(screen.getByLabelText('Received'))
    await user.type(screen.getByLabelText('Amount'), '80000')
    await user.type(screen.getByLabelText('From'), 'Employer')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    expect((await saved())[0]).toMatchObject({ kind: 'income', amountMinor: 8_000_000, categoryId: 4, merchant: 'Employer' })
  })

  it('opens on Received when a shortcut asks for it', () => {
    setup({ startKind: 'income' })
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })
})

describe('Add form: more details', () => {
  it('starts folded, summarises the date, and keeps note and payment method when opened', async () => {
    const { user } = setup()
    expect(screen.getByText('More details')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    await user.click(screen.getByText('More details'))
    await user.type(screen.getByLabelText('Note'), 'team lunch')
    await user.click(screen.getByLabelText('Card'))
    await user.type(screen.getByLabelText('Amount'), '300')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    expect((await saved())[0]).toMatchObject({ note: 'team lunch', paymentMethod: 'Card' })
  })

  it('clears the payment method when the chosen one is tapped again', async () => {
    const { user } = setup()
    await user.click(screen.getByText('More details'))
    await user.click(screen.getByLabelText('Cash'))
    await user.click(screen.getByLabelText('Cash'))
    await user.type(screen.getByLabelText('Amount'), '10')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    expect((await saved())[0].paymentMethod).toBe('')
  })

  it('makes a recurring rule when asked to repeat', async () => {
    const { user } = setup()
    await user.click(screen.getByText('More details'))
    await user.click(screen.getByRole('button', { name: 'Repeat' }))
    await user.click(screen.getByRole('radio', { name: 'Every month' }))
    await user.type(screen.getByLabelText('Amount'), '18000')
    await user.type(screen.getByLabelText('Merchant'), 'Rent')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect(await db.recurring.count()).toBe(1))
    expect(await db.recurring.toArray()).toMatchObject([{ merchant: 'Rent', amountMinor: 1_800_000, frequency: 'monthly', active: true }])
  })
})

describe('Add form: currency', () => {
  it('opens a list of currencies, and saves the one picked', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Currency' }))
    await user.click(await screen.findByRole('radio', { name: /USD/ }))
    await user.type(screen.getByLabelText('Amount'), '10')
    expect(screen.getByText(/Recorded in USD/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    expect((await saved())[0]).toMatchObject({ currency: 'USD', amountMinor: 1000 })
  })

  it('can search the list', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Currency' }))
    await user.type(screen.getByRole('searchbox'), 'franc')
    expect(await screen.findByRole('radio', { name: /CHF/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /USD/ })).toBeNull()
  })
})

describe('Add form: transfer', () => {
  it('moves money between two accounts, in no category total', async () => {
    const { user } = setup({ accounts: twoAccounts })
    await user.click(screen.getByLabelText('Transfer'))
    await user.type(screen.getByLabelText('Amount'), '2000')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    expect((await saved())[0]).toMatchObject({ kind: 'transfer', amountMinor: 200_000, accountId: 1, toAccountId: 2 })
  })

  it('does not offer a transfer with only one account', () => {
    setup()
    expect(screen.queryByLabelText('Transfer')).toBeNull()
  })

  it('refuses a transfer to the same account', async () => {
    const { user } = setup({ accounts: twoAccounts })
    await user.click(screen.getByLabelText('Transfer'))
    await user.click(screen.getByRole('button', { name: 'To' }))
    await user.click(await screen.findByRole('radio', { name: 'Main' }))
    await user.type(screen.getByLabelText('Amount'), '100')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose two different accounts.')
    expect(await saved()).toHaveLength(0)
  })
})

describe('Add form: suggestions', () => {
  const swiggy: Suggestion = {
    key: 'expense:swiggy', kind: 'expense', merchant: 'Swiggy', amountMinor: 45_000, categoryId: 1,
    paymentMethod: 'Online', reason: 'Usually in the evening', count: 5,
  }

  it('fills the form with one tap', async () => {
    const { user } = setup({ suggestions: [swiggy], showSuggestions: true })
    await user.click(screen.getByRole('button', { name: /Swiggy/ }))
    expect(screen.getByLabelText('Amount')).toHaveValue('450')
    expect(screen.getByLabelText('Merchant')).toHaveValue('Swiggy')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    expect((await saved())[0]).toMatchObject({ merchant: 'Swiggy', amountMinor: 45_000, categoryId: 1, paymentMethod: 'Online' })
  })

  it('starts already filled in when opened from a suggestion on Home', () => {
    setup({ prefill: swiggy })
    expect(screen.getByLabelText('Amount')).toHaveValue('450')
    expect(screen.getByLabelText('Merchant')).toHaveValue('Swiggy')
  })
})

describe('Add form: editing', () => {
  const existing = async (): Promise<LedgerTx> => {
    const id = await db.transactions.add({
      kind: 'expense', amountMinor: 45_000, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: 'old', date: '2026-10-05',
      paymentMethod: '', source: 'manual', createdAt: 1,
    } as never)
    return (await db.transactions.get(id)) as LedgerTx
  }

  it('shows the saved values and saves the changes', async () => {
    const editing = await existing()
    const { user, onClose } = setup({ editing })
    expect(screen.getByLabelText('Amount')).toHaveValue('450')
    expect(screen.getByLabelText('Merchant')).toHaveValue('Cafe')
    await user.clear(screen.getByLabelText('Amount'))
    await user.type(screen.getByLabelText('Amount'), '500')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(async () => expect((await saved())[0].amountMinor).toBe(50_000))
    expect(await saved()).toHaveLength(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('deletes into the trash rather than for good', async () => {
    const editing = await existing()
    const { user } = setup({ editing })
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await saved())[0].deletedAt).toBeTypeOf('number'))
  })

  it('copies a transaction to today', async () => {
    const editing = await existing()
    const { user } = setup({ editing })
    await user.click(screen.getByRole('button', { name: /Copy this transaction/ }))
    await waitFor(async () => expect(await saved()).toHaveLength(2))
    const [, copy] = await saved()
    expect(copy).toMatchObject({ merchant: 'Cafe', amountMinor: 45_000 })
  })
})

describe('Add form: lists inside the form', () => {
  // The form closes itself when its own sheet closes. A list opened inside it is a second sheet, and
  // choosing something there must close only that list, never the form behind it.
  function Controlled({ onClosed }: { onClosed: () => void }) {
    const [open, setOpen] = useState(true)
    return (
      <ToastProvider>
        <AddSheet
          open={open}
          editing={null}
          categories={categories}
          accounts={twoAccounts}
          currency="INR"
          suggestions={[]}
          showSuggestions={false}
          prefill={null}
          startKind="expense"
          onClose={() => {
            setOpen(false)
            onClosed()
          }}
        />
      </ToastProvider>
    )
  }

  it.each([
    ['currency', 'Currency', /USD/],
    ['account', 'Paid from', /Cash/],
  ])('stays open when a %s is chosen from its list', async (_what, button, option) => {
    const onClosed = vi.fn()
    const user = userEvent.setup()
    render(<Controlled onClosed={onClosed} />)
    await user.click(screen.getByRole('button', { name: button }))
    const list = await screen.findByRole('dialog', { name: button })
    await user.click(within(list).getByRole('radio', { name: option }))
    expect(onClosed).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'New transaction' })).toBeInTheDocument()
  })

  it('stays open when the repeat list is used inside More details', async () => {
    const onClosed = vi.fn()
    const user = userEvent.setup()
    render(<Controlled onClosed={onClosed} />)
    await user.click(screen.getByText('More details'))
    await user.click(screen.getByRole('button', { name: 'Repeat' }))
    await user.click(await screen.findByRole('radio', { name: 'Every week' }))
    expect(onClosed).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'New transaction' })).toBeInTheDocument()
  })

  it('still closes when its own close button is pressed', async () => {
    const onClosed = vi.fn()
    const user = userEvent.setup()
    render(<Controlled onClosed={onClosed} />)
    await user.click(screen.getAllByRole('button', { name: 'Close' })[0])
    expect(onClosed).toHaveBeenCalledOnce()
  })
})

describe('Add form: tapping twice', () => {
  it('saves once when Add is tapped twice in a row', async () => {
    const { user, onClose } = setup()
    await user.type(screen.getByLabelText('Amount'), '100')
    // Both taps land in the same instant, before the first save has finished: what a quick double tap does.
    const add = screen.getByRole('button', { name: 'Add' })
    act(() => {
      add.click()
      add.click() // React hasn't redrawn yet, so the button isn't disabled: only the guard can stop this one
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 60))
    expect(await saved()).toHaveLength(1)
  })

  it('can be used again after a save that failed', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Amount'), '1e22') // not a plain number: refused before saving
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled()
  })
})
