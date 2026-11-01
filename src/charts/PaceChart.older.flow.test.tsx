// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaceChart, PaceTable } from './PaceChart'

const rupees = (n: number) => n * 100
/** A full month whose running total climbs evenly to `total` over `days` days. */
const climbing = (days: number, total: number) => Array.from({ length: days }, (_, i) => Math.round((rupees(total) * (i + 1)) / days))

const base = { monthKey: '2026-11', currentLabel: 'November', previousLabel: 'October', currency: 'INR', budgetMinor: null }
// November through day 10: ₹3,000. October came to ₹31,000, September ₹15,000, August ₹46,500.
const november = Array.from({ length: 30 }, (_, i) => (i < 10 ? rupees((i + 1) * 300) : null))
const october = climbing(31, 31000)
const older = [
  { label: 'September', series: climbing(30, 15000) },
  { label: 'August', series: climbing(31, 46500) },
]

const mount = (over: Record<string, unknown> = {}) => render(<PaceChart {...base} current={november} previous={october} older={older} lastDay={10} {...over} />)
const legend = () => screen.getByRole('list')
const plot = () => screen.getByRole('group', { name: /Cumulative spending/ })
const toggle = () => screen.getByRole('group', { name: 'Months to compare with' })
const choose = (name: RegExp | string) => fireEvent.click(within(toggle()).getByRole('button', { name }))

describe('PaceChart: choosing how many months to compare', () => {
  it('offers last month or the last three months when there is history to show', () => {
    mount()
    expect(within(toggle()).getByRole('button', { name: 'Last month' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(toggle()).getByRole('button', { name: 'Last 3 months' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('offers nothing when there is no older month, or no last month', () => {
    mount({ older: [] })
    expect(screen.queryByRole('group', { name: 'Months to compare with' })).toBeNull()
  })

  it('offers nothing in the first month of use', () => {
    mount({ previous: [], older: [] })
    expect(screen.queryByRole('group', { name: 'Months to compare with' })).toBeNull()
  })

  it('says "Last 2 months" when only one older month exists', () => {
    mount({ older: [older[0]] })
    expect(within(toggle()).getByRole('button', { name: 'Last 2 months' })).toBeInTheDocument()
  })

  it('starts with last month alone, as before', () => {
    mount()
    expect(legend()).toHaveTextContent('October (whole month)')
    expect(legend()).not.toHaveTextContent('September')
    expect(legend()).not.toHaveTextContent('August')
  })

  it('lists each earlier month beside this one when three months are chosen', () => {
    mount()
    choose('Last 3 months')
    expect(legend()).toHaveTextContent('November (so far)₹3,000')
    expect(legend()).toHaveTextContent('October (whole month)₹31,000')
    expect(legend()).toHaveTextContent('September (whole month)₹15,000')
    expect(legend()).toHaveTextContent('August (whole month)₹46,500')
    expect(within(toggle()).getByRole('button', { name: 'Last 3 months' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('draws a line for each month and tells the older ones apart by their dashes, not only by colour', () => {
    mount()
    const lines = () => Array.from(document.querySelectorAll('svg path[stroke]'))
    const before = lines().length
    choose('Last 3 months')
    expect(lines().length).toBe(before + 2)
    const dashes = lines().map((p) => p.getAttribute('stroke-dasharray'))
    expect(dashes.filter(Boolean)).toHaveLength(2)
    expect(new Set(dashes.filter(Boolean)).size).toBe(2)
    choose('Last month')
    expect(lines().length).toBe(before)
  })

  it('grows the scale to fit the biggest earlier month', () => {
    mount()
    const top = () => document.querySelector('[role="group"] .border-line span')!.textContent
    expect(top()).toBe('₹40K')
    choose('Last 3 months')
    expect(top()).toBe('₹50K')
  })

  it('compares with the average of the earlier months, in words', () => {
    mount()
    choose('Last 3 months')
    // (31,000 + 15,000 + 46,500) / 3 = about 30,833 for a whole month; this month is ₹3,000 so far.
    expect(screen.getByText('10% of a usual month (the average of the last 3)')).toBeInTheDocument()
  })

  it('reads every month at the chosen day, and compares like with like', () => {
    mount()
    choose('Last 3 months')
    fireEvent.keyDown(plot(), { key: 'End' })
    expect(screen.getByText('Day 10')).toBeInTheDocument()
    // By day 10 of 31: October 10,000; of 30: September 5,000; of 31: August 15,000. Average 10,000.
    expect(legend()).toHaveTextContent('October₹10,000')
    expect(legend()).toHaveTextContent('September₹5,000')
    expect(legend()).toHaveTextContent('August₹15,000')
    expect(screen.getByText(/less than the 3-month average by then/)).toBeInTheDocument()
  })

  it('goes back to last month alone when asked, with its own sentence again', () => {
    mount()
    choose('Last 3 months')
    choose('Last month')
    expect(legend()).not.toHaveTextContent('September')
    expect(screen.getByText('10% of what October came to in all')).toBeInTheDocument()
  })
})

describe('PaceTable with older months', () => {
  const props = { current: november, previous: october, lastDay: 10, monthKey: '2026-11', currentLabel: 'November', previousLabel: 'October', currency: 'INR' }

  it('has a column for each earlier month, and a whole-month row for each', () => {
    render(<PaceTable {...props} older={older} />)
    for (const name of ['October by then', 'September by then', 'August by then']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
    }
    expect(screen.getByText('September, whole month')).toBeInTheDocument()
    expect(screen.getByText('August, whole month')).toBeInTheDocument()
    expect(screen.getByText('₹46,500')).toBeInTheDocument()
  })

  it('stays as it was without older months', () => {
    render(<PaceTable {...props} />)
    expect(screen.queryByRole('columnheader', { name: 'September by then' })).toBeNull()
    expect(screen.getAllByRole('columnheader')).toHaveLength(4)
  })

  it('scrolls sideways rather than squeezing, once there are extra columns', () => {
    const { container } = render(<PaceTable {...props} older={older} />)
    expect(container.querySelector('.overflow-x-auto')).not.toBeNull()
  })
})

describe('PaceChart: how the picture arrives', () => {
  it('reveals the lines when it is first drawn, so a change of month can be seen', () => {
    mount()
    expect(document.querySelector('svg.pace-reveal')).not.toBeNull()
  })
})
