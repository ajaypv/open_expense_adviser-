import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HomeHeader } from './HomeHeader'

const today = new Date(2026, 9, 28)
const dateTitle = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(today)
const render = () => renderToStaticMarkup(createElement(HomeHeader, { today, goals: [], onOpenGoals: () => {} }))

describe('HomeHeader', () => {
  it('is the page title: today\'s date, which a screen reader hears as "Home" first', () => {
    const html = render()
    expect(html).toMatch(/<h1[^>]*>/)
    expect(html).toContain('<span class="sr-only">Home, </span>')
    expect(html).toContain(dateTitle)
  })

  it('has the goals button at the right, after the title', () => {
    const html = render()
    expect(html).toMatch(/^<header/)
    expect(html.indexOf(dateTitle)).toBeLessThan(html.indexOf('aria-label="Goals. None yet"'))
  })

  it('lets a long date shorten instead of pushing the button off the screen', () => {
    expect(render()).toContain('truncate')
  })
})
