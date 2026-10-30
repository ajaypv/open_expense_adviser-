import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Category } from '../db/schema'
import { InsightCard } from './InsightCard'

const categoryById = new Map<number, Category>([
  [1, { id: 1, name: 'Food & Dining', color: 'var(--s1)' }],
  [2, { id: 2, name: 'Transport', color: 'var(--s3)' }],
])
const render = (totals: { categoryId: number; totalMinor: number }[], totalMinor: number, month = 'October') =>
  renderToStaticMarkup(createElement(InsightCard, { totals, totalMinor, categoryById, monthName: month, onOpen: () => {} }))
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

describe('InsightCard', () => {
  it('says something true about this month, from the transactions, not a generic tip', () => {
    const t = text(render([{ categoryId: 1, totalMinor: 45_000 }, { categoryId: 2, totalMinor: 23_000 }], 68_000))
    expect(t).toContain('Food & Dining is 66% of what you have spent in October.')
  })

  it('leads to the full insights, and says what it is for', () => {
    const html = render([{ categoryId: 1, totalMinor: 100 }], 100)
    expect(text(html)).toContain('Understand your spending')
    expect(html).toContain('>See insights<')
  })

  it('is not shown when nothing has been spent', () => {
    expect(render([], 0)).toBe('')
  })

  it('does not claim a share it cannot work out', () => {
    expect(render([{ categoryId: 1, totalMinor: 0 }], 0)).toBe('')
  })

  it('names the category even when it has since been removed', () => {
    expect(text(render([{ categoryId: 99, totalMinor: 100 }], 100))).toContain('One category is 100% of what you have spent in October.')
  })

  it('uses blue, which means information in this app', () => {
    expect(render([{ categoryId: 1, totalMinor: 100 }], 100)).toContain('var(--s1)')
  })
})
