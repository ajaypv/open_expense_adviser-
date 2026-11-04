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

  it('keeps the first one clear of the screen edge: the scroll padding matches the side padding', () => {
    const html = render([sent])
    expect(html).toContain('-mx-5')
    expect(html).toContain('px-5')
    // Without this the row snaps its first item to the very edge and the left side of it is lost.
    expect(html).toContain('scroll-px-5')
  })

  describe('as tiles', () => {
    const tiles = (items: Suggestion[]) =>
      renderToStaticMarkup(createElement(SuggestionList, { items, categoryById: categories, currency: 'INR', onPick: () => {}, tone: 'page', variant: 'tile' }))

    it('shows the category icon, the merchant, the amount large and the whole reason', () => {
      const html = tiles([sent])
      expect(html).toContain('data-icon="')
      expect(html).toContain('Swiggy')
      expect(html).toContain('text-xl')
      expect(html).toContain('₹450')
      expect(html).toContain('Usually in the evening')
      expect(html).not.toContain('>S<') // no initial: the icon says what it is
    })

    it('has a plus on each, so it reads as something to add', () => {
      expect(tiles([sent])).toContain('M12 5v14M5 12h14')
    })

    it('says what a tap does, the same as a chip', () => {
      expect(tiles([sent])).toContain('aria-label="Swiggy, ₹450. Usually in the evening. Fill in the form"')
    })

    it('marks money received with a plus and green, not by colour alone', () => {
      const html = tiles([received])
      expect(html).toContain('+₹80,000')
      expect(html).toContain('text-good')
    })

    it('comes in one after another, and waits until it is on screen', () => {
      const html = tiles([sent, received])
      expect(html).toContain('when-seen')
      expect(html).toContain('--d:0ms')
      expect(html).toContain('--d:70ms')
    })

    it('keeps the same side padding as the chips', () => {
      expect(tiles([sent])).toContain('scroll-px-5')
    })
  })

  it('is a slim chip by default, without the tile styling or the entrance', () => {
    const html = render([sent])
    expect(html).not.toContain('w-[9.5rem]')
    expect(html).not.toContain('when-seen')
  })

  it('falls back to a neutral colour when the category is missing', () => {
    const html = renderToStaticMarkup(
      createElement(SuggestionList, { items: [sent], categoryById: new Map(), currency: 'INR', onPick: () => {}, tone: 'sheet' }),
    )
    expect(html).toContain('var(--other)')
  })
})
