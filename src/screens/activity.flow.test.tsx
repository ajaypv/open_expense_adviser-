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

type Range = { from: string; to: string } | null
function Screen({ onEdit, initialRange = null }: { onEdit: (tx: unknown) => void; initialRange?: Range }) {
  const ledger = useLedger()
  const [category, setCategory] = useState<number | null>(null)
  return <Activity ledger={ledger} today={new Date()} categoryFilter={category} onCategoryFilter={setCategory} initialRange={initialRange} onEdit={onEdit} />
}
const mount = (onEdit: (tx: unknown) => void = () => {}, initialRange: Range = null) =>
  render(
    <ToastProvider>
      <Screen onEdit={onEdit} initialRange={initialRange} />
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
    expect(await screen.findByText('Nothing here yet. Type something like “450 lunch at Cafe” in the bar below.')).toBeInTheDocument()
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
    await user.click(await row('Edit spent Swiggy'))
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
    expect(screen.getAllByRole('button', { name: /^Edit spent/ })).toHaveLength(80)
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    expect(screen.getAllByRole('button', { name: /^Edit spent/ })).toHaveLength(85)
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
    const search = await screen.findByLabelText('Search transactions')
    await user.type(search, 'swig')
    expect(await screen.findByText(/1 transaction:/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit spent Uber/ })).toBeNull()
    await user.clear(search)
    await user.type(search, 'airport') // matches a note
    expect(await row('Edit spent Uber')).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'transport') // matches a category name
    expect(await row('Edit spent Uber')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit spent Swiggy/ })).toBeNull()
  })

  it('clears the search with its own button', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.type(await screen.findByLabelText('Search transactions'), 'swig')
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByLabelText('Search transactions')).toHaveValue('')
    expect(await row('Edit spent Uber')).toBeInTheDocument()
  })

  it('says nothing matches, and Clear search and filters brings everything back', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.type(await screen.findByLabelText('Search transactions'), 'zzzz')
    expect(await screen.findByText(/No transactions match/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search and filters' }))
    expect(await row('Edit spent Uber')).toBeInTheDocument()
    expect(screen.getByLabelText('Search transactions')).toHaveValue('')
  })

  it('filters by category chip, and the same chip tapped again turns it off', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    const chips = await screen.findByRole('group', { name: 'Filter by category' })
    await user.click(await within(chips).findByRole('button', { name: 'Transport' }))
    expect(screen.queryByRole('button', { name: /Edit spent Swiggy/ })).toBeNull()
    expect(await row('Edit spent Uber')).toBeInTheDocument()
    await user.click(within(chips).getByRole('button', { name: 'Transport' }))
    expect(await row('Edit spent Swiggy')).toBeInTheDocument()
  })

  it('filters by type', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Filters/ }))
    await user.click(screen.getByRole('radio', { name: 'Received' }))
    expect(await row('Edit received Employer')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit spent/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Filters/ })).toHaveTextContent('1 on, 1')
  })

  it('filters by amount', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Filters/ }))
    await user.type(screen.getByLabelText(/Smallest/), '300')
    expect(screen.queryByRole('button', { name: /Edit spent Uber/ })).toBeNull() // ₹230 is under ₹300
    expect(await row('Edit spent Swiggy')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Largest/), '400')
    await waitFor(() => expect(screen.queryByRole('button', { name: /Edit spent Swiggy/ })).toBeNull()) // ₹450 is over ₹400
    expect(screen.getByText(/No transactions match/)).toBeInTheDocument()
  })

  it('filters by date, and Clear filters in the panel resets them', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Filters/ }))
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: daysAgo(2) } })
    expect(await row('Edit received Employer')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit spent Swiggy/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await row('Edit spent Swiggy')).toBeInTheDocument()
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
    await user.click(screen.getByRole('checkbox', { name: /spent Swiggy/ }))
    await user.click(screen.getByRole('checkbox', { name: /spent Uber/ }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    expect(onEdit).not.toHaveBeenCalled()
    await user.click(screen.getByRole('checkbox', { name: /Selected spent Uber/ })) // tap again to untick
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
    await user.click(await screen.findByRole('checkbox', { name: /spent Swiggy/ }))
    await user.click(screen.getByRole('checkbox', { name: /spent Uber/ }))
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
    await user.click(await screen.findByRole('checkbox', { name: /spent Swiggy/ }))
    await user.click(screen.getByRole('checkbox', { name: /spent Uber/ }))
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
    expect(await screen.findByText('Only spending can be moved to a category.')).toBeInTheDocument()
    expect((await db.transactions.where('merchant').equals('Employer').first())!.categoryId).toBe(income)
  })

  it('leaves select mode with Cancel or Done, clearing the selection', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Select' }))
    await user.click(await screen.findByRole('checkbox', { name: /spent Swiggy/ }))
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
    await row('Edit spent Swiggy')
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
    await row('Edit spent Swiggy')
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

const lastMonthDay = () => {
  const d = new Date()
  return localDateString(new Date(d.getFullYear(), d.getMonth() - 1, 15))
}
const monthName = (offset: number) => {
  const d = new Date()
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(d.getFullYear(), d.getMonth() + offset, 1))
}

