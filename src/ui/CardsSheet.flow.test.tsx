// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LedgerTx } from '../data/buildLedger'
import { reloadDisplay } from '../data/display'
import { useLedger } from '../data/useLedger'
import { addCreditCard, setCardStyle } from '../db/repo'
import { db } from '../db/schema'
import { CardsCard } from './CardsCard'
import { defaultCardStyle } from '../db/cardStyles'
import { CardsSheet } from './CardsSheet'
import { ToastProvider } from './toast'

beforeEach(() => reloadDisplay())

const today = new Date(2026, 10, 6) // Fri 6 Nov 2026

function Sheet({ onClose, onEdit }: { onClose: () => void; onEdit: (tx: LedgerTx) => void }) {
  return <CardsSheet open ledger={useLedger()} today={today} onClose={onClose} onEdit={onEdit} />
}
function mount(onClose = vi.fn(), onEdit = vi.fn()) {
  render(
    <ToastProvider>
      <Sheet onClose={onClose} onEdit={onEdit} />
    </ToastProvider>,
  )
  return { onClose, onEdit, user: userEvent.setup() }
}

const mainId = async () => (await db.accounts.toArray()).find((a) => a.type === undefined)!.id
const add = async (over: Record<string, unknown>) =>
  (await db.transactions.add({
    kind: 'expense', amountMinor: 10_000, currency: 'INR', categoryId: 1, merchant: 'Shop', note: '', date: '2026-11-05', paymentMethod: '',
    source: 'manual', createdAt: Date.now() + Math.random(), ...over,
  } as never)) as number

/** A card owing ₹1,000 to begin with, ₹2,500 charged this statement and ₹1,000 paid: ₹2,500 owed of a ₹5,000 limit. */
async function seedCard(details: Record<string, unknown> = {}) {
  const card = await addCreditCard('HDFC card', { creditLimitMinor: 500_000, statementDay: 15, dueDay: 3, ...details }, 100_000)
  await add({ amountMinor: 250_000, merchant: 'Croma', accountId: card, date: '2026-11-05' })
  await add({ kind: 'transfer', amountMinor: 100_000, accountId: await mainId(), toAccountId: card, date: '2026-11-01', merchant: '' })
  return card
}

describe('Credit cards: where you stand', () => {
  it('says what is owed, how much of the limit that is, and what is available', async () => {
    await seedCard()
    mount()
    const standing = await screen.findByRole('region', { name: 'HDFC card standing' })
    expect(within(standing).getByText('You owe')).toBeInTheDocument()
    expect(within(standing).getByText('₹2,500')).toBeInTheDocument()
    const meter = within(standing).getByRole('meter', { name: 'Credit limit used' })
    expect(meter).toHaveAttribute('aria-valuetext', '50% of the ₹5,000 limit used')
    expect(standing).toHaveTextContent('₹2,500 available')
    expect(standing).toHaveTextContent('50% of ₹5,000 limit')
  })

  it('says when the bill is due, in days', async () => {
    await seedCard()
    mount()
    expect(await screen.findByText(/Bill due .*, in 27 days/)).toBeInTheDocument()
  })

  it('warns when the bill is due within three days', async () => {
    await seedCard({ dueDay: 8 })
    mount()
    const line = await screen.findByText(/Bill due .*, in 2 days/)
    expect(line.closest('p')?.className).toContain('text-critical')
  })

  it('says when the limit has been passed, and has no limit line without one', async () => {
    await seedCard({ creditLimitMinor: 200_000 })
    mount()
    expect(await screen.findByText('Over the limit')).toBeInTheDocument()
  })

  it('has no limit meter when no limit is set, and says there is no due day', async () => {
    await seedCard({ creditLimitMinor: null, dueDay: null })
    mount()
    await screen.findByRole('region', { name: 'HDFC card standing' })
    expect(screen.queryByRole('meter')).toBeNull()
    expect(screen.getByText(/No due day set/)).toBeInTheDocument()
  })

  it('says what this statement holds: charged and paid', async () => {
    await seedCard()
    mount()
    expect(await screen.findByText(/This statement, .* to .*: ₹2,500 charged, ₹1,000 paid/)).toBeInTheDocument()
  })

  it('says it is in credit, rather than owed, once overpaid', async () => {
    const card = await addCreditCard('Amex', {}, 0)
    await add({ kind: 'transfer', amountMinor: 50_000, accountId: await mainId(), toAccountId: card, merchant: '' })
    mount()
    const standing = await screen.findByRole('region', { name: 'Amex standing' })
    expect(within(standing).getByText('In credit')).toBeInTheDocument()
    expect(within(standing).getByText('₹500')).toBeInTheDocument()
    expect(within(standing).getByText('Nothing to pay')).toBeInTheDocument()
  })

  it('says there are no cards, and where to add one, when there are none', async () => {
    mount()
    expect(await screen.findByText(/No credit cards yet/)).toBeInTheDocument()
  })
})

