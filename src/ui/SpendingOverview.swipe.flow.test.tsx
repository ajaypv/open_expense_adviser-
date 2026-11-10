// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SpendingOverview } from './SpendingOverview'

const base = {
  monthName: 'November',
  monthKey: '2026-11',
  isCurrent: true,
  totalMinor: 279_400,
  deltaPct: null as number | null,
  partial: false,
  prevName: 'October',
  dailyAverageMinor: 279_400,
  expenseCount: 7,
  dailyMinor: Array.from({ length: 30 }, () => 0),
  todayDay: 10 as number | null,
  budgetMinor: null as number | null,
  currency: 'INR',
  periods: [] as never[],
  privacy: false,
  onTogglePrivacy: () => {},
  onPickPeriod: () => {},
}

function pointer(type: string, x: number, y: number) {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
  Object.defineProperty(e, 'pointerType', { value: 'touch' })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  return e
}
const swipe = (el: Element, dx: number) => {
  fireEvent(el, pointer('pointerdown', 0, 0))
  fireEvent(el, pointer('pointermove', dx / 2, 2))
  fireEvent(el, pointer('pointermove', dx, 3))
  fireEvent(el, pointer('pointerup', dx, 3))
}
const card = () => screen.getByRole('region', { name: 'Summary' })

describe('SpendingOverview: swiping between months', () => {
  it('goes to the previous month on a swipe to the right', () => {
    const onPrevMonth = vi.fn()
    const onNextMonth = vi.fn()
    render(<SpendingOverview {...base} onPrevMonth={onPrevMonth} onNextMonth={onNextMonth} />)
    swipe(card(), 100)
    expect(onPrevMonth).toHaveBeenCalledOnce()
    expect(onNextMonth).not.toHaveBeenCalled()
  })

  it('goes to the next month on a swipe to the left', () => {
    const onPrevMonth = vi.fn()
    const onNextMonth = vi.fn()
    render(<SpendingOverview {...base} isCurrent={false} onPrevMonth={onPrevMonth} onNextMonth={onNextMonth} />)
    swipe(card(), -100)
    expect(onNextMonth).toHaveBeenCalledOnce()
    expect(onPrevMonth).not.toHaveBeenCalled()
  })

  it('does nothing on a swipe left in the month in progress, since there is no next month', () => {
    const onPrevMonth = vi.fn()
    render(<SpendingOverview {...base} onPrevMonth={onPrevMonth} />)
    swipe(card(), -100)
    expect(onPrevMonth).not.toHaveBeenCalled()
  })

  it('does not change month for a tap, or for a small movement on a button', () => {
    const onPrevMonth = vi.fn()
    const onNextMonth = vi.fn()
    render(<SpendingOverview {...base} onPrevMonth={onPrevMonth} onNextMonth={onNextMonth} />)
    swipe(screen.getByRole('button', { name: 'Hide amounts' }), 12)
    expect(onPrevMonth).not.toHaveBeenCalled()
    expect(onNextMonth).not.toHaveBeenCalled()
  })

  it('works when the swipe starts on the figures, not only on the empty parts of the card', () => {
    const onPrevMonth = vi.fn()
    render(<SpendingOverview {...base} onPrevMonth={onPrevMonth} />)
    swipe(screen.getByText('Daily average'), 100)
    expect(onPrevMonth).toHaveBeenCalledOnce()
  })

  it('still lets the page scroll up and down from the card', () => {
    render(<SpendingOverview {...base} onPrevMonth={() => {}} />)
    expect(card()).toHaveClass('touch-pan-y')
  })

  it('is fine to use without a way to change month, as in the tests that only look at the card', () => {
    render(<SpendingOverview {...base} />)
    expect(() => swipe(card(), 100)).not.toThrow()
  })
})

describe('SpendingOverview: the slide that goes with a swipe', () => {
  const content = () => screen.getByText('Spent so far in November').closest('[data-month]') as HTMLElement

  it('does not slide when it first appears', () => {
    render(<SpendingOverview {...base} />)
    expect(content().className).not.toMatch(/month-slide/)
  })

  it('slides in from the right when the month moves on, and from the left when it moves back', () => {
    const { rerender } = render(<SpendingOverview {...base} />)
    rerender(<SpendingOverview {...base} monthKey="2026-12" monthName="December" isCurrent={false} />)
    expect(screen.getByText('Spent in December').closest('[data-month]')!.className).toContain('month-slide-from-right')
    rerender(<SpendingOverview {...base} monthKey="2026-10" monthName="October" isCurrent={false} />)
    expect(screen.getByText('Spent in October').closest('[data-month]')!.className).toContain('month-slide-from-left')
  })

  it('does not slide again for a redraw within the same month', () => {
    const { rerender } = render(<SpendingOverview {...base} />)
    rerender(<SpendingOverview {...base} monthKey="2026-12" monthName="December" isCurrent={false} />)
    rerender(<SpendingOverview {...base} monthKey="2026-12" monthName="December" isCurrent={false} totalMinor={500_000} />)
    expect(screen.getByText('Spent in December').closest('[data-month]')!.className).toContain('month-slide-from-right')
    // the same key, so the same element keeps its class and does not restart
    expect(screen.getByText('Spent in December').closest('[data-month]')).toHaveAttribute('data-month', '2026-12')
  })
})
