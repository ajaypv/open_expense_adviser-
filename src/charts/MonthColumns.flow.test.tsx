// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MonthTotal } from '../insights/trends'
import { MonthColumns } from './MonthColumns'

const rupees = (n: number) => n * 100
/** Twelve months, November 2025 to October 2026, each `amounts[i]` rupees, oldest first. */
const months = (amounts: number[]): MonthTotal[] =>
  amounts.map((a, i) => {
    const d = new Date(2025, 10 + i, 1)
    return { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, totalMinor: rupees(a) }
  })

const base = [4000, 5000, 3000, 6000, 2500, 4500, 5200, 4800, 3900, 4100, 5000, 5600]
const mount = (amounts = base) => render(<MonthColumns totals={months(amounts)} currency="INR" />)
const plot = () => screen.getByRole('group', { name: /Spending in each of the last months/ })
const bars = () => within(plot()).getAllByRole('button')

describe('MonthColumns: the month in view, as a big number', () => {
  it('starts on the latest month, with its total large and the month named', () => {
    mount()
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(screen.getByTestId('month-total')).toHaveTextContent('₹5,600')
  })

  it('says how it compares with the month before, in words as well as an arrow and a colour', () => {
    mount()
    const pill = screen.getByTestId('month-change')
    expect(pill).toHaveTextContent('12%') // 5,600 against 5,000
    expect(pill.textContent).toContain('▲')
    expect(pill).toHaveAttribute('aria-label', 'Up 12% on September')
    expect(screen.getByText('vs ₹5,000 in September')).toBeInTheDocument()
  })

  it('shows a fall as a fall', () => {
    mount([...base.slice(0, 10), 5000, 4000])
    const pill = screen.getByTestId('month-change')
    expect(pill).toHaveTextContent('20%')
    expect(pill.textContent).toContain('▼')
    expect(pill).toHaveAttribute('aria-label', 'Down 20% on September')
  })

  it('says "No change" when it is level', () => {
    mount([...base.slice(0, 10), 5000, 5000])
    expect(screen.getByTestId('month-change')).toHaveTextContent('No change')
  })

  it('has no percentage against a month with nothing in it, and says why', () => {
    mount([...base.slice(0, 10), 0, 4000])
    expect(screen.queryByTestId('month-change')).toBeNull()
    expect(screen.getByText('Nothing was spent in September')).toBeInTheDocument()
  })

  it('has no comparison for the first month shown', () => {
    mount()
    fireEvent.click(bars()[0])
    expect(screen.queryByTestId('month-change')).toBeNull()
    expect(screen.getByTestId('month-total')).toHaveTextContent('₹4,000')
  })

  it('still says what a month averages', () => {
    mount()
    expect(screen.getByText(/a month on average/)).toBeInTheDocument()
  })
})

describe('MonthColumns: choosing a month', () => {
  it('has a bar for every month, each readable by a screen reader and chosen by a tap', () => {
    mount()
    expect(bars()).toHaveLength(12)
    expect(bars()[3]).toHaveAttribute('aria-label', 'February 2026, ₹6,000')
    fireEvent.click(bars()[3])
    expect(screen.getByText('February 2026')).toBeInTheDocument()
    expect(screen.getByTestId('month-total')).toHaveTextContent('₹6,000')
  })

  it('keeps the chosen month until another is chosen', () => {
    mount()
    fireEvent.click(bars()[3])
    fireEvent.pointerLeave(plot(), { pointerType: 'mouse' })
    expect(screen.getByTestId('month-total')).toHaveTextContent('₹6,000')
  })

  it('marks the chosen bar, and only that one, with the change above it', () => {
    mount()
    const chosen = bars().filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(chosen).toHaveLength(1)
    expect(chosen[0]).toBe(bars()[11])
    expect(within(chosen[0]).getByTestId('bar-badge')).toHaveTextContent('12%')
    expect(screen.getAllByTestId('bar-badge')).toHaveLength(1)
  })

  it('draws the others as hatched pills and the chosen one solid', () => {
    mount()
    expect(bars()[0].querySelector('.pill-bar')).not.toHaveClass('pill-bar-selected')
    expect(bars()[11].querySelector('.pill-bar')).toHaveClass('pill-bar-selected')
  })

  it('moves along the months with the arrow keys', () => {
    mount()
    fireEvent.keyDown(plot(), { key: 'ArrowLeft' })
    expect(screen.getByText('September 2026')).toBeInTheDocument()
    fireEvent.keyDown(plot(), { key: 'ArrowLeft' })
    expect(screen.getByText('August 2026')).toBeInTheDocument()
    fireEvent.keyDown(plot(), { key: 'ArrowRight' })
    expect(screen.getByText('September 2026')).toBeInTheDocument()
  })

  it('stops at both ends', () => {
    mount()
    for (let i = 0; i < 20; i++) fireEvent.keyDown(plot(), { key: 'ArrowRight' })
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    for (let i = 0; i < 20; i++) fireEvent.keyDown(plot(), { key: 'ArrowLeft' })
    expect(screen.getByText('November 2025')).toBeInTheDocument()
  })

  it('lets a mouse look at a month without choosing it', () => {
    mount()
    fireEvent.pointerEnter(bars()[3], { pointerType: 'mouse' })
    expect(screen.getByTestId('month-total')).toHaveTextContent('₹6,000')
    fireEvent.pointerLeave(plot(), { pointerType: 'mouse' })
    expect(screen.getByTestId('month-total')).toHaveTextContent('₹5,600')
  })
})

describe('MonthColumns: the axis and the labels', () => {
  it('labels every month under its bar', () => {
    mount()
    const labels = screen.getByTestId('month-labels')
    expect(within(labels).getAllByText(/^[A-Z][a-z]{2}$/)).toHaveLength(12)
  })

  it('has a scale up the side that rounds up to a tidy top', () => {
    mount()
    const axis = screen.getByTestId('month-axis')
    expect(axis).toHaveTextContent('₹0')
    expect(axis).toHaveTextContent('₹6K') // the tallest month is exactly ₹6,000
    expect(axis).toHaveTextContent('₹3K')
  })

  it('draws a quiet month as a thin flat bar, not nothing', () => {
    mount([...base.slice(0, 5), 0, ...base.slice(6)])
    const quiet = bars()[5].querySelector<HTMLElement>('.pill-bar')!
    expect(quiet.style.height).toBe('3px')
  })

  it('keeps the table of the figures for anyone who wants to read them', () => {
    mount()
    expect(screen.getByText('Show as table')).toBeInTheDocument()
  })

  it('never prints a broken number, even when nothing was spent', () => {
    const { container } = mount(Array(12).fill(0))
    expect(container.textContent).not.toMatch(/NaN|undefined|Infinity/)
  })
})