describe('Credit cards: the log', () => {
  it('lists the charges and payments of a statement, newest first, under what was charged and paid in it', async () => {
    await seedCard()
    mount()
    const log = await screen.findByRole('region', { name: 'HDFC card log' })
    const statement = within(log).getByRole('heading', { name: 'This statement' }).closest('[data-statement]') as HTMLElement
    expect(statement).toHaveTextContent('₹2,500 charged, ₹1,000 paid')
    const rows = [...statement.querySelectorAll('[data-entry]')]
    expect(rows.map((r) => r.getAttribute('data-entry'))).toEqual(['charge', 'payment'])
    expect(rows[0]).toHaveTextContent('Croma')
    expect(rows[1]).toHaveTextContent('Transfer')
  })

  it('puts earlier statements under their own dates, and folds all but the latest three away', async () => {
    const card = await addCreditCard('HDFC card', { statementDay: 15 })
    for (const date of ['2026-11-05', '2026-10-05', '2026-09-05', '2026-08-05', '2026-07-05']) await add({ accountId: card, date, merchant: `On ${date}` })
    mount()
    const log = await screen.findByRole('region', { name: 'HDFC card log' })
    await waitFor(() => expect(log.querySelectorAll('[data-statement]')).toHaveLength(3))
    expect(log.querySelectorAll('[data-statement]')).toHaveLength(3)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show earlier statements' }))
    expect(log.querySelectorAll('[data-statement]')).toHaveLength(5)
    expect(screen.queryByRole('button', { name: 'Show earlier statements' })).toBeNull()
  })

  it('leaves out what was spent on other accounts, and what is in the trash', async () => {
    const card = await seedCard()
    await add({ merchant: 'Cash lunch', accountId: await mainId() })
    await add({ merchant: 'Deleted', accountId: card, deletedAt: Date.now() })
    mount()
    const log = await screen.findByRole('region', { name: 'HDFC card log' })
    await within(log).findByText('Croma')
    expect(within(log).queryByText('Cash lunch')).toBeNull()
    expect(within(log).queryByText('Deleted')).toBeNull()
  })

  it('says so, and how to add to it, when nothing is on the card yet', async () => {
    await addCreditCard('HDFC card')
    mount()
    expect(await screen.findByText(/Nothing on this card yet/)).toBeInTheDocument()
  })

  it('closes the sheet and opens an entry when it is tapped', async () => {
    await seedCard()
    const { onClose, onEdit, user } = mount()
    await user.click(await screen.findByRole('button', { name: /Croma/ }))
    expect(onClose).toHaveBeenCalled()
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ merchant: 'Croma' }))
  })
})

describe('Credit cards: what was spent on the card', () => {
  it('says what was spent this week and this month, leaving the bill payment out', async () => {
    const card = await seedCard()
    await add({ amountMinor: 40_000, merchant: 'Cafe', accountId: card, date: '2026-11-01' }) // last week, this month
    await add({ amountMinor: 70_000, merchant: 'Old', accountId: card, date: '2026-10-20' }) // last month
    mount()
    const spending = await screen.findByRole('region', { name: 'HDFC card spending' })
    expect(within(spending).getByRole('group', { name: 'This week: ₹2,500' })).toBeInTheDocument()
    expect(within(spending).getByRole('group', { name: 'This month: ₹2,900' })).toBeInTheDocument()
    expect(within(spending).getByRole('group', { name: 'Last month: ₹700' })).toBeInTheDocument()
    expect(spending).toHaveTextContent('Paying the bill is not counted here')
  })

  it('lists the weeks one by one, this one first', async () => {
    const card = await seedCard()
    await add({ amountMinor: 40_000, accountId: card, date: '2026-11-01' })
    mount()
    const weeks = await screen.findByRole('list', { name: 'Spent by week' })
    const items = [...weeks.querySelectorAll('li')]
    expect(items).toHaveLength(6)
    expect(items[0]).toHaveTextContent('This week')
    expect(items[0]).toHaveTextContent('₹2,500')
    expect(items[1]).toHaveTextContent('Last week')
    expect(items[1]).toHaveTextContent('₹400')
    expect(items[2]).toHaveTextContent('₹0')
  })

  it('shows only the card in view', async () => {
    await seedCard()
    const other = await addCreditCard('Amex')
    await add({ amountMinor: 12_300, accountId: other, date: '2026-11-04' })
    const { user } = mount()
    await user.click(await screen.findByRole('button', { name: 'Amex' }))
    expect(await screen.findByRole('group', { name: 'This week: ₹123' })).toBeInTheDocument()
  })

  it('says on the payment in the log that it is not spending', async () => {
    await seedCard()
    mount()
    const log = await screen.findByRole('region', { name: 'HDFC card log' })
    const payment = log.querySelector('[data-entry="payment"]') as HTMLElement
    expect(payment).toHaveTextContent('Bill payment. Not spending')
    expect(log.querySelector('[data-entry="charge"]')).not.toHaveTextContent('Bill payment')
  })
})

