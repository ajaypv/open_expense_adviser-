import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BottomNav, TABS } from './BottomNav'

const render = (current: Parameters<typeof BottomNav>[0]['current']) =>
  renderToStaticMarkup(createElement(BottomNav, { current, onSelect: () => {} }))

describe('BottomNav', () => {
  it('has four tabs; goals are opened from Home instead', () => {
    expect(TABS.map((t) => t.id)).toEqual(['home', 'activity', 'insights', 'settings'])
    const html = render('home')
    for (const label of ['Home', 'Activity', 'Insights', 'Settings']) expect(html).toContain(`>${label}<`)
    expect(html).not.toContain('>Goals<')
    expect((html.match(/<button/g) ?? []).length).toBe(4)
  })

  it('lays the tabs out in four equal columns', () => {
    expect(render('home')).toContain('grid-cols-4')
  })

  it('marks only the current tab', () => {
    const html = render('insights')
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1)
    expect(html).toMatch(/aria-current="page"[^>]*>[^]*?>Insights</)
  })
})
