// @vitest-environment jsdom
import '../test/dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '../db/schema'
import type { Suggestion } from '../insights/suggestions'
import { SuggestionList } from './SuggestionList'

const categories = new Map<number, Category>([[1, { id: 1, name: 'Food & Dining', color: 'var(--s1)' }]])

const swiggy: Suggestion = {
  key: 'expense:swiggy', kind: 'expense', merchant: 'Swiggy', amountMinor: 45000, categoryId: 1,
  paymentMethod: '', reason: 'Usually in the evening', count: 5,
}
const employer: Suggestion = { ...swiggy, key: 'income:employer', kind: 'income', merchant: 'Employer', amountMinor: 8_000_000, reason: 'Usually around the 1st' }

function mount(items: Suggestion[], over: Partial<React.ComponentProps<typeof SuggestionList>> = {}) {
  const onPick = vi.fn()
  const onQuickAdd = vi.fn<(s: Suggestion) => void | Promise<void>>()
  render(<SuggestionList items={items} categoryById={categories} currency="INR" onPick={onPick} onQuickAdd={onQuickAdd} tone="page" variant="tile" {...over} />)
  return { onPick, onQuickAdd }
}

const plus = (name: string) => screen.getByRole('button', { name })
const flush = () => act(async () => {})

afterEach(() => {
  vi.useRealTimers()
})

