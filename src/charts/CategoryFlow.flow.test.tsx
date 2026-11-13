// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Category } from '../db/schema'
import type { CategoryTotal } from '../insights/aggregates'
import { CategoryFlow } from './CategoryFlow'

const category = (id: number, name: string): Category => ({ id, name, color: `var(--s${id})` })
const categoryById = new Map<number, Category>([1, 2, 3, 4, 5, 6, 7].map((id) => [id, category(id, `Cat ${id}`)]))
// Out of ₹1,000.
const totals: CategoryTotal[] = [
  { categoryId: 1, totalMinor: 500_00 },
  { categoryId: 2, totalMinor: 300_00 },
  { categoryId: 3, totalMinor: 200_00 },
]

const mount = (over: Record<string, unknown> = {}) =>
  render(<CategoryFlow totals={totals} categoryById={categoryById} currency="INR" sourceLabel="Spent in October" {...over} />)
const ribbons = () => Array.from(document.querySelectorAll<SVGGElement>('[data-ribbon]'))
const lineOf = (g: Element) => g.querySelector('[data-line]')!
const list = () => screen.getByRole('list', { name: 'Spending by category, as a flow' })
/** A line runs "M<x> <y>C ... <x> <y>": where it leaves the chest and where it lands. */
const ends = (g: Element) => {
  const [, startX, endX] = /^M([\d.]+) [\d.]+C[\d.]+ [\d.]+ [\d.]+ [\d.]+ ([\d.]+) /.exec(lineOf(g).getAttribute('d')!) ?? []
  return { start: Number(startX), end: Number(endX) }
}

describe('CategoryFlow: the total splitting into each category', () => {
  it('puts the total on a treasure chest at the top, with what it is on its lid', () => {
    mount()
    const chest = document.querySelector('[data-chest]')!
    expect(chest).not.toBeNull()
    expect(chest.textContent).toContain('Spent in October')
    expect(chest.textContent).toContain('₹1,000')
  })

  it('shows an icon for each category, tinted in its colour', () => {
    mount({ categoryById: new Map<number, Category>([[1, category(1, 'Groceries')], [2, category(2, 'Transport')], [3, category(3, 'Shopping')]]) })
    const icons = Array.from(list().querySelectorAll<HTMLElement>('[data-icon]'))
    expect(icons.map((i) => i.getAttribute('data-icon'))).toEqual(['cart', 'car', 'bag'])
    expect(icons[0].style.background).toContain('var(--s1)')
  })

  it('draws one line to each category, in its colour', () => {
    mount()
    expect(ribbons().map((g) => g.getAttribute('data-ribbon'))).toEqual(['1', '2', '3'])
    expect(ribbons().map((g) => g.querySelector('.flow-cap')?.getAttribute('fill'))).toEqual(['var(--s1)', 'var(--s2)', 'var(--s3)'])
    // The line itself is a wash of that colour, paler at the chest and deeper where it lands.
    const stops = Array.from(document.querySelectorAll('linearGradient[id$="1-wash"] stop')) as SVGStopElement[]
    expect(stops.map((s) => s.style.stopColor)).toEqual(['var(--s1)', 'var(--s1)'])
    expect(stops.map((s) => Number(s.getAttribute('stop-opacity')))).toEqual([0.4, 1])
  })

  it('is a single smooth line each, not a band of strands, and not dotted', () => {
    mount()
    for (const g of ribbons()) {
      expect(g.querySelectorAll('[data-line]')).toHaveLength(1)
      expect(g.querySelector('[data-strand]')).toBeNull()
      expect(g.querySelector('.flow-pulse')).not.toBeNull()
    }
    // The only dashes are in the stylesheet, where one long dash is the light that travels down the line.
    expect(document.querySelectorAll('[stroke-dasharray]')).toHaveLength(0)
  })

  it('lets the ones on the left bend left, the middle one go straight down and the ones on the right bend right', () => {
    mount()
    const [first, middle, last] = ribbons().map(ends)
    expect(first.end).toBeLessThan(first.start)
    expect(last.end).toBeGreaterThan(last.start)
    expect(middle.end).toBeCloseTo(middle.start, 5)
  })

  it('leaves the chest at a different place along its base for each, in the order of the columns', () => {
    mount()
    const starts = ribbons().map((g) => ends(g).start)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    expect(new Set(starts).size).toBe(3)
  })

  it('makes a bigger share only a little thicker, and none thinner than a line you can see', () => {
    mount()
    const widths = ribbons().map((g) => Number(lineOf(g).getAttribute('data-width')))
    expect(widths[0]).toBeGreaterThan(widths[1])
    expect(widths[1]).toBeGreaterThan(widths[2])
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(3.5)
    expect(Math.max(...widths)).toBeLessThanOrEqual(12)
  })

  it('writes the name, amount and share of each under its line', () => {
    mount()
    const rows = Array.from(list().querySelectorAll('li')).map((li) => li.textContent)
    expect(rows).toEqual(['Cat 1₹50050.0%', 'Cat 2₹30030.0%', 'Cat 3₹20020.0%'])
  })

  it('describes the picture for a screen reader', () => {
    mount()
    expect(screen.getByRole('img', { name: 'Spent in October, ₹1,000. Where the money went: Cat 1 50.0%, Cat 2 30.0%, Cat 3 20.0%' })).toBeInTheDocument()
  })

  it('shows the biggest four and folds the rest into one grey Everything else', () => {
    const many: CategoryTotal[] = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ categoryId: id, totalMinor: (8 - id) * 100_00 }))
    mount({ totals: many })
    expect(list().querySelectorAll('li')).toHaveLength(5)
    const rest = ribbons().at(-1)!
    expect(rest.getAttribute('data-ribbon')).toBe('rest')
    expect(rest.querySelector('.flow-cap')?.getAttribute('fill')).toBe('var(--other)')
    // 3 + 2 + 1 of the 28 parts.
    expect(screen.getByLabelText('Everything else, ₹600, 21.4%')).toBeInTheDocument()
  })

  it('shows five as they are, without folding any', () => {
    mount({ totals: [1, 2, 3, 4, 5].map((id) => ({ categoryId: id, totalMinor: (6 - id) * 100_00 })) })
    expect(list().querySelectorAll('li')).toHaveLength(5)
    expect(screen.queryByText('Everything else')).toBeNull()
  })

  it('still draws a thin share as a line that can be seen', () => {
    mount({ totals: [{ categoryId: 1, totalMinor: 99_900 }, { categoryId: 2, totalMinor: 100 }] })
    expect(Number(lineOf(ribbons()[1]).getAttribute('data-width'))).toBeGreaterThanOrEqual(3.5)
  })

  it('opens a category from its label; the folded one opens a list of what is in it, not an expense list of its own', () => {
    const onPick = vi.fn()
    const many: CategoryTotal[] = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ categoryId: id, totalMinor: (8 - id) * 100_00 }))
    mount({ totals: many, onPick })
    fireEvent.click(screen.getByRole('button', { name: /^Cat 2, ₹600.*Show these expenses/ }))
    expect(onPick).toHaveBeenCalledWith(2)
    fireEvent.click(screen.getByRole('button', { name: 'Everything else, ₹600, 21.4%' }))
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('draws nothing when nothing was spent', () => {
    const { container } = mount({ totals: [] })
    expect(container).toBeEmptyDOMElement()
  })
})
