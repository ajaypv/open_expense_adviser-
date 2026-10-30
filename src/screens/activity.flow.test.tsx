// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useLedger } from '../data/useLedger'
import { localDateString } from '../db/money'
import { db } from '../db/schema'
import { ToastProvider } from '../ui/toast'
import { Activity } from './Activity'

function Screen({ onEdit }: { onEdit: (tx: unknown) => void }) {
  const ledger = useLedger()
  const [category, setCategory] = useState<number | null>(null)
  return <Activity ledger={ledger} today={new Date()} categoryFilter={category} onCategoryFilter={setCategory} onEdit={onEdit} />
}
const mount = (onEdit: (tx: unknown) => void = () => {}) =>
  render(
    <ToastProvider>
      <Screen onEdit={onEdit} />
    </ToastProvider>,
  )

const daysAgo = (n: number) => {
  const d = new Date()
  return localDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n))
}
let seq = 0
const tx = (over: Record<string, unknown> = {}) =>
  db.transactions.add({
    kind: 'expense', amountMinor: 45_000, currency: 'INR', categoryId: 1, merchant: 'Swiggy', note: '', date: daysAgo(0),
    paymentMethod: '', source: 'manual', createdAt: Date.now() + ++seq, ...over,
  } as never) as Promise<number>
const categoryId = async (name: string) => (await db.categories.where('name').equals(name).first())!.id
const row = (name: RegExp | string) => screen.findByRole('button', { name: typeof name === 'string' ? new RegExp(name) : name })

describe('Activity: the list', () => {
  it('explains the empty list, and keeps Select off', async () => {
    mount()
    expect(await screen.findByText('Your transactions will show up here once you log them.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select' })).toBeDisabled()
  })

  it('groups by day with Today and Yesterday, and totals each day', async () => {
    await tx({ merchant: 'Swiggy', amountMinor: 45_000 })
    await tx({ merchant: 'Uber', amountMinor: 23_000 })
    await tx({ merchant: 'Employer', kind: 'income', amountMinor: 500_000, date: daysAgo(1) })
    mount()
    const today = await screen.findByRole('region', { name: 'Today' })
    expect(within(today).getByText('₹680')).toBeInTheDocument() // 450 + 230 sent
    const yesterday = screen.getByRole('region', { name: 'Yesterday' })
    expect(within(yesterday).getAllByText('+₹5,000').length).toBeGreaterThan(0) // the day's total and the row itself
  })

  it('opens a transaction to edit when tapped', async () => {
    await tx({ merchant: 'Swiggy' })
    const onEdit = vi.fn()
    const user = userEvent.setup()
    mount(onEdit)
    await user.click(await row('Edit sent Swiggy'))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ merchant: 'Swiggy', amountMinor: 45_000 }))
  })

  it('shows the first eighty and the rest on request', async () => {
    await db.transactions.bulkAdd(
      Array.from({ length: 85 }, (_, i) => ({
        kind: 'expense', amountMinor: 100 + i, currency: 'INR', categoryId: 1, merchant: `Shop ${i}`, note: '', date: daysAgo(0),
        paymentMethod: '', source: 'manual', createdAt: 1000 + i,
      })) as never,
    )
    const user = userEvent.setup()
    mount()
    await screen.findByRole('button', { name: 'Show more' })
    expect(screen.getAllByRole('button', { name: /^Edit sent/ })).toHaveLength(80)
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    expect(screen.getAllByRole('button', { name: /^Edit sent/ })).toHaveLength(85)
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
  })
})

describe('Activity: search and filters', () => {
  const seed = async () => {
    await tx({ merchant: 'Swiggy', amountMinor: 45_000, categoryId: await categoryId('Food & Dining') })
    await tx({ merchant: 'Uber', amountMinor: 23_000, categoryId: await categoryId('Transport'), note: 'airport' })
    await tx({ merchant: 'Employer', kind: 'income', amountMinor: 800_000, categoryId: await categoryId('Income'), date: daysAgo(3) })
  }

  it('finds by merchant, note or category, and says how many and how much', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    const search = await screen.findByLabelText('Search expenses')
    await user.type(search, 'swig')
    expect(await screen.findByText(/1 transaction:/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit sent Uber/ })).toBeNull()
    await user.clear(search)
    await user.type(search, 'airport') // matches a note
    expect(await row('Edit sent Uber')).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'transport') // matches a category name
    expect(await row('Edit sent Uber')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit sent Swiggy/ })).toBeNull()
  })

  it('clears the search with its own button', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.type(await screen.findByLabelText('Search expenses'), 'swig')
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByLabelText('Search expenses')).toHaveValue('')
    expect(await row('Edit sent Uber')).toBeInTheDocument()
  })

  it('says nothing matches, and Clear filters brings everything back', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.type(await screen.findByLabelText('Search expenses'), 'zzzz')
    expect(await screen.findByText(/Nothing matches/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await row('Edit sent Uber')).toBeInTheDocument()
    expect(screen.getByLabelText('Search expenses')).toHaveValue('')
  })

  it('filters by category chip, and the same chip tapped again turns it off', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    const chips = await screen.findByRole('group', { name: 'Filter by category' })
    await user.click(await within(chips).findByRole('button', { name: 'Transport' }))
    expect(screen.queryByRole('button', { name: /Edit sent Swiggy/ })).toBeNull()
    expect(await row('Edit sent Uber')).toBeInTheDocument()
    await user.click(within(chips).getByRole('button', { name: 'Transport' }))
    expect(await row('Edit sent Swiggy')).toBeInTheDocument()
  })

  it('filters by type', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Filters/ }))
    await user.click(screen.getByRole('radio', { name: 'Received' }))
    expect(await row('Edit received Employer')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit sent/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Filters/ })).toHaveTextContent('1 on, 1')
  })

  it('filters by amount', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Filters/ }))
    await user.type(screen.getByLabelText(/Smallest/), '300')
    expect(screen.queryByRole('button', { name: /Edit sent Uber/ })).toBeNull() // ₹230 is under ₹300
    expect(await row('Edit sent Swiggy')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Largest/), '400')
    await waitFor(() => expect(screen.queryByRole('button', { name: /Edit sent Swiggy/ })).toBeNull()) // ₹450 is over ₹400
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument()
  })

  it('filters by date, and Clear filters in the panel resets them', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Filters/ }))
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: daysAgo(2) } })
    expect(await row('Edit received Employer')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit sent Swiggy/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await row('Edit sent Swiggy')).toBeInTheDocument()
    expect(screen.getByLabelText('To date')).toHaveValue('')
  })
})

