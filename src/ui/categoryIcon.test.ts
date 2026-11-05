import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { categoryIcon, nameIcon, spendIcon } from './categoryIcon'
import { paymentIcon } from './paymentIcon'
import { Icon } from './Icon'

describe('categoryIcon', () => {
  it.each([
    ['Food & Dining', 'utensils'],
    ['Groceries', 'cart'],
    ['Transport', 'car'],
    ['Bills & Utilities', 'receipt'],
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
    expect(categoryIcon('Phone bill')).toBe('receipt')
    expect(categoryIcon('Insurance')).toBe('receipt')
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
    const names = ['Food & Dining', 'Groceries', 'Transport', 'Bills & Utilities', 'Health', 'Entertainment & Travel', 'Shopping', 'Rent & Housing', 'Income', 'Other', 'Mobile recharge', 'Home loan EMI', 'zzz']
    for (const n of names) {
      const html = renderToStaticMarkup(createElement(Icon, { name: categoryIcon(n) }))
      expect(html, n).toMatch(/<path d="[^"]{8,}"/)
    }
  })
})

describe('bills, recharges and EMIs each have their own icon', () => {
  it('draws the three differently from one another and from the old bolt', () => {
    const d = (name: 'receipt' | 'recharge' | 'emi' | 'autopay' | 'bolt') => renderToStaticMarkup(createElement(Icon, { name })).match(/ d="([^"]+)"/)?.[1]
    const all = ['receipt', 'recharge', 'emi', 'autopay', 'bolt'].map((n) => d(n as 'bolt'))
    expect(new Set(all).size).toBe(5)
  })

  it('gives a category named for a recharge or an EMI its own icon, before any bill rule', () => {
    expect(categoryIcon('Mobile recharge')).toBe('recharge')
    expect(categoryIcon('Prepaid')).toBe('recharge')
    expect(categoryIcon('Home loan')).toBe('emi')
    expect(categoryIcon('Car EMI')).toBe('emi')
    expect(categoryIcon('Electricity bill')).toBe('bolt')
  })

  it('finds an EMI or a recharge from a merchant’s name, and nothing else', () => {
    expect(nameIcon('Jio recharge')).toBe('recharge')
    expect(nameIcon('Airtel')).toBe('recharge')
    expect(nameIcon('HDFC Home Loan EMI')).toBe('emi')
    expect(nameIcon('Swiggy')).toBeNull()
    expect(nameIcon('Remit')).toBeNull() // "emi" must start a word
    expect(nameIcon(undefined)).toBeNull()
  })

  it('shows a purchase by its merchant first, then by its category', () => {
    expect(spendIcon('Jio recharge', 'Bills & Utilities')).toBe('recharge')
    expect(spendIcon('Bajaj Finserv EMI', 'Shopping')).toBe('emi')
    expect(spendIcon('BESCOM', 'Bills & Utilities')).toBe('receipt')
    expect(spendIcon('', 'Groceries')).toBe('cart')
  })

  it('shows a regular payment by its type, unless its name says recharge', () => {
    expect(paymentIcon('loan', 'Car loan')).toBe('emi')
    expect(paymentIcon('loan', 'Anything')).toBe('emi')
    expect(paymentIcon('bill', 'Water bill')).toBe('receipt')
    expect(paymentIcon('bill', 'Jio postpaid')).toBe('recharge')
    expect(paymentIcon('autopay', 'Gym')).toBe('autopay')
    expect(paymentIcon('subscription', 'Netflix')).toBe('repeat')
    expect(paymentIcon('income', 'Salary')).toBe('arrowDown')
    expect(paymentIcon('other', 'Misc', 'Groceries')).toBe('cart')
  })
})
