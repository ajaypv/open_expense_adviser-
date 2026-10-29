import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Category } from '../db/schema'
import type { Suggestion } from '../insights/suggestions'
import { AddSheet } from './AddSheet'

const categories: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Income', color: 'var(--ink-2)' },
]
const swiggy: Suggestion = {
  key: 'expense:swiggy', kind: 'expense', merchant: 'Swiggy', amountMinor: 45000, categoryId: 1,
  paymentMethod: '', reason: 'Usually in the evening', count: 5,
}

const render = (props: { suggestions: Suggestion[]; showSuggestions: boolean }) =>
  renderToStaticMarkup(
    createElement(AddSheet, { open: false, editing: null, categories, currency: 'INR', prefill: null, onClose: () => {}, ...props }),
  )

describe('AddSheet suggestions', () => {
  it('shows the suggestions section when they are on', () => {
    const html = render({ suggestions: [swiggy], showSuggestions: true })
    expect(html).toContain('Suggested for now')
    expect(html).toContain('Swiggy')
  })

  it('explains the empty state when they are on but there is no history yet', () => {
    expect(render({ suggestions: [], showSuggestions: true })).toContain('Merchants you add will show up here')
  })

  it('leaves the section out entirely when the user turned suggestions off', () => {
    const html = render({ suggestions: [swiggy], showSuggestions: false })
    expect(html).not.toContain('Suggested for now')
    expect(html).not.toContain('Swiggy')
    expect(html).not.toContain('Merchants you add will show up here')
  })
})
