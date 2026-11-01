import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BudgetPrompt } from './BudgetPrompt'

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

describe('BudgetPrompt', () => {
  it('says what setting a budget gives, not just that it can be done', () => {
    const html = renderToStaticMarkup(createElement(BudgetPrompt, { onSetBudget: () => {} }))
    expect(text(html)).toContain('Your budget')
    expect(text(html)).toContain('Set a monthly budget to see how much you have left.')
  })

  it('has a button that goes to where it is set', () => {
    const html = renderToStaticMarkup(createElement(BudgetPrompt, { onSetBudget: () => {} }))
    expect(html).toContain('>Set budget<')
    expect(html).toMatch(/<button[^>]*type="button"/)
  })

  it('is a block of its own, named so it can be found', () => {
    expect(renderToStaticMarkup(createElement(BudgetPrompt, { onSetBudget: () => {} }))).toContain('aria-label="Budget"')
  })
})
