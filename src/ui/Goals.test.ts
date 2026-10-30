import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Goal } from '../db/schema'
import { GoalsSection } from './Goals'
import { GoalMoneySheet, GoalSheet } from './GoalSheets'

const today = new Date(2026, 9, 30) // 30 Oct 2026

let id = 0
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: ++id, name: 'New phone', targetMinor: 6_000_000, savedMinor: 1_500_000, createdAt: id, ...over,
})

const noop = () => {}
const section = (goals: Goal[]) =>
  renderToStaticMarkup(createElement(GoalsSection, { goals, currency: 'INR', today, onNew: noop, onEdit: noop, onAddMoney: noop }))

describe('GoalsSection', () => {
  it('invites a first goal when there are none', () => {
    const html = section([])
    expect(html).toContain('Goals')
    expect(html).toContain('Saving for something?')
    expect(html).toContain('Set a goal')
  })

  it('shows what is saved against the cost, with a progress bar that says so in words', () => {
    const html = section([goal()])
    expect(html).toContain('New phone')
    expect(html).toContain('₹15,000')
    expect(html).toContain('of ₹60,000')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="25"')
    expect(html).toContain('aria-valuetext="₹15,000 of ₹60,000 saved, 25%"')
  })

  it('says how long is left and how much to set aside, when the goal has a date', () => {
    const html = section([goal({ dueDate: '2027-01-28' })]) // 90 days: ₹45,000 left over three months
    expect(html).toContain('3 months left')
    expect(html).toContain('Set aside ₹15,000 a month')
  })

  it('says nothing about time for a goal with no date', () => {
    const html = section([goal()])
    expect(html).not.toMatch(/left<|Overdue|Due today|Set aside/)
  })

  it('warns, in words, when the date has passed', () => {
    expect(section([goal({ dueDate: '2026-10-25' })])).toContain('Overdue by 5 days')
  })

  it('celebrates a goal that is fully saved, and stops asking for money', () => {
    const html = section([goal({ savedMinor: 6_000_000, dueDate: '2027-01-28' })])
    expect(html).toContain('Goal reached')
    expect(html).not.toContain('Add money')
    expect(html).not.toContain('Set aside')
  })

  it('gives each goal its own named buttons to change it or add money', () => {
    const html = section([goal({ name: 'Goa trip' })])
    expect(html).toContain('aria-label="Edit goal Goa trip"')
    expect(html).toContain('aria-label="Add money to Goa trip"')
  })

  it('lists the soonest first and tucks the rest behind a button', () => {
    const goals = [
      goal({ name: 'E', dueDate: '2027-05-01' }),
      goal({ name: 'A', dueDate: '2026-12-01' }),
      goal({ name: 'D', dueDate: '2027-03-01' }),
      goal({ name: 'B', dueDate: '2027-01-01' }),
      goal({ name: 'C', dueDate: '2027-02-01' }),
    ]
    const html = section(goals)
    expect(html.indexOf('>A<')).toBeLessThan(html.indexOf('>B<'))
    expect(html.indexOf('>B<')).toBeLessThan(html.indexOf('>C<'))
    expect(html).not.toContain('>D<')
    expect(html).not.toContain('>E<')
    expect(html).toContain('Show all 5')
  })

  it('has a button to make another goal once some exist', () => {
    expect(section([goal()])).toContain('New goal')
  })
})

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
