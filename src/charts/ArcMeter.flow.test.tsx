// @vitest-environment jsdom
import '../test/dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ARC_BARS, ArcMeter, litBars } from './ArcMeter'

const meter = () => screen.getByRole('meter', { name: 'Monthly budget used' })
const lines = () => [...meter().querySelectorAll('line')]
const view = (spent: number, limit = 1_000_000) =>
  render(<ArcMeter spentMinor={spent} limitMinor={limit} currency="INR" heading="Spent so far in November" emptyHeading="Nothing spent in November yet." />)

describe('litBars', () => {
  it('lights bars in proportion to what is used', () => {
    expect(litBars(500_000, 1_000_000)).toBe(Math.round(ARC_BARS / 2))
    expect(litBars(250_000, 1_000_000)).toBe(Math.round(ARC_BARS / 4))
  })

  it('lights none when nothing is spent, and at least one as soon as anything is', () => {
    expect(litBars(0, 1_000_000)).toBe(0)
    expect(litBars(1, 1_000_000)).toBe(1)
  })

  it('lights all of them at the limit and beyond it, never more', () => {
    expect(litBars(1_000_000, 1_000_000)).toBe(ARC_BARS)
    expect(litBars(5_000_000, 1_000_000)).toBe(ARC_BARS)
  })

  it('lights none for a limit that is not there', () => {
    expect(litBars(100, 0)).toBe(0)
  })
})

describe('ArcMeter', () => {
  it('is one meter that states where the budget stands, for a screen reader, and draws only decoration', () => {
    view(500_000, 2_000_000)
    expect(meter()).toHaveAttribute('aria-valuetext', '₹15,000 left')
    expect(meter()).toHaveAttribute('aria-valuenow', '5000')
    expect(meter()).toHaveAttribute('aria-valuemax', '20000')
    expect(meter().querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('draws the half circle of bars, with as many lit as the budget used says', () => {
    view(500_000, 2_000_000)
    expect(lines()).toHaveLength(ARC_BARS)
    expect(meter()).toHaveAttribute('data-lit', String(litBars(500_000, 2_000_000)))
    const lit = lines().filter((l) => l.getAttribute('stroke') === 'var(--accent)')
    expect(lit).toHaveLength(litBars(500_000, 2_000_000))
  })

  it('lights the bars from the left end and keeps them above the base line', () => {
    view(500_000, 2_000_000)
    const bars = lines()
    expect(Number(bars[0].getAttribute('x1'))).toBeLessThan(Number(bars[ARC_BARS - 1].getAttribute('x1')))
    for (const l of bars) {
      expect(Number(l.getAttribute('y1'))).toBeLessThanOrEqual(154.0001)
      expect(Number(l.getAttribute('y2'))).toBeLessThanOrEqual(154.0001)
    }
    const lit = lines().filter((l) => l.getAttribute('stroke') === 'var(--accent)')
    expect(lines().slice(0, lit.length)).toEqual(lit)
  })

  it('says how much is used, and what is spent, in the middle', () => {
    view(500_000, 2_000_000)
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(meter()).toHaveTextContent('Spent so far in November')
    expect(screen.getByText(/of ₹20,000/)).toBeInTheDocument()
  })

  it('turns amber near the limit, with the words and a warning to go with it', () => {
    view(900_000)
    expect(lines().some((l) => l.getAttribute('stroke') === 'var(--warn-ui)')).toBe(true)
    expect(screen.getByText('Close to the limit, ₹1,000 left')).toBeInTheDocument()
  })

  it('turns red and says so in bold once over the limit, with every bar lit', () => {
    view(1_200_000)
    expect(lines().every((l) => l.getAttribute('stroke') === 'var(--critical)')).toBe(true)
    const status = screen.getByText('Over budget by ₹2,000')
    expect(status.closest('p')).toHaveClass('text-critical', 'font-semibold')
    expect(meter()).toHaveAttribute('aria-valuenow', '10000')
  })

  it('says nothing was spent, instead of a zero, and lights nothing', () => {
    view(0)
    expect(meter()).toHaveTextContent('Nothing spent in November yet.')
    expect(meter()).not.toHaveTextContent('Spent so far')
    expect(lines().some((l) => l.getAttribute('stroke') !== 'color-mix(in oklab, var(--accent) 16%, var(--surface))')).toBe(false)
    expect(screen.getByText('₹10,000 left')).toBeInTheDocument()
  })

  it('lights the bars on one after another the first time the app shows it, and not when it is shown again', () => {
    const first = view(500_000, 2_000_000)
    const lit = lines().filter((l) => l.getAttribute('stroke') === 'var(--accent)')
    expect(lit.every((l) => l.classList.contains('arc-bar-in'))).toBe(true)
    const delays = lit.map((l) => parseFloat((l as SVGElement).style.animationDelay))
    expect([...delays].sort((a, b) => a - b)).toEqual(delays)
    first.unmount()
    view(500_000, 2_000_000)
    expect(lines().some((l) => l.classList.contains('arc-bar-in'))).toBe(false)
  })
})
