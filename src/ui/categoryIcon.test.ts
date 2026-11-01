import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { categoryIcon } from './categoryIcon'
import { Icon } from './Icon'

describe('categoryIcon', () => {
  it.each([
    ['Food & Dining', 'utensils'],
    ['Groceries', 'cart'],
    ['Transport', 'car'],
    ['Bills & Utilities', 'bolt'],
    ['Health', 'heart'],
    ['Entertainment & Travel', 'ticket'],
    ['Shopping', 'bag'],
    ['Rent & Housing', 'home'],
    ['Income', 'arrowDown'],
    ['Other', 'tag'],
  ])('gives %s the %s icon', (name, icon) => {
    expect(categoryIcon(name)).toBe(icon)
  })

  it('does not mind capital letters or extra spaces', () => {
    expect(categoryIcon('  food & dining ')).toBe('utensils')
  })

  it('guesses for a category the person made or renamed, from the words in it', () => {
    expect(categoryIcon('Eating out')).toBe('utensils')
    expect(categoryIcon('Coffee')).toBe('utensils')
    expect(categoryIcon('Supermarket')).toBe('cart')
    expect(categoryIcon('Petrol')).toBe('car')
    expect(categoryIcon('Electricity')).toBe('bolt')
    expect(categoryIcon('Medical')).toBe('heart')
    expect(categoryIcon('Movies')).toBe('ticket')
    expect(categoryIcon('Clothes')).toBe('bag')
    expect(categoryIcon('Rent')).toBe('home')
  })

  it('falls back to a tag for anything it cannot place, or nothing at all', () => {
    expect(categoryIcon('Pottery supplies')).toBe('tag')
    expect(categoryIcon('')).toBe('tag')
    expect(categoryIcon(undefined)).toBe('tag')
  })

  it('only ever names an icon that is drawn', () => {
    const names = ['Food & Dining', 'Groceries', 'Transport', 'Bills & Utilities', 'Health', 'Entertainment & Travel', 'Shopping', 'Rent & Housing', 'Income', 'Other', 'zzz']
    for (const n of names) {
      const html = renderToStaticMarkup(createElement(Icon, { name: categoryIcon(n) }))
      expect(html, n).toMatch(/<path d="[^"]{8,}"/)
    }
  })
})
