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

  it('draws each category\'s own pie wedge, an angle equal to its share of the whole', () => {
    mount({ onPick: () => {} })
    const wedge = (name: RegExp) => screen.getByRole('button', { name }).querySelector<HTMLElement>('.bubble')!.style.getPropertyValue('--a')
    expect(wedge(/^Groceries,/)).toBe('118.1deg') // 32.8% of 360
    expect(wedge(/^Shopping,/)).toBe('58deg') // 16.1%
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
  it('leaves the name off a bubble too small to hold it, but keeps its icon, its share and its label', () => {
    const ids = Array.from({ length: 8 }, (_, i) => i + 1)
    const names = new Map<number, Category>(ids.map((id) => [id, category(id, `Cat ${id}`)]))
    // 40, 30, 20, 12, 8, 6, 4 and 3 out of 123: the last is 2.4% and gets the smallest bubble.
    const rows: CategoryTotal[] = [40, 30, 20, 12, 8, 6, 4, 3].map((k, i) => ({ categoryId: i + 1, totalMinor: k * 1000 }))
    mount({ totals: rows, categoryById: names, onPick: () => {} })
    const small = screen.getByRole('button', { name: /^Cat 8, 2\.4%, ₹30/ })
    expect(small).toHaveTextContent('2.4%')
    expect(small).not.toHaveTextContent('Cat 8')
    expect(small.querySelector('[data-icon]')).not.toBeNull()
    expect(screen.getByRole('button', { name: /^Cat 1,/ })).toHaveTextContent('Cat 1')
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
