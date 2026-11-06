// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LedgerTx } from '../data/buildLedger'
import { db, type Account, type Category, type Person } from '../db/schema'
import { AddSheet } from './AddSheet'
import { ToastProvider } from './toast'

const categories: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Groceries', color: 'var(--s2)' },
  { id: 3, name: 'Other', color: 'var(--other)' },
  { id: 4, name: 'Income', color: 'var(--ink-2)' },
]
const accounts: Account[] = [{ id: 1, name: 'Main', openingMinor: null }]
const people: Person[] = [
  { id: 1, name: 'Shweta Rao', createdAt: 1 },
  { id: 2, name: 'Ankit', createdAt: 2 },
]

beforeEach(async () => {
  await db.people.bulkAdd(people)
})

function setup(over: Record<string, unknown> = {}) {
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <AddSheet open editing={null} categories={categories} accounts={accounts} people={people} currency="INR" suggestions={[]} showSuggestions={false} prefill={null} startKind="expense" onClose={onClose} {...over} />
    </ToastProvider>,
  )
  return { onClose, user: userEvent.setup() }
}

const toggle = () => screen.getByLabelText('Sent to a person')
const nameField = () => screen.getByRole('combobox', { name: 'Sent to' })
const delivery = () => within(screen.getByRole('radiogroup', { name: 'Has the money reached them' }))
const saved = () => db.transactions.toArray()

