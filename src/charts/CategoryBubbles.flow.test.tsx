// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Category } from '../db/schema'
import type { CategoryTotal } from '../insights/aggregates'
import { CategoryBubbles } from './CategoryBubbles'

const category = (id: number, name: string, color = `var(--s${id})`): Category => ({ id, name, color })
const categoryById = new Map<number, Category>([
  [1, category(1, 'Groceries')],
  [2, category(2, 'Shopping')],
  [3, category(3, 'Food & Dining')],
  [4, category(4, 'Health')],
  [5, category(5, 'Transport')],
  [6, category(6, 'Entertainment & Travel')],
  [7, category(7, 'Other', 'var(--other)')],
])
// Out of ₹1,000: the shares from the reference picture (in whole rupees).
const totals: CategoryTotal[] = [
  { categoryId: 1, totalMinor: 32_800 },
  { categoryId: 2, totalMinor: 16_100 },
  { categoryId: 3, totalMinor: 14_800 },
  { categoryId: 4, totalMinor: 8_400 },
  { categoryId: 5, totalMinor: 6_700 },
  { categoryId: 7, totalMinor: 21_200 },
]

const mount = (over: Record<string, unknown> = {}) =>
  render(<CategoryBubbles totals={totals} categoryById={categoryById} currency="INR" {...over} />)
const list = () => screen.getByRole('list', { name: /Spending by category/ })
const width = (el: HTMLElement) => parseFloat(el.closest('li')!.style.width)

describe('CategoryBubbles: a bubble for each category', () => {
  it('has one bubble for each category, with its name and its share to one decimal', () => {
    mount({ onPick: () => {} })
    const bubbles = within(list()).getAllByRole('button')
    expect(bubbles).toHaveLength(6)
    const groceries = screen.getByRole('button', { name: /^Groceries, 32\.8%/ })
    expect(groceries).toHaveTextContent('Groceries')
    expect(groceries).toHaveTextContent('32.8%')
    expect(screen.getByRole('button', { name: /^Shopping, 16\.1%/ })).toHaveTextContent('16.1%')
  })

  it('makes a bigger share a bigger bubble', () => {
    mount({ onPick: () => {} })
    const sizes = totals.map((t) => width(screen.getByRole('button', { name: new RegExp(`^${categoryById.get(t.categoryId)!.name},`) })))
    // Bigger totals first in the list, so the widths come out biggest first, but the unsorted "Other" is second biggest.
    expect(Math.max(...sizes)).toBe(sizes[0])
    expect(sizes[5]).toBeGreaterThan(sizes[2]) // Other (21.2%) is bigger than Food & Dining (14.8%)
    expect(sizes[4]).toBeLessThan(sizes[3]) // Transport (6.7%) is smaller than Health (8.4%)
  })

  it('says the share once, in the size and the figure, without a second pie drawn inside each bubble', () => {
    mount({ onPick: () => {} })
    expect(document.querySelector('.bubble-wedge, .bubble-arc')).toBeNull()
    expect(screen.getByRole('button', { name: /^Groceries,/ }).querySelector<HTMLElement>('.bubble')!.style.getPropertyValue('--a')).toBe('')
  })

  it('writes the amount under the share of a bubble big enough to hold it, and not in a small one', () => {
    mount({ onPick: () => {} })
    const biggest = screen.getByRole('button', { name: /^Groceries,/ })
    expect(biggest.querySelector('.bubble-amount')).toHaveTextContent('₹328')
    const rows: CategoryTotal[] = [60, 25, 8, 4, 3].map((k, i) => ({ categoryId: i + 1, totalMinor: k * 1000 }))
    const { container } = render(<CategoryBubbles totals={rows} categoryById={categoryById} currency="INR" onPick={() => {}} />)
    const amounts = Array.from(container.querySelectorAll('.bubble-amount'))
    expect(amounts.length).toBeGreaterThan(0)
    expect(amounts.length).toBeLessThan(5)
  })

  it('draws the category\'s icon, in its colour', () => {
    mount({ onPick: () => {} })
    const groceries = screen.getByRole('button', { name: /^Groceries,/ })
    expect(groceries.querySelector('[data-icon="cart"]')).not.toBeNull()
    expect(groceries.querySelector<HTMLElement>('.bubble')!.style.getPropertyValue('--c')).toBe('var(--s1)')
  })

  it('tells a screen reader the amount too, and what a tap does', () => {
    mount({ onPick: () => {} })
    expect(screen.getByRole('button', { name: 'Groceries, 32.8%, ₹328. Show these expenses' })).toBeInTheDocument()
  })

  it('opens that category when a bubble is tapped', () => {
    const onPick = vi.fn()
    mount({ onPick })
    fireEvent.click(screen.getByRole('button', { name: /^Health,/ }))
    expect(onPick).toHaveBeenCalledWith(4)
  })

  it('is not a row of buttons when there is nothing to open', () => {
    mount()
    expect(within(list()).queryAllByRole('button')).toHaveLength(0)
    const items = within(list()).getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items[0]).toHaveAttribute('aria-label', 'Groceries, 32.8%, ₹328')
  })
})

