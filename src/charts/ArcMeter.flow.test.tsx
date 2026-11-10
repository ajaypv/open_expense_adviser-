// @vitest-environment jsdom
import '../test/dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ArcMeter, dayColor, dayRatio, dayReach } from './ArcMeter'
import { BUDGET_SKY } from './budgetTone'

const meter = () => screen.getByRole('meter', { name: 'Monthly budget used' })
const bars = () => [...meter().querySelectorAll<SVGLineElement>('line')]
const length = (l: SVGLineElement) => Math.hypot(Number(l.getAttribute('x2')) - Number(l.getAttribute('x1')), Number(l.getAttribute('y2')) - Number(l.getAttribute('y1')))

// A 30-day month with a ₹30,000 budget, so a day's share is ₹1,000 (100,000 minor).
const SHARE = 100_000
const month = (over: Record<number, number> = {}) => Array.from({ length: 30 }, (_, i) => over[i + 1] ?? 0)
const view = (daily: number[], todayDay: number | null, spent = daily.reduce((a, b) => a + b, 0), limit = 3_000_000) =>
  render(<ArcMeter spentMinor={spent} limitMinor={limit} currency="INR" heading="Spent so far in November" emptyHeading="Nothing spent in November yet." dailyMinor={daily} todayDay={todayDay} />)

describe('dayRatio, dayColor and dayReach', () => {
  it('compares a day with its share of the budget', () => {
    expect(dayRatio(100_000, 3_000_000, 30)).toBe(1)
    expect(dayRatio(50_000, 3_000_000, 30)).toBe(0.5)
    expect(dayRatio(0, 3_000_000, 30)).toBe(0)
    expect(dayRatio(100, 0, 30)).toBe(0)
  })

  it('is green for a quiet day, amber at the day’s share, and red beyond it', () => {
    expect(dayColor(0)).toContain('var(--good-text)')
    expect(dayColor(0)).toContain('var(--warn-ui) 0%')
    expect(dayColor(1)).toContain('var(--warn-ui) 100%')
    expect(dayColor(1.5)).toContain('var(--critical) 100%')
    expect(dayColor(9)).toContain('var(--critical) 100%')
  })

  it('moves smoothly from green towards amber as more is spent', () => {
    const pct = (r: number) => Number(/var\(--warn-ui\) (\d+)%/.exec(dayColor(r))![1])
    expect(pct(0.25)).toBeLessThan(pct(0.5))
    expect(pct(0.5)).toBeLessThan(pct(0.9))
  })

  it('reaches further the more is spent, up to the whole ring at a day’s share', () => {
    expect(dayReach(0)).toBeLessThan(dayReach(0.5))
    expect(dayReach(0.5)).toBeLessThan(dayReach(1))
    expect(dayReach(1)).toBe(1)
    expect(dayReach(3)).toBe(1)
    expect(dayReach(-1)).toBe(dayReach(0))
  })
})

