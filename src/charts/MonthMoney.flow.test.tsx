// @vitest-environment jsdom
import '../test/dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MonthBreakdown } from '../insights/trends'
import { MonthMoney } from './MonthMoney'

const base: MonthBreakdown = {
  carriedInMinor: 0, receivedMinor: 0, spentMinor: 0, fromCarriedMinor: 0, fromIncomeMinor: 0, notCoveredMinor: 0,
  carriedOutMinor: 0, carriedRanOutOn: null, fromCarriedByCategory: [], steps: [],
}
const mount = (over: Partial<MonthBreakdown>, extra: Partial<Parameters<typeof MonthMoney>[0]> = {}) =>
  render(<MonthMoney breakdown={{ ...base, ...over }} month="2026-11" prevName="October" currency="INR" inProgress canPrev canNext onShift={() => {}} {...extra} />)
const row = (c: HTMLElement, key: string) => c.querySelector(`[data-row="${key}"]`) as HTMLElement
const widths = (c: HTMLElement) => Array.from(c.querySelectorAll('[data-segment]')).map((s) => [s.getAttribute('data-segment'), (s as HTMLElement).style.width])

describe('MonthMoney', () => {
  it('shows carried forward, received and spent, and what is left so far, with a bar of spent against left', () => {
    const { container } = mount({ carriedInMinor: 6_000_00, receivedMinor: 2_000_00, spentMinor: 2_000_00, fromCarriedMinor: 2_000_00 })
    expect(screen.getByText('Left so far')).toBeInTheDocument()
    expect(screen.getByText('₹6,000', { selector: 'p' })).toBeInTheDocument()
    expect(row(container, 'carried').textContent).toMatch(/Carried from October.*₹6,000/)
    expect(row(container, 'received').textContent).toMatch(/Received in November.*₹2,000/)
    expect(row(container, 'spent').textContent).toMatch(/Spent in November.*₹2,000/)
    expect(widths(container)).toEqual([['spent', '25%'], ['left', '75%']])
    expect(container.querySelector('[data-from-earlier]')?.textContent).toBe("₹2,000 of what you spent came from October's money.")
  })

  it('says what is left at the end of a finished month and that it carries on', () => {
    mount({ receivedMinor: 5_000_00, spentMinor: 3_000_00, carriedOutMinor: 2_000_00 }, { inProgress: false })
    expect(screen.getByText('Left at the end of the month')).toBeInTheDocument()
    expect(screen.getByText('₹2,000 carries on to next month.')).toBeInTheDocument()
  })

  it('shows how far over when more was spent than there was, in red', () => {
    const { container } = mount({ carriedInMinor: 1_000_00, receivedMinor: 1_000_00, spentMinor: 3_000_00 })
    expect(screen.getByText('Over by so far')).toBeInTheDocument()
    expect(screen.getByText('₹1,000', { selector: 'p' })).toHaveClass('text-critical')
    expect(widths(container).map(([k]) => k)).toEqual(['covered', 'over'])
  })

  it('has no carried row when nothing was left over, and says so when the month is empty', () => {
    const { container } = mount({ receivedMinor: 1_000_00, spentMinor: 500_00 })
    expect(container.querySelector('[data-row="carried"]')).toBeNull()
    expect(container.querySelector('[data-from-earlier]')).toBeNull()
  })

  it('says nothing happened in an empty month', () => {
    mount({})
    expect(screen.getByText('Nothing came in or went out in November.')).toBeInTheDocument()
  })

  it('steps between months, and disables the ends', async () => {
    const onShift = vi.fn()
    const user = userEvent.setup()
    const { rerender } = mount({}, { onShift })
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(onShift.mock.calls).toEqual([[-1], [1]])
    rerender(<MonthMoney breakdown={base} month="2026-11" prevName="October" currency="INR" inProgress canPrev={false} canNext={false} onShift={onShift} />)
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
  })
})
