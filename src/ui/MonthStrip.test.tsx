// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MonthStrip } from './MonthStrip'

const months = [
  { key: '2025-12', totalMinor: 4_200_000 },
  { key: '2026-01', totalMinor: 0 },
  { key: '2026-02', totalMinor: 1_250_000 },
]
const mount = (over: Record<string, unknown> = {}) => {
  const onSelect = vi.fn()
  render(<MonthStrip months={months} selected="2026-02" currency="INR" onSelect={onSelect} {...over} />)
  return onSelect
}
const strip = () => screen.getByRole('group', { name: 'Choose the month to look at' })
const chips = () => within(strip()).getAllByRole('button')

describe('MonthStrip', () => {
  it('has one button for each month, oldest first, in a scrollable row', () => {
    mount()
    expect(chips()).toHaveLength(3)
    expect(chips().map((c) => c.textContent)).toEqual([expect.stringContaining('Dec'), expect.stringContaining('Jan'), expect.stringContaining('Feb')])
    expect(strip().className).toMatch(/overflow-x-auto/)
    expect(strip().className).toMatch(/snap-x/)
  })

  it('shows what each month came to, and says plainly when nothing was spent', () => {
    mount()
    expect(chips()[0]).toHaveTextContent('₹42K')
    expect(chips()[2]).toHaveTextContent('₹12.5K')
    expect(chips()[1]).toHaveTextContent('–')
  })

  it('tells a screen reader the full month and amount, and which one is chosen', () => {
    mount()
    expect(screen.getByRole('button', { name: /December 2025.*₹42,000/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /January 2026.*nothing spent/ })).toBeInTheDocument()
    expect(chips().map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true'])
  })

  it('names the year only where it differs from the one chosen, so the row stays short', () => {
    mount()
    expect(chips()[0]).toHaveTextContent(/Dec\s*25/)
    expect(chips()[2]).not.toHaveTextContent('26')
  })

  it('chooses a month when it is tapped, and not the one already chosen', () => {
    const onSelect = mount()
    fireEvent.click(chips()[0])
    expect(onSelect).toHaveBeenCalledWith('2025-12')
    fireEvent.click(chips()[2])
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('keeps every chip big enough to touch', () => {
    mount()
    for (const c of chips()) expect(c.className).toMatch(/min-h-11/)
  })

  it('draws nothing when there are no months', () => {
    render(<MonthStrip months={[]} selected="2026-02" currency="INR" onSelect={() => {}} />)
    expect(screen.queryByRole('group')).toBeNull()
  })
})
