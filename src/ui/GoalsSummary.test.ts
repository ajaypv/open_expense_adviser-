import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Goal } from '../db/schema'
import { GoalsSummary } from './GoalsSummary'

const today = new Date(2026, 9, 30)
let id = 0
const goal = (over: Partial<Goal> = {}): Goal => ({ id: ++id, name: 'Goa trip', targetMinor: 2_500_000, savedMinor: 500_000, createdAt: id, ...over })
const render = (goals: Goal[]) => renderToStaticMarkup(createElement(GoalsSummary, { goals, currency: 'INR', today, onOpen: () => {} }))
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

describe('GoalsSummary: what a goal percentage means', () => {
  it('is not there at all when there are no goals; the Goals button in the header is the way in', () => {
    expect(render([])).toBe('')
  })

  it('shows the goal that matters most with what is saved, what it costs, and the progress', () => {
    const html = render([goal()])
    const t = text(html)
    expect(t).toContain('Goals')
    expect(t).toContain('Goa trip')
    expect(t).toContain('₹5,000 of ₹25,000')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="20"')
  })

  it('says how much is left, or how long, so the percentage is never left unexplained', () => {
    expect(text(render([goal()]))).toContain('₹20,000 to go')
    expect(text(render([goal({ dueDate: '2026-11-08' })]))).toContain('9 days left')
  })

  it('picks the one due soonest, not just the first made', () => {
    const t = text(render([goal({ name: 'Later', dueDate: '2027-06-01' }), goal({ name: 'Sooner', dueDate: '2026-12-01' })]))
    expect(t).toContain('Sooner')
    expect(t).not.toContain('Later')
    expect(t).toContain('1 more goal')
  })

  it('says "goals" when there are several more', () => {
    expect(text(render([goal(), goal(), goal()]))).toContain('2 more goals')
  })

  it('shows a reached goal as reached when that is all there is', () => {
    expect(text(render([goal({ savedMinor: 2_500_000 })]))).toContain('Goal reached')
  })

  it('opens the goals, with a button that says so', () => {
    expect(render([goal()])).toContain('>See goals<')
  })

  it('uses amber for goals, one of the few places colour carries meaning', () => {
    expect(render([goal()])).toContain('var(--s4)')
  })
})
