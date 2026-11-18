// @vitest-environment jsdom
import '../test/dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
      expect(g.querySelectorAll('[stroke-dasharray]')).toHaveLength(0)
    }
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

  it('gives every category its own line, with nothing folded into Everything else, and lists them all under the lines', () => {
    const many: CategoryTotal[] = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ categoryId: id, totalMinor: (8 - id) * 100_00 }))
    mount({ totals: many })
    expect(ribbons().map((g) => g.getAttribute('data-ribbon'))).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(list().querySelectorAll('li')).toHaveLength(7)
    expect(screen.queryByText('Everything else')).toBeNull()
    expect(Array.from(list().querySelectorAll('li')).map((li) => li.textContent)).toEqual([
      'Cat 1₹70025.0%', 'Cat 2₹60021.4%', 'Cat 3₹50017.9%', 'Cat 4₹40014.3%', 'Cat 5₹30010.7%', 'Cat 6₹2007.1%', 'Cat 7₹1003.6%',
    ])
    expect(list().querySelectorAll('[data-icon]')).toHaveLength(7)
  })

  it('makes the lines uneven when there are many: a clearly thicker line for a bigger spend, and a thin one still seen', () => {
    const many: CategoryTotal[] = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ categoryId: id, totalMinor: (8 - id) * 100_00 }))
    mount({ totals: many })
    const widths = ribbons().map((g) => Number(lineOf(g).getAttribute('data-width')))
    for (let i = 1; i < widths.length; i++) expect(widths[i - 1]).toBeGreaterThan(widths[i])
    expect(widths[0] - widths[6]).toBeGreaterThan(2.5)
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(2)
  })

  it('lands each of fourteen lines at its own place, side by side', () => {
    const many: CategoryTotal[] = Array.from({ length: 14 }, (_, i) => ({ categoryId: i + 1, totalMinor: (20 - i) * 100_00 }))
    const names = new Map<number, Category>(many.map((t) => [t.categoryId, category(t.categoryId, `Cat ${t.categoryId}`)]))
    mount({ totals: many, categoryById: names })
    const lands = ribbons().map((g) => ends(g).end)
    expect(new Set(lands).size).toBe(14)
    expect([...lands].sort((a, b) => a - b)).toEqual(lands)
    expect(list().querySelectorAll('li')).toHaveLength(14)
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

  it('opens a category from its label, in the columns and in the list of many', () => {
    const onPick = vi.fn()
    mount({ onPick })
    fireEvent.click(screen.getByRole('button', { name: /^Cat 2, ₹300.*Show these expenses/ }))
    expect(onPick).toHaveBeenCalledWith(2)
    cleanup()
    const many: CategoryTotal[] = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ categoryId: id, totalMinor: (8 - id) * 100_00 }))
    mount({ totals: many, onPick })
    fireEvent.click(screen.getByRole('button', { name: /^Cat 6, ₹200.*Show these expenses/ }))
    expect(onPick).toHaveBeenLastCalledWith(6)
  })

  it('draws nothing when nothing was spent', () => {
    const { container } = mount({ totals: [] })
    expect(container).toBeEmptyDOMElement()
  })
})
