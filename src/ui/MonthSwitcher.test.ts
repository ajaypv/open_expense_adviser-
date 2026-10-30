import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MonthSwitcher } from './MonthSwitcher'

const render = (month: string, activeMonths?: Set<string>, currentMonth = '2026-10') =>
  renderToStaticMarkup(createElement(MonthSwitcher, { month, currentMonth, onChange: () => {}, activeMonths }))

describe('MonthSwitcher', () => {
  it('shows the month and opens a picker when it is tapped', () => {
    const html = render('2026-10')
    expect(html).toContain('October 2026')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('Choose a month')
  })

  it('lists all twelve months of the year, named in full for screen readers', () => {
    const html = render('2026-10')
    for (const m of ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']) {
      expect(html).toContain(`aria-label="${m} 2026`)
    }
  })

  it('marks the month being viewed', () => {
    const html = render('2026-08')
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="August 2026/)
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1)
  })

  it('disables months that have not happened yet', () => {
    const html = render('2026-10')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="November 2026/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="December 2026/)
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="September 2026/)
  })

  it('says which months have transactions', () => {
    const html = render('2026-10', new Set(['2026-03', '2026-10']))
    expect(html).toContain('aria-label="March 2026, has transactions"')
    expect(html).toContain('aria-label="October 2026, has transactions"')
    expect(html).not.toContain('aria-label="April 2026, has transactions"')
  })

  it('starts the picker on the year being viewed', () => {
    const html = render('2025-11', new Set(['2025-11', '2026-10']))
    expect(html).toContain('aria-label="November 2025, has transactions"')
    expect(html).toContain('aria-label="Previous year"')
  })

  it('offers a way back to this month only when somewhere else', () => {
    expect(render('2026-10')).not.toContain('This month')
    const away = render('2026-07')
    expect(away).toContain('This month')
  })

  it('keeps the arrows, and the next one is off at the current month', () => {
    const now = render('2026-10')
    expect(now).toContain('aria-label="Previous month"')
    expect(now).toMatch(/disabled=""[^>]*aria-label="Next month"/)
    expect(render('2026-07')).not.toMatch(/disabled=""[^>]*aria-label="Next month"/)
  })
})