describe('Activity: select several', () => {
  const seed = async () => {
    await tx({ merchant: 'Swiggy', categoryId: await categoryId('Food & Dining') })
    await tx({ merchant: 'Uber', amountMinor: 23_000, categoryId: await categoryId('Food & Dining') })
    await tx({ merchant: 'Employer', kind: 'income', amountMinor: 800_000, categoryId: await categoryId('Income') })
  }

  it('selects rows instead of opening them, and counts them', async () => {
    await seed()
    const onEdit = vi.fn()
    const user = userEvent.setup()
    mount(onEdit)
    await user.click(await screen.findByRole('button', { name: 'Select' }))
    expect(screen.getByText('Tap rows to select')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /sent Swiggy/ }))
    await user.click(screen.getByRole('checkbox', { name: /sent Uber/ }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    expect(onEdit).not.toHaveBeenCalled()
    await user.click(screen.getByRole('checkbox', { name: /Selected sent Uber/ })) // tap again to untick
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('keeps Delete and Move off until something is selected', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Select' }))
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move selected to a category' })).toBeDisabled()
  })

  it('deletes the selected rows into the trash, and Undo brings them back', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Select' }))
    await user.click(await screen.findByRole('checkbox', { name: /sent Swiggy/ }))
    await user.click(screen.getByRole('checkbox', { name: /sent Uber/ }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await db.transactions.filter((t) => t.deletedAt !== undefined).count())).toBe(2))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Deleted 2 transactions'))
    expect(screen.queryByText('Tap rows to select')).toBeNull() // select mode ended
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await db.transactions.filter((t) => t.deletedAt !== undefined).count()).toBe(0))
  })

  it('moves the selected expenses to another category', async () => {
    await seed()
    const transport = await categoryId('Transport')
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Select' }))
    await user.click(await screen.findByRole('checkbox', { name: /sent Swiggy/ }))
    await user.click(screen.getByRole('checkbox', { name: /sent Uber/ }))
    await user.click(screen.getByRole('button', { name: 'Move selected to a category' }))
    await user.click(await screen.findByRole('radio', { name: 'Transport' }))
    await waitFor(async () => expect((await db.transactions.where('merchant').anyOf('Swiggy', 'Uber').toArray()).every((t) => t.categoryId === transport)).toBe(true))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Moved 2 to Transport'))
  })

  it('does not move received money to an expense category, and says so', async () => {
    await seed()
    const income = await categoryId('Income')
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Select' }))
    await user.click(await screen.findByRole('checkbox', { name: /received Employer/ }))
    await user.click(screen.getByRole('button', { name: 'Move selected to a category' }))
    await user.click(await screen.findByRole('radio', { name: 'Transport' }))
    expect(await screen.findByText('Only money sent can be moved to a category.')).toBeInTheDocument()
    expect((await db.transactions.where('merchant').equals('Employer').first())!.categoryId).toBe(income)
  })

  it('leaves select mode with Cancel or Done, clearing the selection', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Select' }))
    await user.click(await screen.findByRole('checkbox', { name: /sent Swiggy/ }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('1 selected')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getByText('Tap rows to select')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument()
  })
})

describe('Activity: swipe actions', () => {
  it('copies a transaction to today, with Undo', async () => {
    await tx({ merchant: 'Swiggy', date: daysAgo(5) })
    const user = userEvent.setup()
    mount()
    await row('Edit sent Swiggy')
    await user.click(screen.getByText('Copy'))
    await waitFor(async () => expect(await db.transactions.count()).toBe(2))
    const copy = (await db.transactions.toArray()).find((t) => t.date === localDateString())!
    expect(copy).toMatchObject({ merchant: 'Swiggy', amountMinor: 45_000 })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copied to today'))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await db.transactions.get(copy.id))!.deletedAt).toBeTypeOf('number'))
  })

  it('deletes a transaction into the trash, with Undo', async () => {
    const id = await tx({ merchant: 'Swiggy' })
    const user = userEvent.setup()
    mount()
    await row('Edit sent Swiggy')
    await user.click(screen.getByText('Delete'))
    await waitFor(async () => expect((await db.transactions.get(id))!.deletedAt).toBeTypeOf('number'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Transaction deleted'))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await db.transactions.get(id))!.deletedAt).toBeUndefined())
  })

  it('has no swipe actions while selecting', async () => {
    await tx()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Select' }))
    expect(screen.queryByText('Copy')).toBeNull()
  })
})
