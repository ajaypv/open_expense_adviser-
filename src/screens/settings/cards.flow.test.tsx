// @vitest-environment jsdom
import '../../test/dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { reloadDisplay } from '../../data/display'
import { useLedger } from '../../data/useLedger'
import { cardStyleName, defaultCardStyle } from '../../db/cardStyles'
import { addCreditCard, setCardStyle } from '../../db/repo'
import { db, type Category, type Transaction } from '../../db/schema'
import { makeLedger } from '../../test/ledger'
import { ToastProvider } from '../../ui/toast'
import { AccountsSection } from './AccountsSection'
import { BalanceTrail } from './BalanceTrail'
import type { Ledger } from './parts'

beforeEach(() => reloadDisplay())

function Live({ children }: { children: (ledger: Ledger) => ReactNode }) {
  return <>{children(useLedger())}</>
}
const mount = () =>
  render(
    <ToastProvider>
      <Live>{(l) => <AccountsSection ledger={l} />}</Live>
    </ToastProvider>,
  )

const cards = async () => (await db.accounts.toArray()).filter((a) => a.type === 'credit')

describe('Settings: adding a credit card', () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, fields: Record<string, string>) {
    const form = await screen.findByRole('form', { name: 'Add a credit card' })
    for (const [label, value] of Object.entries(fields)) await user.type(within(form).getByLabelText(label), value)
    return form
  }

  it('makes a card with its limit, statement and due days, and what is owed now, in minor units', async () => {
    const user = userEvent.setup()
    mount()
    const form = await fill(user, { 'Card name': 'HDFC card', 'Credit limit': '5,00,000', 'You owe now': '12,500.50', 'Statement day': '15', 'Due day': '3' })
    await user.click(within(form).getByRole('button', { name: 'Add card' }))
    await waitFor(async () => expect(await cards()).toHaveLength(1))
    expect((await cards())[0]).toMatchObject({ name: 'HDFC card', type: 'credit', creditLimitMinor: 50_000_000, statementDay: 15, dueDay: 3, openingMinor: -1_250_050 })
    expect(await screen.findByText('Credit card added')).toBeInTheDocument()
    expect(within(form).getByLabelText('Card name')).toHaveValue('')
  })

  it('needs only a name', async () => {
    const user = userEvent.setup()
    mount()
    const form = await fill(user, { 'Card name': 'Amex' })
    await user.click(within(form).getByRole('button', { name: 'Add card' }))
    await waitFor(async () => expect(await cards()).toHaveLength(1))
    expect((await cards())[0]).toMatchObject({ name: 'Amex', openingMinor: null })
  })

  it('refuses an empty name and a day outside 1 to 28, and says so', async () => {
    const user = userEvent.setup()
    mount()
    const form = await screen.findByRole('form', { name: 'Add a credit card' })
    await user.click(within(form).getByRole('button', { name: 'Add card' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Give the card a name')
    await user.type(within(form).getByLabelText('Card name'), 'Amex')
    await user.type(within(form).getByLabelText('Statement day'), '31')
    await user.click(within(form).getByRole('button', { name: 'Add card' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Choose a statement day from 1 to 28')
    expect(await cards()).toHaveLength(0)
  })

  it('refuses words where numbers belong', async () => {
    const user = userEvent.setup()
    mount()
    const form = await fill(user, { 'Card name': 'Amex', 'Credit limit': 'lots' })
    await user.click(within(form).getByRole('button', { name: 'Add card' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Enter the amounts and the days as numbers')
  })
})

describe('Settings: a credit card in the accounts list', () => {
  const rowOf = async (name: string) => (await screen.findByText(name)).closest('li') as HTMLElement

  it('says it is a credit card, and asks what you owe, not for a balance', async () => {
    await addCreditCard('HDFC card', {}, 50_000)
    const user = userEvent.setup()
    mount()
    const row = await rowOf('HDFC card')
    expect(row).toHaveTextContent('Credit card. Amount owed set')
    await user.click(within(row).getByRole('button', { name: /Edit/ }))
    expect(within(row).getByLabelText(/Amount you owe today/)).toBeInTheDocument()
    expect(within(row).queryByLabelText(/Balance today/)).toBeNull()
    expect(within(row).getByRole('button', { name: 'Clear amount owed' })).toBeInTheDocument()
  })

  it('keeps an ordinary account as it was, with a balance and no card details', async () => {
    const user = userEvent.setup()
    mount()
    const row = await rowOf('Main')
    await user.click(within(row).getByRole('button', { name: /Edit/ }))
    expect(within(row).getByLabelText(/Balance today/)).toBeInTheDocument()
    expect(within(row).queryByRole('form', { name: /card details/ })).toBeNull()
  })

  it('stores what you owe so the estimate matches, whatever has been charged since', async () => {
    const card = await addCreditCard('HDFC card')
    await db.transactions.add({ kind: 'expense', amountMinor: 50_000, currency: 'INR', categoryId: 1, merchant: 'Shop', note: '', date: '2026-11-05', paymentMethod: '', source: 'manual', createdAt: 1, accountId: card } as never)
    const user = userEvent.setup()
    mount()
    const row = await rowOf('HDFC card')
    await user.click(within(row).getByRole('button', { name: /Edit/ }))
    await user.type(within(row).getByLabelText(/Amount you owe today/), '1,500')
    await user.click(within(row).getByRole('button', { name: 'Save' }))
    // Owing 1,500 now with 500 of it charged here: it was 1,000 before, so the opening amount owed is 1,000.
    await waitFor(async () => expect((await db.accounts.get(card))?.openingMinor).toBe(-100_000))
    expect(await screen.findByText('HDFC card: amount owed saved')).toBeInTheDocument()
  })

  it('saves the limit and the two days, and takes one away when left empty', async () => {
    const card = await addCreditCard('HDFC card', { creditLimitMinor: 100_000, statementDay: 10, dueDay: 2 })
    const user = userEvent.setup()
    mount()
    const row = await rowOf('HDFC card')
    await user.click(within(row).getByRole('button', { name: /Edit/ }))
    const form = within(row).getByRole('form', { name: 'HDFC card card details' })
    expect(within(form).getByLabelText(/Credit limit/)).toHaveValue('1000')
    await user.clear(within(form).getByLabelText(/Credit limit/))
    await user.type(within(form).getByLabelText(/Credit limit/), '2,500')
    await user.clear(within(form).getByLabelText('Statement day'))
    await user.clear(within(form).getByLabelText('Due day'))
    await user.type(within(form).getByLabelText('Due day'), '5')
    await user.click(within(form).getByRole('button', { name: 'Save card' }))
    await waitFor(async () => expect((await db.accounts.get(card))?.dueDay).toBe(5))
    const saved = (await db.accounts.get(card))!
    expect(saved.creditLimitMinor).toBe(250_000)
    expect(saved.statementDay).toBeUndefined()
  })

  it('refuses a day outside 1 to 28 when saving the card', async () => {
    const card = await addCreditCard('HDFC card', { dueDay: 2 })
    const user = userEvent.setup()
    mount()
    const row = await rowOf('HDFC card')
    await user.click(within(row).getByRole('button', { name: /Edit/ }))
    const form = within(row).getByRole('form', { name: 'HDFC card card details' })
    await user.clear(within(form).getByLabelText('Due day'))
    await user.type(within(form).getByLabelText('Due day'), '30')
    await user.click(within(form).getByRole('button', { name: 'Save card' }))
    expect(await within(row).findByRole('alert')).toHaveTextContent('Choose a due day from 1 to 28')
    expect((await db.accounts.get(card))?.dueDay).toBe(2)
  })
})

describe('Settings: the balance trail leaves out the card', () => {
  const categories: Category[] = [{ id: 1, name: 'Other', color: 'var(--other)' }]
  const now = new Date(2026, 10, 2, 12, 0).getTime()
  let id = 0
  const tx = (merchant: string, extra: Partial<Transaction>): Transaction => ({
    id: ++id, kind: 'expense', amountMinor: 10_000, currency: 'INR', categoryId: 1, merchant, note: '', date: '2026-11-01',
    paymentMethod: '', source: 'manual', createdAt: now - 1000, ...extra,
  })

  it('shows what moved the cash balance, not what was charged to a card', () => {
    const accounts = [{ id: 1, name: 'Main', openingMinor: null }, { id: 2, name: 'HDFC', openingMinor: null, type: 'credit' as const }]
    render(
      <BalanceTrail
        ledger={makeLedger({ txs: [tx('Cash lunch', { accountId: 1 }), tx('Card shopping', { accountId: 2 })], accounts, categories, categoryById: new Map(categories.map((c) => [c.id, c])) })}
        now={now}
      />,
    )
    const latest = screen.getByRole('list', { name: 'Latest changes' })
    expect(latest).toHaveTextContent('Cash lunch')
    expect(latest).not.toHaveTextContent('Card shopping')
  })
})

describe('Settings: choosing how a card looks', () => {
  const rowOf = async (name: string) => (await screen.findByText(name)).closest('li') as HTMLElement
  const looks = (row: HTMLElement) => within(within(row).getByRole('radiogroup', { name: /look$/ })).getAllByRole('radio')

  it('shows a card in its list row as a small card of its own look, not a round icon', async () => {
    const id = await addCreditCard('HDFC card')
    mount()
    const row = await rowOf('HDFC card')
    expect(row.querySelector('[data-card-style]')).not.toBeNull()
    expect(row.querySelector('[data-icon="card"]')).toBeNull()
    expect(id).toBeGreaterThan(0)
  })

  it('keeps a plain account’s round bank icon', async () => {
    mount()
    const row = await rowOf('Main')
    expect(row.querySelector('[data-icon="bank"]')).not.toBeNull()
    expect(row.querySelector('[data-card-style]')).toBeNull()
  })

  it('offers ten looks, none see-through, with the card’s own marked', async () => {
    const id = await addCreditCard('HDFC card')
    const user = userEvent.setup()
    mount()
    const row = await rowOf('HDFC card')
    await user.click(within(row).getByRole('button', { name: /Edit/ }))
    const radios = looks(row)
    expect(radios).toHaveLength(10)
    expect(radios.map((r) => r.getAttribute('aria-label'))).not.toContain('Transparent')
    expect(radios.filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1)
    expect(radios.find((r) => (r as HTMLInputElement).checked)!.getAttribute('aria-label')).toBe(cardStyleName(defaultCardStyle(id)))
  })

  it('saves the look that is chosen, and draws the row in it', async () => {
    const id = await addCreditCard('HDFC card')
    const user = userEvent.setup()
    mount()
    const row = await rowOf('HDFC card')
    await user.click(within(row).getByRole('button', { name: /Edit/ }))
    await user.click(within(row).getByRole('radio', { name: 'Gray dark' }))
    await waitFor(async () => expect((await db.accounts.get(id))!.cardStyle).toBe('gray-dark'))
    await waitFor(() => expect(row.querySelector('[data-card-style="gray-dark"]')).not.toBeNull())
    expect(within(row).getByRole('radio', { name: 'Gray dark' })).toBeChecked()
  })

  it('has no choice of look for an ordinary account', async () => {
    const user = userEvent.setup()
    mount()
    const row = await rowOf('Main')
    await user.click(within(row).getByRole('button', { name: /Edit/ }))
    expect(within(row).queryByRole('radiogroup')).toBeNull()
  })

  it('refuses a look for something that is not a credit card, and a look that does not exist', async () => {
    const mainId = (await db.accounts.toArray()).find((a) => a.type === undefined)!.id
    await expect(setCardStyle(mainId, 'gray-dark')).rejects.toThrow('That is not a credit card')
    const card = await addCreditCard('HDFC card')
    await expect(setCardStyle(card, 'neon' as never)).rejects.toThrow('Choose one of the card looks')
  })
})
