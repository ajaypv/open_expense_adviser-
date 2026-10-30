// @vitest-environment jsdom
import '../test/dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Meter } from './Meter'

const fill = () => screen.getByRole('meter', { name: 'Monthly budget used' }).firstElementChild as HTMLElement

describe('Meter', () => {
  it('states where the budget stands and sizes the bar to match', () => {
    render(<Meter spentMinor={500_000} limitMinor={2_000_000} currency="INR" />)
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', '₹15,000 left')
    expect(fill().style.width).toBe('25%')
  })

  it('wipes the bar in the first time the app shows it, and not when it is shown again', () => {
    const first = render(<Meter spentMinor={500_000} limitMinor={2_000_000} currency="INR" />)
    expect(fill()).toHaveClass('bar-reveal')
    first.unmount()
    render(<Meter spentMinor={500_000} limitMinor={2_000_000} currency="INR" />)
    expect(fill()).not.toHaveClass('bar-reveal')
  })

  it('says it louder the closer it gets: grey while fine, firm near the limit, red and bold when over', () => {
    const status = (spent: number) => {
      const view = render(<Meter spentMinor={spent} limitMinor={1_000_000} currency="INR" />)
      const text = view.container.firstElementChild!.lastElementChild! // the status line, last in the meter
      view.unmount()
      return text.className
    }
    expect(status(200_000)).toContain('text-ink-2')
    expect(status(900_000)).toMatch(/font-medium text-ink(?!-)/)
    expect(status(1_200_000)).toContain('text-critical')
    expect(status(1_200_000)).toContain('font-semibold')
  })

  it('keeps its real width while it wipes in, so nothing depends on the animation', () => {
    render(<Meter spentMinor={500_000} limitMinor={2_000_000} currency="INR" />)
    expect(fill()).toHaveClass('bar-reveal')
    expect(fill().style.width).toBe('25%')
  })
})
