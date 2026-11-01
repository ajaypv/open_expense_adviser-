// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaceChart } from './PaceChart'

// Amounts are stored in hundredths, so ₹100 is 10000.
const rupees = (n: number) => n * 100
/** Running totals for a month of `days` days with nothing until `from`, then `amount` from that day on. */
const lateSpender = (days: number, from: number, amount: number) => Array.from({ length: days }, (_, i) => (i + 1 >= from ? rupees(amount) : 0))

const base = { monthKey: '2026-11', currentLabel: 'November', previousLabel: 'October', currency: 'INR', budgetMinor: null }
// November so far: ₹2,794 on day 1. October: nothing until the 29th, then ₹12,520.
const november = Array.from({ length: 30 }, (_, i) => (i === 0 ? rupees(2794) : null))
const october = lateSpender(31, 29, 12520)

const mount = (over: Record<string, unknown> = {}) => render(<PaceChart {...base} current={november} previous={october} lastDay={1} {...over} />)
const legend = () => screen.getByRole('list')
const plot = () => screen.getByRole('group', { name: /Cumulative spending/ })

describe('PaceChart: at rest, this month so far against the whole of last month', () => {
  it('shows what last month came to, not the zero of its first day', () => {
    mount()
    expect(legend()).toHaveTextContent('November (so far)')
    expect(legend()).toHaveTextContent('₹2,794')
    expect(legend()).toHaveTextContent('October (whole month)')
    expect(legend()).toHaveTextContent('₹12,520')
    expect(legend()).not.toHaveTextContent('₹0')
  })

  it('says how far through last month’s total this month is', () => {
    mount()
    expect(screen.getByText('22% of what October came to in all')).toBeInTheDocument()
  })

  it('says when this month has already gone past last month’s whole total', () => {
    mount({ current: [rupees(15000), ...Array(29).fill(null)] })
    expect(screen.getByText('₹2,480 more than October came to in all')).toBeInTheDocument()
  })

  it('says when this month is exactly level with it', () => {
    mount({ current: [rupees(12520), ...Array(29).fill(null)] })
    expect(screen.getByText('Level with what October came to in all')).toBeInTheDocument()
  })

  it('says plainly when last month had no spending', () => {
    mount({ previous: Array(31).fill(0) })
    expect(screen.getByText('October had no spending.')).toBeInTheDocument()
  })

  it('says nothing about last month in the first month of use', () => {
    mount({ previous: [] })
    expect(legend()).not.toHaveTextContent('October')
  })
})

describe('PaceChart: pointing at a day compares the same day of each month', () => {
  it('switches to the figures through that day, labelled as that day', () => {
    mount()
    fireEvent.keyDown(plot(), { key: 'Home' })
    expect(screen.getByText('Day 1')).toBeInTheDocument()
    expect(legend()).toHaveTextContent('November')
    expect(legend()).not.toHaveTextContent('(so far)')
    expect(legend()).toHaveTextContent('October₹0') // the same day last month, which can honestly be nothing
    expect(legend()).not.toHaveTextContent('(whole month)')
    expect(screen.getByText('₹2,794 more than October')).toBeInTheDocument()
  })

  it('still says what last month came to in all while a day is chosen, so the zero is never alone', () => {
    mount()
    fireEvent.keyDown(plot(), { key: 'Home' })
    expect(screen.getByText('October came to ₹12,520 in all.')).toBeInTheDocument()
  })

  it('goes back to this month so far against the whole of last month when the day is let go', () => {
    mount()
    fireEvent.keyDown(plot(), { key: 'Home' })
    fireEvent.blur(plot())
    expect(legend()).toHaveTextContent('October (whole month)')
    expect(legend()).toHaveTextContent('₹12,520')
  })

  it('reads the same day of last month further on in the month', () => {
    const current = Array.from({ length: 30 }, (_, i) => (i < 30 ? rupees((i + 1) * 100) : null))
    mount({ current, lastDay: 30 })
    fireEvent.keyDown(plot(), { key: 'End' })
    expect(screen.getByText('Day 30')).toBeInTheDocument()
    expect(legend()).toHaveTextContent('₹3,000')
  })
})
