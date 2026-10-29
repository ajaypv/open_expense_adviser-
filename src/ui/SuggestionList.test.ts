import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Category } from '../db/schema'
import type { Suggestion } from '../insights/suggestions'
import { SuggestionList } from './SuggestionList'

const categories = new Map<number, Category>([[1, { id: 1, name: 'Food & Dining', color: 'var(--s1)' }]])

const sent: Suggestion = {
  key: 'expense:swiggy', kind: 'expense', merchant: 'Swiggy', amountMinor: 45000, categoryId: 1,
  paymentMethod: '', reason: 'Usually in the evening', count: 5,
}
const received: Suggestion = { ...sent, key: 'income:employer', kind: 'income', merchant: 'Employer', amountMinor: 8_000_000, reason: 'Usually around the 1st' }

const render = (items: Suggestion[]) =>
  renderToStaticMarkup(createElement(SuggestionList, { items, categoryById: categories, currency: 'INR', onPick: () => {}, tone: 'page' }))

describe('SuggestionList', () => {
  it('shows the merchant, usual amount, reason and a category-coloured initial', () => {
    const html = render([sent])
    expect(html).toContain('Swiggy')
    expect(html).toContain('₹450')
    expect(html).toContain('Usually in the evening')
    expect(html).toContain('>S<') // initial
    expect(html).toContain('var(--s1)') // category colour on the initial
  })

  it('marks money received with a plus, not by colour alone', () => {
    const html = render([received])
    expect(html).toContain('+₹80,000')
    expect(html).toContain('text-good')
    expect(render([sent])).not.toContain('+₹')
  })

  it('gives each chip a spoken label that says what a tap does', () => {
    expect(render([sent])).toContain('aria-label="Swiggy, ₹450. Usually in the evening. Fill in the form"')
  })

  it('falls back to a neutral colour when the category is missing', () => {
    const html = renderToStaticMarkup(
      createElement(SuggestionList, { items: [sent], categoryById: new Map(), currency: 'INR', onPick: () => {}, tone: 'sheet' }),
    )
    expect(html).toContain('var(--other)')
  })
})
