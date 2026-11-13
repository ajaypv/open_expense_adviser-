// @vitest-environment jsdom
import '../test/dom'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '../db/schema'
import { pressKey, QuickAdd } from './QuickAdd'

afterEach(cleanup)

const today = new Date(2026, 10, 13) // Fri 13 Nov 2026
const categories: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Groceries', color: 'var(--s2)' },
  { id: 3, name: 'Transport', color: 'var(--s3)' },
  { id: 4, name: 'Other', color: 'var(--other)' },
]

function mount(over: Partial<React.ComponentProps<typeof QuickAdd>> = {}) {
  const handlers = { onClose: vi.fn(), onSave: vi.fn(async () => {}), onMore: vi.fn() }
  render(<QuickAdd open categories={categories} currency="INR" today={today} {...handlers} {...over} />)
  const user = userEvent.setup()
  const sheet = screen.getByRole('dialog', { name: 'New expense' })
  const press = async (keys: string) => {
    for (const k of keys) await user.click(within(sheet).getByRole('button', { name: k }))
  }
  const say = (text: string) => user.type(within(sheet).getByLabelText(/What was it/), text)
  const amount = () => within(sheet).getByTestId('quick-amount')
  const addButton = () => within(sheet).getByRole('button', { name: /^Add/ })
  const understood = () => Array.from(within(sheet).getByRole('list', { name: 'What was understood' }).querySelectorAll('li')).map((li) => li.textContent)
  return { ...handlers, user, sheet, press, say, amount, addButton, understood }
}

describe('pressKey: the number pad', () => {
  it('adds digits, and replaces a lone zero', () => {
    expect(pressKey('', '4')).toBe('4')
    expect(pressKey('4', '5')).toBe('45')
    expect(pressKey('0', '7')).toBe('7')
  })

  it('starts a decimal from nothing as 0., and allows only one point', () => {
    expect(pressKey('', '.')).toBe('0.')
    expect(pressKey('12', '.')).toBe('12.')
    expect(pressKey('12.', '.')).toBe('12.')
  })

  it('keeps two places after the point, and stops at nine digits before it', () => {
    expect(pressKey('12.5', '0')).toBe('12.50')
    expect(pressKey('12.50', '9')).toBe('12.50')
    expect(pressKey('123456789', '1')).toBe('123456789')
  })

  it('deletes the last key, down to nothing', () => {
    expect(pressKey('45', 'del')).toBe('4')
    expect(pressKey('4', 'del')).toBe('')
    expect(pressKey('', 'del')).toBe('')
    expect(pressKey('12.', 'del')).toBe('12')
  })
})

describe('QuickAdd: the sheet', () => {
  it('opens on a title, the words box, the categories, the days, a number pad and a button that says what it will add', () => {
    const { sheet, addButton } = mount()
    expect(within(sheet).getByText('Type it as you would say it')).toBeInTheDocument()
    expect(within(sheet).getByRole('group', { name: 'Category' })).toBeInTheDocument()
    expect(within(sheet).getByRole('group', { name: 'Day' })).toBeInTheDocument()
    expect(within(within(sheet).getByRole('group', { name: 'Number pad' })).getAllByRole('button')).toHaveLength(12)
    expect(addButton()).toHaveTextContent('Add')
    expect(addButton()).toHaveAttribute('aria-disabled', 'true')
    expect(within(sheet).getByText('You can undo it right after.')).toBeInTheDocument()
  })

  it('shows the amount as the pad makes it, grouped, and puts it on the button', async () => {
    const { press, amount, addButton } = mount()
    await press('4')
    expect(amount()).toHaveTextContent('₹4')
    await press('500')
    expect(amount()).toHaveTextContent('₹4,500')
    expect(addButton()).toHaveTextContent('Add ₹4,500')
    expect(addButton()).toHaveAttribute('aria-disabled', 'false')
  })

  it('takes a decimal, shows the places as they are typed, and deletes back', async () => {
    const { press, amount, addButton, user, sheet } = mount()
    await press('12.5')
    expect(amount()).toHaveTextContent('₹12.5')
    await press('0')
    expect(addButton()).toHaveTextContent('Add ₹12.50')
    await user.click(within(sheet).getByRole('button', { name: 'Delete' }))
    await user.click(within(sheet).getByRole('button', { name: 'Delete' }))
    expect(amount()).toHaveTextContent('₹12.')
    await user.click(within(sheet).getByRole('button', { name: 'Delete' }))
    expect(amount()).toHaveTextContent('₹12')
  })

  it('does not add with no amount', async () => {
    const { user, addButton, onSave } = mount()
    await user.click(addButton())
    expect(onSave).not.toHaveBeenCalled()
  })

  it('stops at the biggest the pad can make, which is always an amount that can be added', async () => {
    const { press, amount } = mount()
    await press('9999999999')
    expect(amount()).toHaveTextContent('₹999,999,999')
  })
})

