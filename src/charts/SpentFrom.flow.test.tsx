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
    <SpentFrom breakdown={{ ...breakdown, ...over }} categoryById={cats} currency="INR" monthName="November" prevName="October" labelOf={(m) => labels[m]} inProgress={inProgress} />,
  )
const part = (c: HTMLElement, key: string) => c.querySelector(`[data-part="${key}"]`) as HTMLElement

describe('SpentFrom', () => {
  it('opens on how much of the month was paid from last month\'s money and how much from this month\'s', () => {
    const { container } = mount()
    expect(screen.getByText('₹40,000 of the ₹45,000 came from October\'s money.')).toBeInTheDocument()
    expect(part(container, 'earlier').textContent).toMatch(/From October's money.*89% of what you spent.*₹40,000/)
    expect(part(container, 'income').textContent).toMatch(/From November's money.*11% of what you spent.*₹5,000/)
    expect(container.querySelector('[data-part="over"]')).toBeNull()
    expect(container.querySelector('[data-full-view]')).toBeNull()
  })

  it('says "so far" while the month is open', () => {
    mount({}, true)
    expect(screen.getByText('₹40,000 of the ₹45,000 came from October\'s money so far.')).toBeInTheDocument()
  })

  it('says everything came from this month when nothing was left over', () => {
    const { container } = mount({ carriedInMinor: 0, fromCarriedMinor: 0, fromIncomeMinor: 45_000_00, carriedRanOutOn: null, fromCarriedByCategory: [] })
    expect(screen.getByText('All ₹45,000 came from November\'s money.')).toBeInTheDocument()
    expect(part(container, 'earlier').textContent).toContain('Nothing was left from October')
  })

  it('shows what was more than everything you had', () => {
    const { container } = mount({ fromIncomeMinor: 3_000_00, notCoveredMinor: 2_000_00 })
    expect(part(container, 'over').textContent).toMatch(/More than you had.*₹2,000/)
  })

  it('opens the full view on a tap and closes it again', async () => {
    const user = userEvent.setup()
    const { container } = mount()
    const button = screen.getByRole('button', { name: 'Full view' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    expect(screen.getByRole('button', { name: 'Hide full view' })).toHaveAttribute('aria-expanded', 'true')
    const full = container.querySelector('[data-full-view]') as HTMLElement
    expect(full.querySelector('[data-line="left"]')?.textContent).toMatch(/Left from October.*₹40,000/)
    expect(full.querySelector('[data-line="used"]')?.textContent).toMatch(/Spent in November.*₹40,000/)
    expect(full.querySelector('[data-line="still"]')?.textContent).toMatch(/Used up.*₹0/)
    expect(full.textContent).toMatch(/October's money was used up on 10 November|October's money was used up on November 10/)
    const paid = Array.from(full.querySelectorAll('[data-paid-for] li')).map((li) => li.textContent)
    expect(paid).toEqual(['Rent & Housing₹25,000', 'Food & Dining₹15,000'])
    await user.click(screen.getByRole('button', { name: 'Hide full view' }))
    expect(container.querySelector('[data-full-view]')).toBeNull()
  })

  it('lists the carry-forward month by month', async () => {
    const user = userEvent.setup()
    const { container } = mount()
    await user.click(screen.getByRole('button', { name: 'Full view' }))
    const oct = container.querySelector('[data-step="2026-10"]') as HTMLElement
    const nov = container.querySelector('[data-step="2026-11"]') as HTMLElement
    expect(oct.textContent).toBe('October₹80,000₹40,000₹40,000')
    // What came in counts what was left from the month before.
    expect(nov.textContent).toBe('November₹90,000₹45,000₹45,000')
  })

  it('says how much of last month\'s money is still there when it has not run out', async () => {
    const user = userEvent.setup()
    const { container } = mount({ spentMinor: 5_000_00, fromCarriedMinor: 5_000_00, fromIncomeMinor: 0, carriedRanOutOn: null })
    await user.click(screen.getByRole('button', { name: 'Full view' }))
    expect(container.querySelector('[data-line="still"]')?.textContent).toMatch(/Still there.*₹35,000/)
    expect(screen.getByText('October\'s money has not run out: ₹35,000 of it is still there to spend.')).toBeInTheDocument()
  })
})