describe('Credit cards: more than one', () => {
  it('shows the one owed most first, and switches to another from its name', async () => {
    await seedCard()
    const small = await addCreditCard('Amex', {}, 5_000)
    await add({ merchant: 'Bookshop', accountId: small })
    const { user } = mount()
    expect(await screen.findByRole('region', { name: 'HDFC card standing' })).toBeInTheDocument()
    const picker = screen.getByRole('group', { name: 'Choose a card' })
    expect(within(picker).getByRole('button', { name: 'HDFC card' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(picker).getByRole('button', { name: 'Amex' }))
    expect(await screen.findByRole('region', { name: 'Amex standing' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Amex log' })).getByText('Bookshop')).toBeInTheDocument()
    expect(screen.queryByText('Croma')).toBeNull()
  })

  it('shows no chooser for a single card', async () => {
    await seedCard()
    mount()
    await screen.findByRole('region', { name: 'HDFC card standing' })
    expect(screen.queryByRole('group', { name: 'Choose a card' })).toBeNull()
  })
})

describe('Credit cards: paying the bill', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => user.click(await screen.findByText('Pay the bill'))
  const transfers = async () => (await db.transactions.toArray()).filter((t) => t.kind === 'transfer')

  it('pays everything owed when the amount is left empty, from the account chosen, as a move of money and not spending', async () => {
    const card = await seedCard()
    const { user } = mount()
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Record payment' }))
    await waitFor(async () => expect(await transfers()).toHaveLength(2))
    const paid = (await transfers()).find((t) => t.amountMinor === 250_000)!
    expect(paid).toMatchObject({ kind: 'transfer', accountId: await mainId(), toAccountId: card, date: '2026-11-06', note: 'Card bill' })
    expect(await screen.findByText('Nothing to pay')).toBeInTheDocument()
    expect(await screen.findByText('Paid ₹2,500 to HDFC card')).toBeInTheDocument()
    expect((await db.transactions.toArray()).filter((t) => t.kind === 'expense')).toHaveLength(1) // still just the purchase
  })

  it('pays an amount typed, on a day chosen', async () => {
    await seedCard()
    const { user } = mount()
    await open(user)
    await user.type(screen.getByLabelText(/^Amount/), '1,200.50')
    fireEvent.change(screen.getByLabelText('On'), { target: { value: '2026-11-03' } })
    await user.click(screen.getByRole('button', { name: 'Record payment' }))
    await waitFor(async () => expect((await transfers()).some((t) => t.amountMinor === 120_050 && t.date === '2026-11-03')).toBe(true))
    const standing = await screen.findByRole('region', { name: 'HDFC card standing' })
    expect(await within(standing).findByText(/You owe/)).toBeInTheDocument()
    expect(await within(standing).findByText('₹1,299.50')).toBeInTheDocument() // 2,500 less 1,200.50
  })

  it('takes a payment back with Undo', async () => {
    await seedCard()
    const { user } = mount()
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Record payment' }))
    await waitFor(async () => expect(await transfers()).toHaveLength(2))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await transfers()).toHaveLength(1))
  })

  it('refuses a zero or missing amount when nothing is owed, and saves nothing', async () => {
    await addCreditCard('HDFC card')
    const { user } = mount()
    await open(user)
    await user.type(screen.getByLabelText(/^Amount/), '0')
    await user.click(screen.getByRole('button', { name: 'Record payment' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the amount you paid')
    expect(await transfers()).toHaveLength(0)
  })

  it('offers the bank and cash accounts to pay from, and not the card', async () => {
    await seedCard()
    await db.accounts.add({ name: 'Savings', openingMinor: null } as never)
    const { user } = mount()
    await open(user)
    const options = [...(screen.getByLabelText('Paid from') as HTMLSelectElement).options].map((o) => o.textContent)
    expect(options).toEqual(['Main', 'Savings'])
  })
})

describe('The card on Home', () => {
  function Card({ onOpen }: { onOpen: () => void }) {
    return <CardsCard ledger={useLedger()} today={today} onOpen={onOpen} />
  }

  it('is not there without a credit card', async () => {
    const { container } = render(<Card onOpen={() => {}} />)
    await new Promise((r) => setTimeout(r, 50))
    expect(container.querySelector('button')).toBeNull()
  })

  it('says what is owed and when the bill is due, and opens the cards', async () => {
    await seedCard({ dueDay: 8 })
    const onOpen = vi.fn()
    render(<Card onOpen={onOpen} />)
    const button = await screen.findByRole('button', { name: /Credit cards: you owe ₹2,500/ })
    expect(button).toHaveTextContent('HDFC card')
    expect(button).toHaveTextContent('₹2,500 owed')
    expect(button).toHaveTextContent(/due .*/)
    await userEvent.setup().click(button)
    expect(onOpen).toHaveBeenCalled()
  })

  it('adds up several cards, and names the one whose bill is due first', async () => {
    await seedCard({ dueDay: 20 })
    await addCreditCard('Amex', { dueDay: 8 }, 50_000)
    render(<Card onOpen={() => {}} />)
    const button = await screen.findByRole('button', { name: /Credit cards: you owe ₹3,000/ })
    expect(button).toHaveTextContent('2 credit cards')
    expect(button).toHaveTextContent('Amex: due')
  })

  it('says what was spent on the cards this week and this month', async () => {
    const card = await seedCard()
    await addCreditCard('Amex')
    await add({ amountMinor: 40_000, accountId: card, date: '2026-11-01' })
    render(<Card onOpen={() => {}} />)
    const button = await screen.findByRole('button', { name: /Credit cards: you owe/ })
    expect(button).toHaveTextContent('Spent ₹2,500 this week, ₹2,900 this month')
    expect(button).toHaveAccessibleName(/Spent on them: ₹2,500 this week, ₹2,900 this month/)
  })

  it('says nothing is owed when the cards are paid off', async () => {
    await addCreditCard('HDFC card', { dueDay: 8 })
    render(<Card onOpen={() => {}} />)
    expect(await screen.findByText('Nothing owed')).toBeInTheDocument()
  })
})

function HomeCard() {
  return <CardsCard ledger={useLedger()} today={today} onOpen={() => {}} />
}

describe('The card, drawn', () => {
  it('shows the card itself at the top of the sheet, with its name, what is owed and when the bill is due', async () => {
    await seedCard({ dueDay: 8 })
    mount()
    const art = await screen.findByText('HDFC card', { selector: '[data-card-style] *' })
    const card = art.closest('[data-card-style]') as HTMLElement
    expect(card).toHaveAttribute('aria-hidden', 'true')
    expect(card).toHaveTextContent('You owe')
    expect(card).toHaveTextContent('₹2,500')
    expect(card).toHaveTextContent(/Due .*8/)
  })

  it('gives a card the look chosen for it, and a look of its own until one is', async () => {
    const id = await seedCard()
    mount()
    const first = (await screen.findByText('HDFC card', { selector: '[data-card-style] *' })).closest('[data-card-style]') as HTMLElement
    expect(first.dataset.cardStyle).toBe(defaultCardStyle(id))
  })

  it('draws the look that was chosen in Settings', async () => {
    const id = await seedCard()
    await setCardStyle(id, 'gray-dark')
    mount()
    const card = (await screen.findByText('HDFC card', { selector: '[data-card-style] *' })).closest('[data-card-style]') as HTMLElement
    expect(card.dataset.cardStyle).toBe('gray-dark')
  })

  it('says it as a card on Home too, small, in the card’s own look, where the round icon was', async () => {
    const id = await seedCard()
    await setCardStyle(id, 'salmon-strip')
    render(<HomeCard />)
    const button = await screen.findByRole('button', { name: /Credit cards: you owe/ })
    expect(button.querySelector('[data-card-style="salmon-strip"]')).not.toBeNull()
    expect(button.querySelector('[data-icon="card"]')).toBeNull()
  })
})
