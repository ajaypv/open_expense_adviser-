// @vitest-environment jsdom
import '../test/dom'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Category } from '../db/schema'
import { CategoryBars } from './CategoryBars'

const names = ['Shopping', 'Transport', 'Bills & Utilities', 'EMI', 'Credit Card', 'Food & Dining', 'Other']
const categoryById = new Map<number, Category>(names.map((name, i) => [i + 1, { id: i + 1, name, color: `var(--s${i + 1})` }]))
const totals = names.map((_, i) => ({ categoryId: i + 1, totalMinor: (10 - i) * 100_00 }))
const labels = (el: HTMLElement) => Array.from(el.querySelectorAll('li')).map((li) => li.textContent ?? '')

describe('CategoryBars: a pinned category', () => {
  it('folds what is past the limit into Everything else, with nothing pinned', () => {
    const { container } = render(<CategoryBars totals={totals} categoryById={categoryById} currency="INR" limit={5} />)
    const rows = labels(container)
    expect(rows).toHaveLength(6)
    expect(rows.some((r) => r.includes('Food & Dining'))).toBe(false)
    expect(rows[5]).toContain('Everything else')
  })

  it('lists the pinned one in its own place, once, and takes it out of Everything else', () => {
    const { container } = render(<CategoryBars totals={totals} categoryById={categoryById} currency="INR" limit={5} pin="Food & Dining" />)
    const rows = labels(container)
    expect(rows).toHaveLength(7)
    expect(rows.filter((r) => r.includes('Food & Dining'))).toHaveLength(1)
    expect(rows[5]).toContain('Food & Dining')
    expect(rows[5]).toContain('₹500')
    // Food was ₹500 and Other ₹400: only Other is left in the rest.
    expect(rows[6]).toContain('Everything else')
    expect(rows[6]).toContain('₹400')
  })

  it('leaves the list as it is when the pinned one is already among the biggest', () => {
    const { container } = render(<CategoryBars totals={totals} categoryById={categoryById} currency="INR" limit={6} pin="Food & Dining" />)
    const rows = labels(container)
    expect(rows).toHaveLength(7)
    expect(rows.filter((r) => r.includes('Food & Dining'))).toHaveLength(1)
  })

  it('does nothing when there is no spending in the pinned category', () => {
    const noFood = totals.filter((t) => t.categoryId !== 6)
    const { container } = render(<CategoryBars totals={noFood} categoryById={categoryById} currency="INR" limit={5} pin="Food & Dining" />)
    expect(labels(container)).toHaveLength(6)
  })
})
