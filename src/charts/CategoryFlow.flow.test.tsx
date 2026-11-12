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
const list = () => screen.getByRole('list', { name: 'Spending by category, as a flow' })

describe('CategoryFlow: the total splitting into each category', () => {
  it('puts the total and what it is on a pill at the top', () => {
    mount()
    expect(screen.getByText('Spent in October')).toBeInTheDocument()
    expect(screen.getByText('₹1,000')).toBeInTheDocument()
  })

  it('draws a ribbon to each category, in its colour', () => {
    mount()
    expect(ribbons().map((g) => g.getAttribute('data-ribbon'))).toEqual(['1', '2', '3'])
    expect(ribbons().map((g) => g.querySelector('.flow-cap')?.getAttribute('fill'))).toEqual(['var(--s1)', 'var(--s2)', 'var(--s3)'])
    // The ribbon itself is a wash of that colour, pale at the top and deeper at the bottom.
    const stops = Array.from(document.querySelectorAll('linearGradient[id$="1-wash"] stop')) as SVGStopElement[]
    expect(stops.map((s) => s.style.stopColor)).toEqual(['var(--s1)', 'var(--s1)'])
    expect(stops.map((s) => Number(s.getAttribute('stop-opacity')))).toEqual([0.16, 0.62])
  })

  it('is smooth, with fine strands along each ribbon and no dotted line', () => {
    mount()
    for (const g of ribbons()) {
      expect(g.querySelectorAll('[data-strand]')).toHaveLength(1)
      expect(g.querySelectorAll('path[data-wash], path[d]')).not.toHaveLength(0)
      expect(g.querySelector('[stroke-dasharray]')).toBeNull()
      expect(g.querySelector('.flow-shine')).not.toBeNull()
    }
    expect(document.querySelectorAll('[stroke-dasharray]')).toHaveLength(0)
  })

  it('lets the ones on the left bend left, the middle one go straight down and the ones on the right bend right', () => {
    mount()
    // A ribbon's middle line runs from where it leaves the pill to where it lands: "M<x> 0 C ... <x> <bottom>".
    const ends = ribbons().map((g) => {
      const d = g.querySelector('[data-strand="centre"]')!.getAttribute('d')!
      const [, startX, endX] = /^M([\d.]+) 0C[\d.]+ [\d.]+ [\d.]+ [\d.]+ ([\d.]+) /.exec(d) ?? []
      return { start: Number(startX), end: Number(endX) }
    })
    expect(ends[0].end).toBeLessThan(ends[0].start)
    expect(ends[2].end).toBeGreaterThan(ends[2].start)
    // The middle one starts and lands within a few units of straight down.
    expect(Math.abs(ends[1].end - ends[1].start)).toBeLessThan(25)
  })

  it('makes each ribbon as wide as its share where it leaves the pill', () => {
    mount()
    const widths = ribbons().map((g) => {
      const d = g.querySelector('path[data-wash]')!.getAttribute('d')!
      const xs = /^M([\d.]+) 0.*?([\d.]+) 0Z$/.exec(d)!
      return Math.abs(Number(xs[2]) - Number(xs[1]))
    })
    expect(widths[0]).toBeCloseTo(75, 0)
    expect(widths[1]).toBeCloseTo(45, 0)
    expect(widths[2]).toBeCloseTo(30, 0)
  })

  it('writes the name, amount and share of each under its ribbon', () => {
    mount()
    const rows = Array.from(list().querySelectorAll('li')).map((li) => li.textContent)
    expect(rows).toEqual(['Cat 1₹50050.0%', 'Cat 2₹30030.0%', 'Cat 3₹20020.0%'])
  })

  it('describes the picture for a screen reader', () => {
    mount()
    expect(screen.getByRole('img', { name: 'Where the money went: Cat 1 50.0%, Cat 2 30.0%, Cat 3 20.0%' })).toBeInTheDocument()
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

  it('still draws a thin share where it can be seen', () => {
    mount({ totals: [{ categoryId: 1, totalMinor: 99_900 }, { categoryId: 2, totalMinor: 100 }] })
    const d = ribbons()[1].querySelector('path[data-wash]')!.getAttribute('d')!
    const xs = /^M([\d.]+) 0.*?([\d.]+) 0Z$/.exec(d)!
    expect(Math.abs(Number(xs[2]) - Number(xs[1]))).toBeGreaterThan(3)
  })

  it('opens a category from its label, and nothing from the folded one', () => {
    const onPick = vi.fn()
    const many: CategoryTotal[] = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ categoryId: id, totalMinor: (8 - id) * 100_00 }))
    mount({ totals: many, onPick })
    fireEvent.click(screen.getByRole('button', { name: /^Cat 2, ₹600.*Show these expenses/ }))
    expect(onPick).toHaveBeenCalledWith(2)
    expect(screen.queryByRole('button', { name: /Everything else/ })).toBeNull()
  })

  it('draws nothing when nothing was spent', () => {
    const { container } = mount({ totals: [] })
    expect(container).toBeEmptyDOMElement()
  })
})