describe('Activity: choosing when', () => {
  it('narrows to this month or last month with one tap, and back to any time', async () => {
    await tx({ merchant: 'Swiggy' })
    await tx({ merchant: 'Oldcafe', date: lastMonthDay() })
    const user = userEvent.setup()
    mount()
    await row('Edit spent Swiggy')
    await user.click(screen.getByRole('button', { name: 'This month' }))
    expect(screen.queryByRole('button', { name: /Edit spent Oldcafe/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'This month' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Last month' }))
    expect(await row('Edit spent Oldcafe')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit spent Swiggy/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Any time' }))
    expect(await row('Edit spent Swiggy')).toBeInTheDocument()
    expect(await row('Edit spent Oldcafe')).toBeInTheDocument()
  })

  it('starts on the range it is given, as when a category is opened from a month on Home', async () => {
    await tx({ merchant: 'Swiggy' })
    await tx({ merchant: 'Oldcafe', date: lastMonthDay() })
    const d = new Date()
    const lastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1)
    const key = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`
    const end = new Date(d.getFullYear(), d.getMonth(), 0).getDate()
    mount(() => {}, { from: `${key}-01`, to: `${key}-${end}` })
    expect(await row('Edit spent Oldcafe')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit spent Swiggy/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Last month' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows what is filtering as chips that each take their own filter off', async () => {
    await tx({ merchant: 'Swiggy' })
    await tx({ merchant: 'Oldcafe', date: lastMonthDay() })
    const user = userEvent.setup()
    mount()
    await row('Edit spent Swiggy')
    expect(screen.queryByRole('list', { name: 'Filters in use' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Last month' }))
    const inUse = await screen.findByRole('list', { name: 'Filters in use' })
    expect(within(inUse).getByText(monthName(-1))).toBeInTheDocument()
    await user.click(within(inUse).getByRole('button', { name: `Remove ${monthName(-1)} filter` }))
    expect(await row('Edit spent Swiggy')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Filters in use' })).toBeNull()
  })

  it('shows a type filter as a chip too', async () => {
    await tx({ merchant: 'Swiggy' })
    await tx({ merchant: 'Employer', kind: 'income', amountMinor: 800_000 })
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Filters/ }))
    await user.click(screen.getByRole('radio', { name: 'Received' }))
    expect(await screen.findByRole('button', { name: 'Remove Received filter' })).toBeInTheDocument()
  })
})

describe('Activity: totals', () => {
  it('totals the whole day, even when only part of it is on screen yet', async () => {
    await db.transactions.bulkAdd(
      Array.from({ length: 85 }, (_, i) => ({
        kind: 'expense', amountMinor: 1000, currency: 'INR', categoryId: 1, merchant: `Shop ${i}`, note: '', date: daysAgo(0),
        paymentMethod: '', source: 'manual', createdAt: 1000 + i,
      })) as never,
    )
    mount()
    const today = await screen.findByRole('region', { name: 'Today' })
    expect(within(today).getByText(/₹850/)).toBeInTheDocument() // 85 x ₹10, not the 80 showing
  })

  it('says how many are showing out of how many', async () => {
    await db.transactions.bulkAdd(
      Array.from({ length: 85 }, (_, i) => ({
        kind: 'expense', amountMinor: 100 + i, currency: 'INR', categoryId: 1, merchant: `Shop ${i}`, note: '', date: daysAgo(0),
        paymentMethod: '', source: 'manual', createdAt: 1000 + i,
      })) as never,
    )
    mount()
    expect(await screen.findByText('Showing 80 of 85')).toBeInTheDocument()
  })

  it('says what was moved for transfers, not "₹0 spent"', async () => {
    await tx({ merchant: '', kind: 'transfer', amountMinor: 100_000 })
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Filters/ }))
    await user.click(screen.getByRole('radio', { name: 'Transfers' }))
    expect(await screen.findByText(/1 transfer/)).toHaveTextContent('1 transfer: ₹1,000 moved')
    expect(screen.queryByText(/spent/)).toBeNull()
  })

  it('says the day total in words for a screen reader', async () => {
    await tx({ merchant: 'Swiggy' })
    mount()
    const today = await screen.findByRole('region', { name: 'Today' })
    expect(within(today).getByText('Spent')).toHaveClass('sr-only')
  })
})

describe('Activity: search', () => {
  it('finds a row by any words in any order, not only a phrase in a row', async () => {
    await tx({ merchant: 'Big Basket', note: 'weekly shop' })
    await tx({ merchant: 'Uber' })
    const user = userEvent.setup()
    mount()
    await user.type(await screen.findByLabelText('Search transactions'), 'shop basket')
    expect(await row('Edit spent Big Basket')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit spent Uber/ })).toBeNull()
  })

  it('finds a row by its amount', async () => {
    await tx({ merchant: 'Swiggy', amountMinor: 45_000 })
    await tx({ merchant: 'Uber', amountMinor: 23_000 })
    const user = userEvent.setup()
    mount()
    await user.type(await screen.findByLabelText('Search transactions'), '230')
    expect(await row('Edit spent Uber')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit spent Swiggy/ })).toBeNull()
  })

  it('finds a row by its account', async () => {
    const accountId = await db.accounts.add({ name: 'Travelcard', openingMinor: null } as never)
    await tx({ merchant: 'Uber', accountId })
    await tx({ merchant: 'Swiggy' })
    const user = userEvent.setup()
    mount()
    await user.type(await screen.findByLabelText('Search transactions'), 'travelcard')
    expect(await row('Edit spent Uber')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit spent Swiggy/ })).toBeNull()
  })

  it('offers to clear both the search and the filters when nothing matches', async () => {
    await tx({ merchant: 'Swiggy' })
    const user = userEvent.setup()
    mount()
    await user.type(await screen.findByLabelText('Search transactions'), 'zzzz')
    await user.click(await screen.findByRole('button', { name: 'Clear search and filters' }))
    expect(await row('Edit spent Swiggy')).toBeInTheDocument()
  })

  it('names what it searched for when nothing matches', async () => {
    await tx({ merchant: 'Swiggy' })
    const user = userEvent.setup()
    mount()
    await user.type(await screen.findByLabelText('Search transactions'), 'zzzz')
    expect(await screen.findByText(/No transactions match “zzzz”/)).toBeInTheDocument()
  })
})

describe('Activity: amount filter', () => {
  it('says so when the smallest is above the largest', async () => {
    await tx({ merchant: 'Swiggy' })
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: /Filters/ }))
    await user.type(screen.getByLabelText(/Smallest/), '500')
    await user.type(screen.getByLabelText(/Largest/), '100')
    expect(await screen.findByRole('alert')).toHaveTextContent('The smallest amount is above the largest')
  })
})

describe('Activity: select several, with filters', () => {
  const seed = async () => {
    await tx({ merchant: 'Swiggy', categoryId: await categoryId('Food & Dining') })
    await tx({ merchant: 'Uber', amountMinor: 23_000, categoryId: await categoryId('Food & Dining') })
    await tx({ merchant: 'Employer', kind: 'income', amountMinor: 800_000, categoryId: await categoryId('Income') })
  }

  it('only counts and deletes what can still be seen once a filter hides some of the selection', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Select' }))
    await user.click(await screen.findByRole('checkbox', { name: /spent Swiggy/ }))
    await user.click(screen.getByRole('checkbox', { name: /spent Uber/ }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search transactions'), 'swiggy')
    await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect(await db.transactions.filter((t) => t.deletedAt !== undefined).count()).toBe(1))
    expect((await db.transactions.where('merchant').equals('Uber').first())!.deletedAt).toBeUndefined()
  })

  it('selects everything that is showing with Select all', async () => {
    await seed()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Select' }))
    await user.click(await screen.findByRole('button', { name: 'Select all 3' }))
    expect(screen.getByText('3 selected')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Select all/ })).toBeNull()
  })

  it('moves only what can be moved, says what it left, and can put it back', async () => {
    await seed()
    const food = await categoryId('Food & Dining')
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Select' }))
    await user.click(await screen.findByRole('checkbox', { name: /spent Swiggy/ }))
    await user.click(screen.getByRole('checkbox', { name: /received Employer/ }))
    await user.click(screen.getByRole('button', { name: 'Move selected to a category' }))
    await user.click(await screen.findByRole('radio', { name: 'Transport' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Moved 1 to Transport. Left 1 received or transfer as it was.'))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await db.transactions.where('merchant').equals('Swiggy').first())!.categoryId).toBe(food))
  })
})
