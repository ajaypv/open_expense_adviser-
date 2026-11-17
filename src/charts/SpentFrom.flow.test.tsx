// @vitest-environment jsdom
import '../test/dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { MonthBreakdown } from '../insights/trends'
import { SpentFrom } from './SpentFrom'

const breakdown: MonthBreakdown = {
  carriedInMinor: 40_000_00,
  receivedMinor: 50_000_00,
  spentMinor: 45_000_00,
  fromCarriedMinor: 40_000_00,
  fromIncomeMinor: 5_000_00,
  notCoveredMinor: 0,
  carriedOutMinor: 45_000_00,
  carriedRanOutOn: '2026-11-10',
  fromCarriedByCategory: [
    { categoryId: 2, totalMinor: 25_000_00 },
    { categoryId: 1, totalMinor: 15_000_00 },
  ],
  steps: [
    { month: '2026-10', carriedInMinor: 0, receivedMinor: 80_000_00, spentMinor: 40_000_00, carriedOutMinor: 40_000_00 },
    { month: '2026-11', carriedInMinor: 40_000_00, receivedMinor: 50_000_00, spentMinor: 45_000_00, carriedOutMinor: 45_000_00 },
  ],
}
const cats = new Map([
  [1, { name: 'Food & Dining', color: 'red' }],
  [2, { name: 'Rent & Housing', color: 'blue' }],
])
const labels: Record<string, string> = { '2026-10': 'October', '2026-11': 'November' }

const mount = (over: Partial<MonthBreakdown> = {}, inProgress = false) =>
  render(
    <SpentFrom
      breakdown={{ ...breakdown, ...over }}
      categoryById={cats}
      currency="INR"
      monthName="November"
      prevName="October"
      prevMonth="2026-10"
      labelOf={(m) => labels[m]}
      inProgress={inProgress}
      more={<p>WHOLE MONTH</p>}
    />,
  )
const line = (c: HTMLElement, key: string) => c.querySelector(`[data-line="${key}"]`) as HTMLElement
const part = (c: HTMLElement, key: string) => c.querySelector(`[data-part="${key}"]`) as HTMLElement

describe('SpentFrom', () => {
  it('opens on only what was left from last month on its last day, how much this month used and how much is left', () => {
    const { container } = mount({ fromCarriedMinor: 30_000_00, fromIncomeMinor: 0, spentMinor: 30_000_00, carriedRanOutOn: null })
    expect(screen.getByText('Left from October, on 31 October')).toBeInTheDocument()
    expect(screen.getByText('₹40,000')).toBeInTheDocument()
    expect(line(container, 'used').textContent).toMatch(/Used in November.*75% of it.*₹30,000/)
    expect(line(container, 'still').textContent).toMatch(/Still left.*25% of it.*₹10,000/)
    expect(Array.from(container.querySelectorAll('[data-segment]')).map((s) => (s as HTMLElement).style.width)).toEqual(['75%', '25%'])
    // Nothing else until the full view is opened.
    expect(container.querySelector('[data-full-view]')).toBeNull()
    expect(screen.queryByText('WHOLE MONTH')).toBeNull()
    expect(container.querySelector('[data-part]')).toBeNull()
  })

  it('says "so far" while the month is open', () => {
    const { container } = mount({}, true)
    expect(line(container, 'used').textContent).toContain('Used in November so far')
  })

  it('says the money was used up, and when', () => {
    const { container } = mount()
    expect(line(container, 'still').textContent).toMatch(/Used up.*On (10 November|November 10).*₹0/)
  })

  it('opens the full view on a tap, with the whole month first, and closes it again', async () => {
    const user = userEvent.setup()
    const { container } = mount()
    const button = screen.getByRole('button', { name: 'Full view' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    expect(screen.getByRole('button', { name: 'Hide full view' })).toHaveAttribute('aria-expanded', 'true')
    const full = container.querySelector('[data-full-view]') as HTMLElement
    expect(full.querySelector('[data-whole-month]')?.textContent).toContain('All of November')
    expect(screen.getByText('WHOLE MONTH')).toBeInTheDocument()
    expect(part(container, 'earlier').textContent).toMatch(/From October's money.*89% of what you spent.*₹40,000/)
    expect(part(container, 'income').textContent).toMatch(/From November's money.*11% of what you spent.*₹5,000/)
    expect(container.querySelector('[data-part="over"]')).toBeNull()
    expect(full.textContent).toMatch(/October's money was used up on (10 November|November 10)/)
    const paid = Array.from(full.querySelectorAll('[data-paid-for] li')).map((li) => li.textContent)
    expect(paid).toEqual(['Rent & Housing₹25,000', 'Food & Dining₹15,000'])
    await user.click(screen.getByRole('button', { name: 'Hide full view' }))
    expect(container.querySelector('[data-full-view]')).toBeNull()
  })

  it('shows what was more than everything you had in the full view', async () => {
    const user = userEvent.setup()
    const { container } = mount({ fromIncomeMinor: 3_000_00, notCoveredMinor: 2_000_00 })
    await user.click(screen.getByRole('button', { name: 'Full view' }))
    expect(part(container, 'over').textContent).toMatch(/More than you had.*₹2,000/)
  })

  it('lists the carry-forward month by month in the full view', async () => {
    const user = userEvent.setup()
    const { container } = mount()
    await user.click(screen.getByRole('button', { name: 'Full view' }))
    expect((container.querySelector('[data-step="2026-10"]') as HTMLElement).textContent).toBe('October₹80,000₹40,000₹40,000')
    // What came in counts what was left from the month before.
    expect((container.querySelector('[data-step="2026-11"]') as HTMLElement).textContent).toBe('November₹90,000₹45,000₹45,000')
  })

  it('says how much of last month\'s money is still there when it has not run out', async () => {
    const user = userEvent.setup()
    mount({ spentMinor: 5_000_00, fromCarriedMinor: 5_000_00, fromIncomeMinor: 0, carriedRanOutOn: null })
    await user.click(screen.getByRole('button', { name: 'Full view' }))
    expect(screen.getByText('October\'s money has not run out: ₹35,000 of it is still there to spend.')).toBeInTheDocument()
  })
})