describe('CategoryBubbles: small and many', () => {
  it('folds categories under 2% into the grey "Everything else" bubble instead of drawing a scatter of tiny ones', () => {
    const ids = Array.from({ length: 8 }, (_, i) => i + 1)
    const names = new Map<number, Category>(ids.map((id) => [id, category(id, `Cat ${id}`)]))
    // 40, 30, 20, 6, 2.5, 1, 0.25 and 0.25 out of 100: the last three are each under 2% and become one 1.5% bubble.
    const rows: CategoryTotal[] = [40_000, 30_000, 20_000, 6_000, 2_500, 1_000, 250, 250].map((m, i) => ({ categoryId: i + 1, totalMinor: m }))
    mount({ totals: rows, categoryById: names, onPick: () => {} })
    expect(within(list()).getAllByRole('button')).toHaveLength(5)
    expect(screen.getByRole('button', { name: /^Cat 5, 2\.5%/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Cat 6,/ })).toBeNull()
    expect(within(list()).getByLabelText(/^Everything else, 1\.5%/).tagName).toBe('LI')
  })

  it('always keeps the three biggest as their own bubbles, however small, so a quiet month is not one grey circle', () => {
    // One category holds nearly everything; the next five are each far under 3%.
    const tiny: CategoryTotal[] = Array.from({ length: 6 }, (_, i) => ({ categoryId: i + 1, totalMinor: i === 0 ? 1_000_000 : 10 }))
    const more = new Map<number, Category>(tiny.map((t) => [t.categoryId, category(t.categoryId, `Tiny ${t.categoryId}`)]))
    mount({ totals: tiny, categoryById: more, onPick: () => {} })
    const buttons = within(list()).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label')?.split(',')[0])).toEqual(['Tiny 1', 'Tiny 2', 'Tiny 3'])
    expect(within(list()).getByLabelText(/^Everything else, /)).toBeInTheDocument()
  })

  it('keeps the name on every bubble that is left, since each is big enough to hold it', () => {
    mount({ onPick: () => {} })
    for (const name of ['Groceries', 'Shopping', 'Food & Dining', 'Health', 'Transport', 'Other']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name.replace('&', '\\&')},`) })).toHaveTextContent(name)
    }
  })

  it('folds everything past the eighth into one grey "Everything else" bubble, which opens nothing', () => {
    const ids = Array.from({ length: 10 }, (_, i) => i + 1)
    const many = new Map<number, Category>(ids.map((id) => [id, category(id, `Cat ${id}`)]))
    const rows: CategoryTotal[] = ids.map((id) => ({ categoryId: id, totalMinor: (11 - id) * 1000 }))
    mount({ totals: rows, categoryById: many, onPick: () => {} })
    expect(within(list()).getAllByRole('listitem')).toHaveLength(9)
    expect(within(list()).getAllByRole('button')).toHaveLength(8)
    const rest = within(list()).getByLabelText(/^Everything else, /)
    expect(rest.tagName).toBe('LI')
    // Cat 9 and Cat 10: 2,000 + 1,000 of 55,000.
    expect(rest).toHaveAttribute('aria-label', 'Everything else, 5.5%, ₹30')
  })

  it('draws nothing at all when nothing was spent', () => {
    const { container } = mount({ totals: [] })
    expect(container).toBeEmptyDOMElement()
    const zero = render(<CategoryBubbles totals={[{ categoryId: 1, totalMinor: 0 }]} categoryById={categoryById} currency="INR" />)
    expect(zero.container).toBeEmptyDOMElement()
  })

  it('names a category that no longer exists "No category" and greys it', () => {
    mount({ totals: [{ categoryId: 99, totalMinor: 500 }, { categoryId: 1, totalMinor: 500 }], onPick: () => {} })
    const orphan = screen.getByRole('button', { name: /^No category,/ })
    expect(orphan.querySelector<HTMLElement>('.bubble')!.style.getPropertyValue('--c')).toBe('var(--other)')
  })
})

describe('CategoryBubbles: how it looks', () => {
  it('sits in a box with the shape the packing worked out, and sizes its text from the box so it scales with the screen', () => {
    mount({ onPick: () => {} })
    const box = list().parentElement!
    expect(box.style.paddingBottom).toMatch(/^\d+(\.\d+)?%$/)
    expect(box.className).toContain('[container-type:inline-size]')
    const bubble = screen.getByRole('button', { name: /^Groceries,/ }).querySelector<HTMLElement>('.bubble')!
    expect(bubble.style.getPropertyValue('--fs')).toMatch(/cqw$/)
    expect(bubble.style.getPropertyValue('--ic')).toMatch(/cqw$/)
  })

  it('brings the bubbles in one after another', () => {
    mount({ onPick: () => {} })
    const delays = within(list()).getAllByRole('button').map((b) => b.querySelector<HTMLElement>('.bubble')!.style.getPropertyValue('--d'))
    expect(new Set(delays).size).toBe(delays.length)
  })
})