describe('SuggestionList tiles: the plus adds, the tile checks first', () => {
  it('gives each tile two buttons: the tile, which opens the form, and a plus, which adds', () => {
    mount([swiggy])
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(plus('Swiggy, ₹450. Usually in the evening. Fill in the form')).toBeInTheDocument()
    expect(plus('Add Swiggy, ₹450 now')).toBeInTheDocument()
  })

  it('adds straight away from the plus, without opening the form', async () => {
    const { onPick, onQuickAdd } = mount([swiggy])
    fireEvent.click(plus('Add Swiggy, ₹450 now'))
    await flush()
    expect(onQuickAdd).toHaveBeenCalledExactlyOnceWith(swiggy)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('opens the form from the rest of the tile, without adding', () => {
    const { onPick, onQuickAdd } = mount([swiggy])
    fireEvent.click(plus('Swiggy, ₹450. Usually in the evening. Fill in the form'))
    expect(onPick).toHaveBeenCalledExactlyOnceWith(swiggy)
    expect(onQuickAdd).not.toHaveBeenCalled()
  })

  it('says what money received will be added as', () => {
    mount([employer])
    expect(plus('Add Employer, +₹80,000 now')).toBeInTheDocument()
  })

  it('has no plus button for a transfer, which is not worth repeating in one tap', () => {
    mount([{ ...swiggy, key: 'transfer:x', kind: 'transfer' }])
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('only offers the plus where the tiles are given a way to add', () => {
    mount([swiggy], { onQuickAdd: undefined })
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(document.querySelector('[data-quick-add]')).toBeNull()
  })

  it('leaves the slim chips as they were', () => {
    mount([swiggy], { variant: 'chip' })
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})

describe('SuggestionList tiles: once added', () => {
  it('shows a tick and says it was added, then goes back to a plus', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    mount([swiggy])
    fireEvent.click(plus('Add Swiggy, ₹450 now'))
    await flush()
    const done = plus('Added Swiggy')
    expect(done).toBeDisabled()
    expect(done).toHaveAttribute('data-added', 'true')
    expect(done.querySelector('path')?.getAttribute('d')).toBe('M5 12.5l4.5 4.5L19 7.5') // the tick

    act(() => void vi.advanceTimersByTime(1500))
    expect(plus('Add Swiggy, ₹450 now')).not.toBeDisabled()
    expect(plus('Add Swiggy, ₹450 now')).not.toHaveAttribute('data-added')
  })

  it('does not add twice from a quick second tap while the first is still being saved', async () => {
    let finish!: () => void
    const { onQuickAdd } = mount([swiggy])
    onQuickAdd.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
    const button = plus('Add Swiggy, ₹450 now')
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onQuickAdd).toHaveBeenCalledOnce()
    finish()
    await flush()
    expect(plus('Added Swiggy')).toBeInTheDocument()
  })

  it('does not add twice from a tap just after it was added', async () => {
    const { onQuickAdd } = mount([swiggy])
    fireEvent.click(plus('Add Swiggy, ₹450 now'))
    await flush()
    fireEvent.click(plus('Added Swiggy'))
    await flush()
    expect(onQuickAdd).toHaveBeenCalledOnce()
  })

  it('lets a different tile be added straight after', async () => {
    const { onQuickAdd } = mount([swiggy, employer])
    fireEvent.click(plus('Add Swiggy, ₹450 now'))
    await flush()
    fireEvent.click(plus('Add Employer, +₹80,000 now'))
    await flush()
    expect(onQuickAdd).toHaveBeenCalledTimes(2)
  })

  it('shows no tick, and can be tried again, when adding fails', async () => {
    const { onQuickAdd } = mount([swiggy])
    onQuickAdd.mockRejectedValueOnce(new Error('Could not save'))
    fireEvent.click(plus('Add Swiggy, ₹450 now'))
    await flush()
    expect(plus('Add Swiggy, ₹450 now')).not.toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Added Swiggy' })).toBeNull()
    fireEvent.click(plus('Add Swiggy, ₹450 now'))
    await flush()
    expect(onQuickAdd).toHaveBeenCalledTimes(2)
    expect(plus('Added Swiggy')).toBeInTheDocument()
  })

  it('works with a handler that is not async', async () => {
    const { onQuickAdd } = mount([swiggy])
    onQuickAdd.mockReturnValue(undefined)
    fireEvent.click(plus('Add Swiggy, ₹450 now'))
    await flush()
    expect(plus('Added Swiggy')).toBeInTheDocument()
  })
})

describe('SuggestionList pills: one tap adds', () => {
  const pill = (name: string | RegExp) => screen.getByRole('button', { name })

  it('is one round button each with the name and the usual amount, and nothing else', () => {
    mount([swiggy], { variant: 'quick' })
    expect(screen.getAllByRole('button')).toHaveLength(1)
    const button = pill(/^Add Swiggy, ₹450 now/)
    expect(button).toHaveTextContent('Swiggy₹450')
    expect(button.className).toContain('rounded-full')
    expect(button.className).toContain('min-h-12')
  })

  it('says why it is suggested for a screen reader, since the pill itself does not', () => {
    mount([swiggy], { variant: 'quick' })
    expect(pill('Add Swiggy, ₹450 now. Usually in the evening')).toBeInTheDocument()
  })

  it('adds straight away on a tap, without opening the form', async () => {
    const { onPick, onQuickAdd } = mount([swiggy], { variant: 'quick' })
    fireEvent.click(pill(/^Add Swiggy/))
    await flush()
    expect(onQuickAdd).toHaveBeenCalledWith(swiggy)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('shows a tick after it is added, and cannot be added again for a moment', async () => {
    vi.useFakeTimers()
    const { onQuickAdd } = mount([swiggy], { variant: 'quick' })
    fireEvent.click(pill(/^Add Swiggy/))
    await flush()
    const done = screen.getByRole('button', { name: 'Added Swiggy' })
    expect(done).toBeDisabled()
    expect(done.querySelector('svg')).not.toBeNull()
    fireEvent.click(done)
    expect(onQuickAdd).toHaveBeenCalledTimes(1)
  })

  it('opens the form instead, with nothing to add it with, and for a transfer', () => {
    const { onPick, onQuickAdd } = mount([{ ...swiggy, kind: 'transfer' }], { variant: 'quick' })
    fireEvent.click(screen.getByRole('button'))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onQuickAdd).not.toHaveBeenCalled()
    cleanup()
    const alone = render(<SuggestionList items={[swiggy]} categoryById={categories} currency="INR" onPick={onPick} tone="page" variant="quick" />)
    fireEvent.click(alone.getByRole('button'))
    expect(onPick).toHaveBeenCalledTimes(2)
  })

  it('shows money received with a plus and in green', () => {
    mount([employer], { variant: 'quick' })
    expect(pill(/^Add Employer, \+₹80,000 now/)).toHaveTextContent('Employer+₹80,000')
    expect(screen.getByText('+₹80,000')).toHaveClass('text-good')
  })
})