describe('QuickAdd: what you say', () => {
  it('understands a whole line: the amount, what it was, the category and the day', async () => {
    const { say, amount, understood, sheet } = mount()
    await say('450 lunch at Cafe yesterday')
    expect(amount()).toHaveTextContent('₹450')
    expect(understood()).toEqual(['Lunch Cafe', 'Food & Dining', 'Yesterday'])
    expect(within(sheet).getByRole('button', { name: 'Yesterday' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sheet).getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('takes words with no amount as what it was, and guesses the category from them', async () => {
    const { say, understood, sheet } = mount()
    await say('uber to office')
    expect(understood()).toEqual(['uber to office', 'Transport', 'Today'])
    expect(within(sheet).getByRole('button', { name: 'Transport' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('lets the pad decide the amount when both have one', async () => {
    const { say, press, amount } = mount()
    await say('450 lunch')
    await press('60')
    expect(amount()).toHaveTextContent('₹60')
  })

  it('prefers what you chose for that name before to the guess from the words', async () => {
    const { say, sheet } = mount({ learned: (m) => (m.toLowerCase().includes('cafe') ? 2 : null) })
    await say('lunch at Cafe')
    expect(within(sheet).getByRole('button', { name: 'Groceries' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('lets a chip you tap beat any guess', async () => {
    const { say, user, sheet, understood } = mount()
    await say('lunch')
    await user.click(within(sheet).getByRole('button', { name: 'Transport' }))
    expect(within(sheet).getByRole('button', { name: 'Transport' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sheet).getByRole('button', { name: 'Food & Dining' })).toHaveAttribute('aria-pressed', 'false')
    expect(understood()).toContain('Transport')
  })

  it('keeps the first category chip clear of the screen edge, with the room the row is padded by', () => {
    const { sheet } = mount()
    const row = within(sheet).getByRole('group', { name: 'Category' })
    expect(row.className).toContain('px-5') // the first chip starts 20px in
    expect(row.className).toContain('scroll-px-5') // and settles there, rather than against the edge
    expect(row.className).toContain('snap-x')
  })

  it('starts with Other, or the first category, when it has nothing to go on', () => {
    const { sheet } = mount()
    expect(within(sheet).getByRole('button', { name: 'Other' })).toHaveAttribute('aria-pressed', 'true')
    cleanup()
    mount({ categories: categories.slice(0, 2) })
    expect(within(screen.getByRole('dialog', { name: 'New expense' })).getByRole('button', { name: 'Food & Dining' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('QuickAdd: the day', () => {
  it('is today to begin with, and can be yesterday', async () => {
    const { user, sheet } = mount()
    expect(within(sheet).getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(sheet).getByRole('button', { name: 'Yesterday' }))
    expect(within(sheet).getByRole('button', { name: 'Yesterday' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens a date for Pick a day, no later than today, and shows the day chosen', async () => {
    const { user, sheet, understood } = mount()
    await user.click(within(sheet).getByRole('button', { name: 'Pick a day' }))
    const date = within(sheet).getByLabelText('Day of the expense') as HTMLInputElement
    expect(date.max).toBe('2026-11-13')
    fireEvent.change(date, { target: { value: '2026-11-05' } })
    expect(understood().at(-1)).toMatch(/5/)
    expect(within(sheet).getByRole('button', { name: 'Pick a day' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('QuickAdd: adding', () => {
  it('saves the amount, what it was, the category and the day, then closes', async () => {
    const { press, say, user, addButton, onSave, onClose } = mount()
    await press('450')
    await say('lunch at Cafe')
    await user.click(addButton())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith({ amountMinor: 45_000, merchant: 'lunch at Cafe', categoryId: 1, date: '2026-11-13' })
  })

  it('saves a whole line as typed, with its day', async () => {
    const { say, user, addButton, onSave } = mount()
    await say('Uber 230 yesterday')
    await user.click(addButton())
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave).toHaveBeenCalledWith({ amountMinor: 23_000, merchant: 'Uber', categoryId: 3, date: '2026-11-12' })
  })

  it('saves with no words at all: just an amount, in the category chosen', async () => {
    const { press, user, sheet, addButton, onSave } = mount()
    await press('99')
    await user.click(within(sheet).getByRole('button', { name: 'Groceries' }))
    await user.click(addButton())
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave).toHaveBeenCalledWith({ amountMinor: 9_900, merchant: '', categoryId: 2, date: '2026-11-13' })
  })

  it('stays open, and says so, when it could not be saved, ready to try again', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('no')
    })
    const { press, user, addButton, onClose } = mount({ onSave })
    await press('5')
    await user.click(addButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('It could not be added. Try again.')
    expect(onClose).not.toHaveBeenCalled()
    expect(addButton()).toHaveAttribute('aria-disabled', 'false')
  })

  it('is added once however fast the button is tapped', async () => {
    let release = () => {}
    const onSave = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    const { press, user, addButton } = mount({ onSave })
    await press('5')
    await user.dblClick(addButton())
    expect(onSave).toHaveBeenCalledTimes(1)
    release()
  })
})

describe('QuickAdd: the way out and the way to more', () => {
  it('closes from its button', async () => {
    const { user, sheet, onClose } = mount()
    await user.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('leads to the full form, which has the rest, from More options', async () => {
    const { user, sheet, onMore } = mount()
    await user.click(within(sheet).getByRole('button', { name: 'More options' }))
    expect(onMore).toHaveBeenCalledTimes(1)
  })

  it('has every control big enough to tap: the pad, the days, the categories and the button', () => {
    const { sheet } = mount()
    const classes = (el: Element) => el.className
    for (const key of within(within(sheet).getByRole('group', { name: 'Number pad' })).getAllByRole('button')) expect(classes(key)).toContain('h-14')
    for (const chip of within(within(sheet).getByRole('group', { name: 'Category' })).getAllByRole('button')) expect(classes(chip)).toContain('min-h-11')
    for (const day of within(within(sheet).getByRole('group', { name: 'Day' })).getAllByRole('button')) expect(classes(day)).toContain('min-h-11')
    expect(classes(within(sheet).getByRole('button', { name: /^Add/ }))).toContain('min-h-14')
  })
})
