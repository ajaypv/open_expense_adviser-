import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Goal } from '../db/schema'
import { GoalMoneySheet, GoalSheet } from './GoalSheets'

const today = new Date(2026, 9, 30) // 30 Oct 2026

let id = 0
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: ++id, name: 'New phone', targetMinor: 6_000_000, savedMinor: 1_500_000, createdAt: id, ...over,
})

const noop = () => {}

describe('GoalSheet', () => {
  const sheet = (g: Goal | null) => renderToStaticMarkup(createElement(GoalSheet, { open: true, goal: g, today, onClose: noop }))

  it('asks what, how much, and optionally when', () => {
    const html = sheet(null)
    for (const text of ['New goal', 'What are you saving for?', 'How much does it cost?', 'Saved so far', 'Date (optional)', 'Save goal']) {
      expect(html).toContain(text)
    }
    expect(html).not.toContain('Delete goal')
  })

  it('offers a few ideas to start from when making a goal', () => {
    const html = sheet(null)
    for (const idea of ['New phone', 'Trip', 'Emergency fund', 'Gift']) expect(html).toContain(`>${idea}<`)
  })

  it('only lets a date be picked from today on', () => {
    expect(sheet(null)).toContain('min="2026-10-30"')
  })

  it('fills in an existing goal, and lets it be deleted', () => {
    const html = sheet(goal({ name: 'Goa trip', targetMinor: 2_500_000, savedMinor: 400_000, dueDate: '2027-01-15' }))
    expect(html).toContain('Edit goal')
    expect(html).toContain('value="Goa trip"')
    expect(html).toContain('value="25000"')
    expect(html).toContain('value="4000"')
    expect(html).toContain('value="2027-01-15"')
    expect(html).toContain('Delete goal')
    expect(html).not.toContain('>Trip<') // ideas are for new goals only
  })
})

describe('GoalMoneySheet', () => {
  const sheet = (g: Goal | null) => renderToStaticMarkup(createElement(GoalMoneySheet, { open: true, goal: g, currency: 'INR', onClose: noop }))

  it('names the goal and says the money is only tracked on it', () => {
    const html = sheet(goal({ name: 'Goa trip' }))
    expect(html).toContain('Add money to Goa trip')
    expect(html).toContain('doesn’t change your balance')
  })

  it('can add or take out, and fill in what is still needed', () => {
    const html = sheet(goal()) // ₹60,000 cost, ₹15,000 saved
    expect(html).toContain('>Add<')
    expect(html).toContain('>Take out<')
    expect(html).toContain('Fill the rest (₹45,000)')
  })

  it('does not offer to fill the rest of a goal that is already full', () => {
    expect(sheet(goal({ savedMinor: 6_000_000 }))).not.toContain('Fill the rest')
  })

  it('renders nothing to read when no goal is chosen', () => {
    expect(sheet(null)).not.toContain('Add money to')
  })
})
