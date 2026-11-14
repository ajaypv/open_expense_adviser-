import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ScreenBar, SettingsButton } from './ScreenBar'

describe('ScreenBar', () => {
  it('has the name of the screen in the title face at the left, and the round Settings button at the right', () => {
    const html = renderToStaticMarkup(createElement(ScreenBar, { title: 'Activity', onOpenSettings: () => {} }))
    expect(html).toMatch(/^<header/)
    expect(html).toMatch(/<h1 class="type-greeting[^"]*">Activity<\/h1>/)
    expect(html.indexOf('>Activity<')).toBeLessThan(html.indexOf('aria-label="Settings"'))
  })

  it('has only the title where nobody listens for the button', () => {
    const html = renderToStaticMarkup(createElement(ScreenBar, { title: 'Insights' }))
    expect(html).toContain('>Insights<')
    expect(html).not.toContain('Settings')
  })

  it('makes the button round, 44 px, in the card colour with a fine rim, with the sliders icon', () => {
    const html = renderToStaticMarkup(createElement(SettingsButton, { onClick: () => {} }))
    expect(html).toContain('size-11')
    expect(html).toContain('rounded-full')
    expect(html).toContain('bg-surface')
    expect(html).toContain('var(--ring)')
    expect(html).toContain('<svg')
  })
})
