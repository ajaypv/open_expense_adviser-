// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

describe('CategoryBars: Everything else opens', () => {
  it('is a button that opens a list of what is in it, each with its icon, amount and share, and closes it again', () => {
    render(<CategoryBars totals={totals} categoryById={categoryById} currency="INR" limit={5} />)
    const rest = screen.getByRole('button', { name: /^Everything else, ₹900. Show what is in it/ })
    expect(rest).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list', { name: 'Everything else, by category' })).toBeNull()
    fireEvent.click(rest)
    expect(rest).toHaveAttribute('aria-expanded', 'true')
    expect(rest).toHaveAccessibleName(/Hide what is in it/)
    const list = screen.getByRole('list', { name: 'Everything else, by category' })
    expect(list.textContent).toContain('Food & Dining')
    expect(list.textContent).toContain('Other')
    expect(list.querySelectorAll('[data-icon]')).toHaveLength(2)
    fireEvent.click(rest)
    expect(screen.queryByRole('list', { name: 'Everything else, by category' })).toBeNull()
  })

  it('opens the expenses of a category in it, and opening the list opened none', () => {
    const onPick = vi.fn()
    render(<CategoryBars totals={totals} categoryById={categoryById} currency="INR" limit={5} onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: /^Everything else/ }))
    expect(onPick).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Other, ₹400.*Show these expenses/ }))
    expect(onPick).toHaveBeenCalledWith(7)
  })
})
