import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BottomNav, TABS, TAB_ORDER } from './BottomNav'

const goalsOf = [{ id: 1, name: 'Trip', targetMinor: 10_000, savedMinor: 2_500, createdAt: 1 }]
const render = (current: Parameters<typeof BottomNav>[0]['current'], goals = goalsOf) =>
  renderToStaticMarkup(createElement(BottomNav, { current, onSelect: () => {}, goals, onOpenGoals: () => {} }))

describe('BottomNav', () => {
  it('has Home, Activity, Insights and Goals; Settings is at the top of a screen instead', () => {
    expect(TABS.map((t) => t.id)).toEqual(['home', 'activity', 'insights'])
    expect(TAB_ORDER).toEqual(['home', 'activity', 'insights', 'settings'])
    const html = render('home')
    for (const label of ['Home', 'Activity', 'Insights', 'Goals']) expect(html).toContain(`>${label}<`)
    expect(html).not.toContain('>Settings<')
    expect((html.match(/<button/g) ?? []).length).toBe(4)
  })

  it('puts Goals last, after Insights', () => {
    const html = render('home')
    expect(html.indexOf('>Insights<')).toBeLessThan(html.indexOf('>Goals<'))
  })

  it('lays the places out in four equal columns', () => {
    expect(render('home')).toContain('grid-cols-4')
  })

  it('says in words how much is saved on the Goals button, with a ring round the flag once there is a goal', () => {
    expect(render('home')).toContain('aria-label="Goals. 1 goal, 25% saved"')
    expect(render('home')).toContain('stroke-dashoffset')
    expect(render('home', [])).toContain('aria-label="Goals. None yet"')
    expect(render('home', [])).not.toContain('stroke-dashoffset')
  })

  it('marks only the current tab, and no tab while Settings or Goals is what is open', () => {
    const html = render('insights')
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1)
    expect(html).toMatch(/aria-current="page"[^>]*>[^]*?>Insights</)
    expect((render('settings').match(/aria-current="page"/g) ?? []).length).toBe(0)
  })
})
