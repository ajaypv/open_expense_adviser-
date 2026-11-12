// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Category } from '../db/schema'
import type { CategoryTotal } from '../insights/aggregates'
import { ShareRibbon } from './ShareRibbon'

const category = (id: number, name: string): Category => ({ id, name, color: `var(--s${id})` })
const categoryById = new Map<number, Category>([1, 2, 3, 4, 5, 6, 7].map((id) => [id, category(id, `Cat ${id}`)]))
// Out of ₹1,000.
const totals: CategoryTotal[] = [
  { categoryId: 1, totalMinor: 400_00 },
  { categoryId: 2, totalMinor: 300_00 },
  { categoryId: 3, totalMinor: 200_00 },
  { categoryId: 4, totalMinor: 100_00 },
]

const mount = (over: Record<string, unknown> = {}) => render(<ShareRibbon totals={totals} categoryById={categoryById} {...over} />)
const list = () => screen.getByRole('list', { name: 'Share of spending by category' })

describe('ShareRibbon: where the money flows, as percentages', () => {
  it('cuts one ribbon into a piece for each category, wide in proportion to its share', () => {
    mount()
    const pieces = Array.from(document.querySelectorAll<HTMLElement>('[data-part]'))
    expect(pieces).toHaveLength(4)
    expect(pieces.map((p) => p.style.background)).toEqual(['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'])
    expect(pieces.map((p) => parseFloat(p.style.flex))).toEqual([0.4, 0.3, 0.2, 0.1])
  })

  it('writes each share to one decimal beside its name', () => {
    mount()
    const rows = Array.from(list().querySelectorAll('li')).map((li) => li.textContent)
    expect(rows).toEqual(['Cat 140.0%', 'Cat 230.0%', 'Cat 320.0%', 'Cat 410.0%'])
  })

  it('folds the categories past the limit into Everything else', () => {
    const many: CategoryTotal[] = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ categoryId: id, totalMinor: (8 - id) * 100 }))
    mount({ totals: many, limit: 5 })
    expect(list().querySelectorAll('li')).toHaveLength(6)
    expect(screen.getByText('Everything else')).toBeInTheDocument()
    // 2 + 1 of 28 parts
    expect(screen.getByText('Everything else').parentElement).toHaveTextContent('10.7%')
  })

  it('opens a category from its name, but not Everything else', () => {
    const onPick = vi.fn()
    const many: CategoryTotal[] = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ categoryId: id, totalMinor: (8 - id) * 100 }))
    mount({ totals: many, limit: 5, onPick })
    fireEvent.click(screen.getByRole('button', { name: /^See Cat 2, / }))
    expect(onPick).toHaveBeenCalledWith(2)
    expect(screen.queryByRole('button', { name: /Everything else/ })).toBeNull()
  })

  it('describes itself for a screen reader, and draws nothing with nothing spent', () => {
    const { unmount } = mount()
    expect(screen.getByRole('img', { name: /Share of spending: Cat 1 40.0%, Cat 2 30.0%/ })).toBeInTheDocument()
    unmount()
    const { container } = mount({ totals: [] })
    expect(container).toBeEmptyDOMElement()
  })
})