describe('Add form: sending money to a person', () => {
  it('offers it for money spent, and not for money received or moved', async () => {
    const { user } = setup({ accounts: [...accounts, { id: 2, name: 'Cash', openingMinor: null }] })
    expect(toggle()).not.toBeChecked()
    await user.click(screen.getByLabelText('Received'))
    expect(screen.queryByLabelText('Sent to a person')).toBeNull()
    await user.click(screen.getByLabelText('Transfer'))
    expect(screen.queryByLabelText('Sent to a person')).toBeNull()
  })

  it('swaps the merchant for a person, a date and whether they have it', async () => {
    const { user } = setup()
    expect(screen.getByLabelText('Merchant')).toBeInTheDocument()
    await user.click(toggle())
    expect(screen.queryByLabelText('Merchant')).toBeNull()
    expect(nameField()).toBeInTheDocument()
    expect(screen.getByLabelText('Sent on')).toBeInTheDocument()
    expect(delivery().getByLabelText('Not received yet')).toBeChecked()
    await user.click(toggle())
    expect(screen.getByLabelText('Merchant')).toBeInTheDocument()
  })

  it('lists the people who fit as the name is typed, and fills the name in when one is chosen', async () => {
    const { user } = setup()
    await user.click(toggle())
    await user.type(nameField(), 'sh')
    const list = screen.getByRole('listbox', { name: 'People' })
    expect(within(list).getAllByRole('option')).toHaveLength(1)
    await user.click(within(within(list).getByRole('option', { name: /Shweta Rao/ })).getByRole('button'))
    expect(nameField()).toHaveValue('Shweta Rao')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('shows the people sent to most recently as soon as the field is touched, before anything is typed', async () => {
    const { user } = setup()
    await user.click(toggle())
    await user.click(nameField())
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Shweta Rao', 'Ankit'])
  })

  it('moves through the list with the arrow keys and chooses with Enter, without saving the form', async () => {
    const { user, onClose } = setup()
    await user.click(toggle())
    await user.click(nameField())
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(nameField()).toHaveValue('Ankit')
    expect(onClose).not.toHaveBeenCalled()
    expect(await saved()).toHaveLength(0)
  })

  it('saves a payment to someone known: their name, their id, not received yet, on the chosen day', async () => {
    const { user, onClose } = setup()
    await user.click(toggle())
    await user.type(nameField(), 'shw')
    await user.click(within(screen.getByRole('option', { name: /Shweta/ })).getByRole('button'))
    await user.type(screen.getByLabelText('Amount'), '500')
    const date = screen.getByLabelText('Sent on')
    await user.clear(date)
    await user.type(date, '2020-01-15')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(async () => expect(await saved()).toHaveLength(1))
    const [row] = await saved()
    expect(row).toMatchObject({ kind: 'expense', amountMinor: 50_000, merchant: 'Shweta Rao', personId: 1, delivery: 'sent', date: '2020-01-15', categoryId: 3 })
    expect(row.receivedAt).toBeUndefined()
    expect(onClose).toHaveBeenCalled()
    expect(await screen.findByText('Sent ₹500 to Shweta Rao')).toBeInTheDocument()
  })

  it('saves it as received, with when, when they already have it', async () => {
    const { user } = setup()
    await user.click(toggle())
    await user.type(nameField(), 'Ankit')
    await user.type(screen.getByLabelText('Amount'), '75')
    await user.click(delivery().getByLabelText('Received by them'))
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    const [row] = await saved()
    expect(row).toMatchObject({ merchant: 'Ankit', personId: 2, delivery: 'received' })
    expect(typeof row.receivedAt).toBe('number')
  })

  it('remembers a new name, with no copy made of one that is known, and files the payment under it', async () => {
    const { user } = setup()
    await user.click(toggle())
    await user.type(nameField(), '  kavya  nair ')
    expect(screen.getByText(/New person/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Amount'), '120')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    const kavya = (await db.people.toArray()).find((p) => p.name === 'kavya nair')!
    expect(kavya).toBeDefined()
    expect((await saved())[0]).toMatchObject({ merchant: 'kavya nair', personId: kavya.id })
    expect(await db.people.count()).toBe(3)
  })

  it('treats a typed name that is already known as that person, whatever its case', async () => {
    const { user } = setup()
    await user.click(toggle())
    await user.type(nameField(), 'SHWETA RAO')
    await user.type(screen.getByLabelText('Amount'), '10')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    expect((await saved())[0]).toMatchObject({ merchant: 'Shweta Rao', personId: 1 })
    expect(await db.people.count()).toBe(2)
  })

  it('asks who it was sent to, and saves nothing, when the name is empty', async () => {
    const { user, onClose } = setup()
    await user.click(toggle())
    await user.type(screen.getByLabelText('Amount'), '100')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter who you sent it to.')
    expect(await saved()).toHaveLength(0)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('saves a second tap on Add only once', async () => {
    const { user } = setup()
    await user.click(toggle())
    await user.type(nameField(), 'Ankit')
    await user.type(screen.getByLabelText('Amount'), '10')
    const add = screen.getByRole('button', { name: 'Add' })
    // Both taps land before anything has been saved.
    fireEvent.click(add)
    fireEvent.click(add)
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(await saved()).toHaveLength(1)
  })

  it('does not offer people for an ordinary purchase, which keeps its merchant', async () => {
    const { user } = setup()
    // The amount takes focus on the next frame, so it is filled first, as in the other tests.
    await user.type(screen.getByLabelText('Amount'), '90')
    await user.type(screen.getByLabelText('Merchant'), 'Cafe')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect(await saved()).toHaveLength(1))
    const [row] = await saved()
    expect(row.merchant).toBe('Cafe')
    expect(row.personId).toBeUndefined()
    expect(row.delivery).toBeUndefined()
  })
})

describe('Add form: editing a payment to a person', () => {
  async function seed(over: Partial<LedgerTx> = {}) {
    const id = (await db.transactions.add({
      kind: 'expense', amountMinor: 30_000, currency: 'INR', categoryId: 3, merchant: 'Shweta Rao', note: '', date: '2026-11-01',
      paymentMethod: '', source: 'manual', createdAt: 5, personId: 1, delivery: 'sent', ...over,
    } as never)) as number
    return (await db.transactions.get(id)) as LedgerTx
  }

  it('opens with the person, the date and the state it was saved with', async () => {
    const row = await seed()
    setup({ editing: row })
    expect(toggle()).toBeChecked()
    expect(nameField()).toHaveValue('Shweta Rao')
    expect(screen.getByLabelText('Sent on')).toHaveValue('2026-11-01')
    expect(delivery().getByLabelText('Not received yet')).toBeChecked()
  })

  it('marks it received, and back again', async () => {
    const row = await seed()
    const { user } = setup({ editing: row })
    await user.click(delivery().getByLabelText('Received by them'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(async () => expect((await db.transactions.get(row.id))?.delivery).toBe('received'))
    expect(typeof (await db.transactions.get(row.id))?.receivedAt).toBe('number')
  })

  it('forgets it was received when set back to not received', async () => {
    const row = await seed({ delivery: 'received', receivedAt: 99 })
    const { user } = setup({ editing: row })
    expect(delivery().getByLabelText('Received by them')).toBeChecked()
    await user.click(delivery().getByLabelText('Not received yet'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(async () => expect((await db.transactions.get(row.id))?.delivery).toBe('sent'))
    expect((await db.transactions.get(row.id))?.receivedAt).toBeUndefined()
  })

  it('turns an ordinary payment into one to a person, and back into a plain purchase', async () => {
    const plain = await seed({ personId: undefined, delivery: undefined, merchant: 'Cafe' })
    const first = setup({ editing: plain })
    expect(toggle()).not.toBeChecked()
    await first.user.click(toggle())
    await first.user.type(nameField(), 'Ankit')
    await first.user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(async () => expect(await db.transactions.get(plain.id)).toMatchObject({ merchant: 'Ankit', personId: 2, delivery: 'sent' }))
  })

  it('forgets the person when the switch is turned off', async () => {
    const row = await seed()
    const { user } = setup({ editing: row })
    await user.click(toggle())
    await user.clear(screen.getByLabelText('Merchant'))
    await user.type(screen.getByLabelText('Merchant'), 'Rent')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(async () => expect((await db.transactions.get(row.id))?.merchant).toBe('Rent'))
    const after = (await db.transactions.get(row.id))!
    expect(after.personId).toBeUndefined()
    expect(after.delivery).toBeUndefined()
  })
})

describe('Add form: the phone’s contacts', () => {
  const nav = navigator as unknown as { contacts?: unknown }
  const win = window as unknown as { ContactsManager?: unknown }
  afterEach(() => {
    delete nav.contacts
    delete win.ContactsManager
  })

  it('has no contacts button where the browser cannot open contacts', async () => {
    const { user } = setup()
    await user.click(toggle())
    expect(screen.queryByRole('button', { name: 'Choose from your contacts' })).toBeNull()
  })

  it('fills in the person chosen in the phone’s picker, and remembers them with their number', async () => {
    const select = vi.fn().mockResolvedValue([{ name: ['Meera Shetty'], tel: ['+91 99999 11111'] }])
    nav.contacts = { select }
    win.ContactsManager = class {}
    const { user } = setup()
    await user.click(toggle())
    await user.click(screen.getByRole('button', { name: 'Choose from your contacts' }))
    expect(select).toHaveBeenCalledWith(['name', 'tel'], { multiple: false })
    await waitFor(() => expect(nameField()).toHaveValue('Meera Shetty'))
    expect((await db.people.toArray()).find((p) => p.name === 'Meera Shetty')?.phone).toBe('+91 99999 11111')
  })

  it('says so when the phone refuses, and keeps what was typed', async () => {
    nav.contacts = { select: vi.fn().mockRejectedValue(new DOMException('no', 'SecurityError')) }
    win.ContactsManager = class {}
    const { user } = setup()
    await user.click(toggle())
    await user.type(nameField(), 'Ank')
    await user.click(screen.getByRole('button', { name: 'Choose from your contacts' }))
    expect(await screen.findByText(/Couldn’t open your contacts/)).toBeInTheDocument()
    expect(nameField()).toHaveValue('Ank')
  })

  it('changes nothing when the picker is closed without choosing', async () => {
    nav.contacts = { select: vi.fn().mockResolvedValue([]) }
    win.ContactsManager = class {}
    const { user } = setup()
    await user.click(toggle())
    await user.click(screen.getByRole('button', { name: 'Choose from your contacts' }))
    expect(nameField()).toHaveValue('')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
