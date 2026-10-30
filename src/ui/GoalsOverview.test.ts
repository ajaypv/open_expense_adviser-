import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Goal } from '../db/schema'
import { GoalsOverview } from './GoalsOverview'

const today = new Date(2026, 9, 30)
let id = 0
const goal = (over: Partial<Goal> = {}): Goal => ({ id: ++id, name: 'Goa trip', targetMinor: 2_500_000, savedMinor: 500_000, createdAt: id, ...over })

const noop = () => {}
const overview = (goals: Goal[]) =>
  renderToStaticMarkup(createElement(GoalsOverview, { open: true, onClose: noop, goals, currency: 'INR', today, onNew: noop, onEdit: noop, onAddMoney: noop }))

describe('GoalsOverview', () => {
  it('is a sheet titled Goals, with a way to close it', () => {
    const html = overview([])
    expect(html).toMatch(/<h2[^>]*id="goals-title"[^>]*>Goals<\/h2>/)
    expect(html).toContain('aria-labelledby="goals-title"')
    expect(html).toContain('aria-label="Close"')
  })

  it('invites a first goal when there are none, with no totals to show', () => {
    const html = overview([])
    expect(html).toContain('Saving for something?')
    expect(html).toContain('Set a goal')
    expect(html).not.toContain('saved of')
    expect(html).not.toContain('New goal')
  })

  it('shows everything saved against everything it will cost', () => {
    const html = overview([goal({ targetMinor: 2_500_000, savedMinor: 500_000 }), goal({ name: 'Phone', targetMinor: 6_000_000, savedMinor: 1_500_000 })])
    expect(html).toContain('₹20,000')
    expect(html).toContain('saved of ₹85,000')
    expect(html).toContain('2 goals')
    expect(html).toContain('aria-label="All goals saved"')
    expect(html).toContain('aria-valuenow="24"') // 20,000 of 85,000
  })

  it('says one goal, not "1 goals", and only mentions reached ones when there are some', () => {
    expect(overview([goal()])).toContain('1 goal')
    expect(overview([goal()])).not.toContain('1 goals')
    expect(overview([goal()])).not.toContain('reached')
    expect(overview([goal({ savedMinor: 2_500_000 }), goal()])).toContain('1 reached')
  })

  it('has a button for another goal once some exist', () => {
    expect(overview([goal()])).toContain('New goal')
  })

  it('lists every goal, not only the first few', () => {
    const goals = ['A', 'B', 'C', 'D', 'E', 'F'].map((name, i) => goal({ name, dueDate: `2027-0${i + 1}-01` }))
    const html = overview(goals)
    for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) expect(html).toContain(`>${name}<`)
    expect(html).not.toContain('Show all')
  })

  it('puts goals still being saved for first, soonest first, and reached ones under their own heading', () => {
    const html = overview([
      goal({ name: 'Later', dueDate: '2027-06-01' }),
      goal({ name: 'Done', savedMinor: 2_500_000 }),
      goal({ name: 'Sooner', dueDate: '2026-12-01' }),
    ])
    expect(html).toContain('In progress')
    expect(html).toContain('Reached</h3>')
    expect(html.indexOf('>Sooner<')).toBeLessThan(html.indexOf('>Later<'))
    expect(html.indexOf('>Later<')).toBeLessThan(html.indexOf('>Done<'))
  })

  it('leaves out the Reached heading when nothing has been reached', () => {
    expect(overview([goal()])).not.toContain('Reached</h3>')
  })

  it('says what the money is, so nobody expects it to change their balance', () => {
    for (const goals of [[], [goal()]]) {
      expect(overview(goals)).toContain('does not change your balance or spending')
    }
  })

  it('explains how goals work when there are none yet', () => {
    const html = overview([])
    expect(html).toContain('<ol')
    expect(html).toContain('Pick a date')
    expect(overview([goal()])).not.toContain('Pick a date')
  })

  it('shows what is still to save and the share saved, in the total', () => {
    const html = overview([goal({ targetMinor: 2_500_000, savedMinor: 500_000 }), goal({ name: 'Phone', targetMinor: 6_000_000, savedMinor: 1_500_000 })])
    expect(html).toContain('₹65,000 to go')
    expect(html).toContain('24% saved')
  })

  it('says everything is saved, not "₹0 to go", once every goal is reached', () => {
    const html = overview([goal({ savedMinor: 2_500_000 })])
    expect(html).toContain('All saved')
    expect(html).not.toContain('to go')
  })

  it('gives each goal its percentage, what is left, its date and what to set aside', () => {
    const html = overview([goal({ targetMinor: 2_500_000, savedMinor: 500_000, dueDate: '2026-11-08' })])
    expect(html).toContain('20%')
    expect(html).toContain('₹20,000 to go')
    expect(html).toContain('9 days left')
    expect(html).toContain('Save ₹10,000 a week to get there on time')
  })

  it('still says what is left for a goal with no date, and suggests no pace', () => {
    const html = overview([goal({ targetMinor: 2_500_000, savedMinor: 500_000 })])
    expect(html).toContain('₹20,000 to go')
    expect(html).not.toContain('Due ')
    expect(html).not.toContain('to get there on time')
  })

  it('flags a goal that is past its date', () => {
    const html = overview([goal({ dueDate: '2026-10-28' })])
    expect(html).toContain('Overdue by 2 days, was due')
    expect(html).not.toContain('to get there on time')
  })

  it('marks a reached goal as reached instead of showing what is left', () => {
    const html = overview([goal({ name: 'Done', savedMinor: 2_500_000 }), goal({ name: 'Open' })])
    const done = html.slice(html.indexOf('>Done<'))
    expect(done).toContain('Goal reached')
    expect(done).not.toContain('Add money to Done')
  })

  it('gives each goal its own buttons', () => {
    const html = overview([goal({ name: 'Goa trip' })])
    expect(html).toContain('aria-label="Edit goal Goa trip"')
    expect(html).toContain('aria-label="Add money to Goa trip"')
  })
})