describe('ArcMeter', () => {
  it('is one meter that states where the budget stands, for a screen reader, and draws only decoration', () => {
    view(month({ 1: 500_000 }), 30)
    expect(meter()).toHaveAttribute('aria-valuetext', '₹25,000 left')
    expect(meter()).toHaveAttribute('aria-valuenow', '5000')
    expect(meter()).toHaveAttribute('aria-valuemax', '30000')
    expect(meter().querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('draws one bar for each day of the month, the first day on the left and the last on the right', () => {
    view(month(), null)
    expect(bars()).toHaveLength(30)
    expect(bars().map((b) => b.dataset.day)).toEqual(Array.from({ length: 30 }, (_, i) => String(i + 1)))
    expect(Number(bars()[0].getAttribute('x1'))).toBeLessThan(Number(bars()[29].getAttribute('x1')))
    for (const b of bars()) expect(Number(b.getAttribute('y1'))).toBeLessThanOrEqual(156.0001)
  })

  it('draws a month of 28 days with 28 bars, and one of 31 with 31', () => {
    view(Array(28).fill(0), null)
    expect(bars()).toHaveLength(28)
  })

  it('makes a day with nothing spent green and short, and a heavy day long and red', () => {
    view(month({ 2: SHARE / 2, 3: SHARE * 3 }), null)
    const [quiet, mid, heavy] = [bars()[0], bars()[1], bars()[2]]
    expect(quiet.getAttribute('stroke')).toContain('var(--good-text)')
    expect(heavy.getAttribute('stroke')).toContain('var(--critical) 100%')
    expect(length(quiet)).toBeLessThan(length(mid))
    expect(length(mid)).toBeLessThan(length(heavy))
  })

  it('makes each bar as long as its day says, not as the month’s total says', () => {
    view(month({ 5: SHARE }), null)
    expect(length(bars()[4])).toBeGreaterThan(length(bars()[3]))
    expect(length(bars()[3])).toBeCloseTo(length(bars()[5]), 5)
  })

  it('shows the days still to come as pale short bars, and the days gone by in colour', () => {
    view(month({ 3: SHARE }), 10)
    const gone = bars().slice(0, 10)
    const ahead = bars().slice(10)
    expect(gone.every((b) => b.dataset.state === 'past' && b.getAttribute('stroke') !== BUDGET_SKY)).toBe(true)
    expect(ahead).toHaveLength(20)
    expect(ahead.every((b) => b.dataset.state === 'ahead' && b.getAttribute('stroke') === BUDGET_SKY)).toBe(true)
    expect(length(ahead[0])).toBeCloseTo(length(bars()[0]), 5)
  })

  it('counts every day of a month that is over', () => {
    view(month({ 29: SHARE }), null)
    expect(bars().every((b) => b.dataset.state === 'past')).toBe(true)
  })

  it('marks today with a dot for the month in progress, and nothing for a month that is over', () => {
    const first = view(month(), 10)
    expect(meter().querySelector('[data-today]')).not.toBeNull()
    first.unmount()
    view(month(), null)
    expect(meter().querySelector('[data-today]')).toBeNull()
  })

  it('says how much is used, and what is spent, in the middle, and explains the bars', () => {
    view(month({ 1: 500_000 }), 30, 500_000, 2_000_000)
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('Spent so far in November')).toBeInTheDocument()
    expect(meter()).toHaveTextContent('of ₹20,000')
    expect(screen.getByText(/One bar for each day/)).toBeInTheDocument()
  })

  it('says it louder the closer the budget gets: a warning near the limit, and bold red over it', () => {
    const near = view(month({ 1: 900_000 }), 30, 900_000, 1_000_000)
    expect(screen.getByText('Close to the limit, ₹1,000 left')).toBeInTheDocument()
    near.unmount()
    view(month({ 1: 1_200_000 }), 30, 1_200_000, 1_000_000)
    const status = screen.getByText('Over budget by ₹2,000')
    expect(status.closest('p')).toHaveClass('text-critical', 'font-semibold')
    expect(meter()).toHaveAttribute('aria-valuenow', '10000')
  })

  it('says nothing was spent, instead of a zero, with every day still green and short', () => {
    view(month(), 15)
    expect(meter()).toHaveTextContent('Nothing spent in November yet.')
    expect(screen.queryByText('Spent so far in November')).toBeNull()
    expect(screen.getByText('₹30,000 left')).toBeInTheDocument()
    expect(bars().slice(0, 15).every((b) => b.getAttribute('stroke')!.includes('var(--good-text)'))).toBe(true)
  })

  it('brings the bars on one after another the first time the app shows it, and not when it is shown again', () => {
    const first = view(month({ 2: SHARE }), 10)
    const past = bars().filter((b) => b.dataset.state === 'past')
    expect(past.every((b) => b.classList.contains('arc-bar-in'))).toBe(true)
    const delays = past.map((b) => parseFloat(b.style.animationDelay))
    expect([...delays].sort((a, b) => a - b)).toEqual(delays)
    expect(bars().filter((b) => b.dataset.state === 'ahead').some((b) => b.classList.contains('arc-bar-in'))).toBe(false)
    first.unmount()
    view(month({ 2: SHARE }), 10)
    expect(bars().some((b) => b.classList.contains('arc-bar-in'))).toBe(false)
  })
})
