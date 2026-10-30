import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { greetingFor, HomeHeader } from './HomeHeader'

const at = (hour: number) => new Date(2026, 9, 28, hour, 30)
const longDate = (d: Date) => new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
const render = (today = at(14)) => renderToStaticMarkup(createElement(HomeHeader, { today, goals: [], onOpenGoals: () => {} }))

describe('greetingFor', () => {
  it.each([
    [5, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [16, 'Good afternoon'],
    [17, 'Good evening'],
    [23, 'Good evening'],
    [0, 'Good evening'],
    [4, 'Good evening'],
  ])('at %i o’clock says %s', (hour, greeting) => {
    expect(greetingFor(at(hour))).toBe(greeting)
  })
})

describe('HomeHeader', () => {
  it('is the page title: a greeting, which a screen reader hears as "Home" first', () => {
    const html = render()
    expect(html).toMatch(/<h1[^>]*>/)
    expect(html).toContain('<span class="sr-only">Home. </span>Good afternoon')
  })

  it('greets by the time of day', () => {
    expect(render(at(8))).toContain('Good morning')
    expect(render(at(20))).toContain('Good evening')
  })

  it('shows the full date beneath it, in the person’s own format', () => {
    const d = at(14)
    expect(render(d)).toContain(longDate(d))
  })

  it('has the goals button at the right, after the greeting and the date', () => {
    const d = at(14)
    const html = render(d)
    expect(html).toMatch(/^<header/)
    expect(html.indexOf('Good afternoon')).toBeLessThan(html.indexOf(longDate(d)))
    expect(html.indexOf(longDate(d))).toBeLessThan(html.indexOf('aria-label="Goals. None yet"'))
  })

  it('lets a long date shorten instead of pushing the button off the screen', () => {
    expect(render()).toContain('truncate')
  })
})
