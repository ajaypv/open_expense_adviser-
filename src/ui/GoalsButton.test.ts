import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Goal } from '../db/schema'
import { GoalsButton } from './GoalsButton'

let id = 0
const goal = (over: Partial<Goal> = {}): Goal => ({ id: ++id, name: 'Goa trip', targetMinor: 2_500_000, savedMinor: 500_000, createdAt: id, ...over })

const render = (goals: Goal[]) => renderToStaticMarkup(createElement(GoalsButton, { goals, onClick: () => {} }))

describe('GoalsButton', () => {
  it('is a button that says it opens the goals', () => {
    const html = render([])
    expect(html).toMatch(/^<button[^>]*type="button"/)
    expect(html).toContain('aria-haspopup="dialog"')
  })

  it('is labelled in words, so it is not just an icon', () => {
    expect(render([])).toContain('>Goals<')
    expect(render([goal()])).toContain('>Goals<')
  })

  it('says there are none yet when there are no goals, and shows no percentage', () => {
    const html = render([])
    expect(html).toContain('aria-label="Goals. None yet"')
    expect(html).not.toContain('%')
  })

  it('says how many goals and how much is saved overall', () => {
    const html = render([goal({ targetMinor: 2_500_000, savedMinor: 500_000 }), goal({ targetMinor: 6_000_000, savedMinor: 1_500_000 })])
    expect(html).toContain('aria-label="Goals. 2 goals, 24% saved"') // the full meaning, for a screen reader
    expect(html).not.toContain('>24%<') // a bare percentage means nothing at a glance; the Goals card on Home explains it
  })

  it('says one goal, not "1 goals"', () => {
    expect(render([goal()])).toContain('aria-label="Goals. 1 goal, 20% saved"')
  })

  it('mentions how many have been reached', () => {
    expect(render([goal({ savedMinor: 2_500_000 }), goal()])).toContain('aria-label="Goals. 2 goals, 60% saved, 1 reached"')
  })

  it('shows a progress ring only once there is a goal to measure', () => {
    expect((render([]).match(/<circle/g) ?? []).length).toBe(0)
    expect((render([goal()]).match(/<circle/g) ?? []).length).toBe(2) // the track and the progress
  })

  it('is big enough to tap', () => {
    expect(render([])).toContain('min-h-11')
  })

  it('glows when it first appears', () => {
    expect(render([])).toContain('goal-glow')
  })
})
