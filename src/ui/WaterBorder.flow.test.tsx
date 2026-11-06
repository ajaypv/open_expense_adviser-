// @vitest-environment jsdom
import '../test/dom'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Meter } from '../charts/Meter'
import { SpendingOverview } from './SpendingOverview'
import { CARD_RADIUS, roundedRect, WaterBorder } from './Water'

describe('roundedRect', () => {
  it('goes clockwise from the top left corner, round all four corners, and closes', () => {
    expect(roundedRect(100, 60, 10)).toBe('M10 0H90A10 10 0 0 1 100 10V50A10 10 0 0 1 90 60H10A10 10 0 0 1 0 50V10A10 10 0 0 1 10 0Z')
  })

  it('never has corners bigger than half the shorter side', () => {
    expect(roundedRect(100, 20, 50)).toContain('A10 10 0 0 1')
    expect(roundedRect(100, 20, -5)).toContain('A0 0 0 0 1')
  })
})

const border = () => document.querySelector('[data-water-border]') as SVGElement
/** The visible line of the gauge: the one that is not inside the mask and not the track. */
const gauge = () => [...border().querySelectorAll('path.water-border-fill')].find((r) => !r.closest('mask')) as SVGPathElement

describe('WaterBorder', () => {
  it('draws a line as far round the card as the share of the budget spent', () => {
    const dashOf = (ratio: number) => {
      const view = render(<WaterBorder ratio={ratio} />)
      const dash = gauge().getAttribute('stroke-dasharray')
      view.unmount()
      return dash
    }
    expect(dashOf(0.25)).toBe('0.25 1')
    expect(dashOf(0.5)).toBe('0.5 1')
    expect(dashOf(0.9)).toBe('0.9 1')
  })

  it('goes right round, and no further, once the budget is passed, and shows a little even for almost nothing', () => {
    const view = render(<WaterBorder ratio={1.6} />)
    expect(gauge().getAttribute('stroke-dasharray')).toBe('1 1')
    view.unmount()
    render(<WaterBorder ratio={0} />)
    expect(gauge().getAttribute('stroke-dasharray')).toBe('0.03 1')
  })

  it('is the colour of the state: blue, amber near the limit, red when over', () => {
    const colorAt = (ratio: number) => {
      const view = render(<WaterBorder ratio={ratio} />)
      const color = gauge().getAttribute('stroke')
      view.unmount()
      return color
    }
    expect(colorAt(0.3)).toBe('var(--accent)')
    expect(colorAt(0.85)).toBe('var(--warn-ui)')
    expect(colorAt(1.2)).toBe('var(--critical)')
  })

  it('has a faint track all the way round under the line', () => {
    render(<WaterBorder ratio={0.3} />)
    const track = [...border().querySelectorAll('path')].find((r) => !r.getAttribute('stroke-dasharray') && !r.closest('g') && !r.closest('mask'))!
    expect(track.getAttribute('stroke')).toContain('var(--accent)')
    expect(track.getAttribute('pathLength')).toBe('1')
  })

  it('runs ripples along the filled part only, one set each way', () => {
    render(<WaterBorder ratio={0.4} />)
    const ripples = border().querySelector('g[mask]') as SVGGElement
    expect(ripples.querySelector('.water-border-flow')).toBeInTheDocument()
    expect(ripples.querySelector('.water-border-flow-back')).toBeInTheDocument()
    // What shows through is cut out by the same share as the line.
    const id = ripples.getAttribute('mask')!.match(/url\(#(.+)\)/)![1]
    const mask = border().querySelector(`mask[id="${id}"]`)!
    expect(mask.querySelector('path')!.getAttribute('stroke-dasharray')).toBe('0.4 1')
  })

  it('follows the corners of the card it goes round', () => {
    render(<WaterBorder ratio={0.4} />)
    // The corners are arcs of the card's radius, less half the line, which is drawn inside the edge.
    expect(gauge().getAttribute('d')).toContain(`A${CARD_RADIUS - 1.5} ${CARD_RADIUS - 1.5} 0 0 1`)
    expect(border().className.baseVal).toContain('pointer-events-none')
    expect(border().getAttribute('aria-hidden')).toBe('true')
  })

  it('says its level in a data attribute, and marks the state of being over', () => {
    const view = render(<WaterBorder ratio={0.456} />)
    expect(border().getAttribute('data-level')).toBe('46')
    expect(border().hasAttribute('data-over')).toBe(false)
    view.unmount()
    render(<WaterBorder ratio={1.2} />)
    expect(border().hasAttribute('data-over')).toBe(true)
  })

  it('fills from nothing the first time the app shows it, and not when it is shown again', () => {
    const first = render(<WaterBorder ratio={0.5} />)
    expect(gauge()).toHaveAttribute('data-rise')
    first.unmount()
    render(<WaterBorder ratio={0.5} />)
    expect(gauge()).not.toHaveAttribute('data-rise')
  })

  it('moves the same line to a new share when the spending changes', () => {
    const view = render(<WaterBorder ratio={0.2} />)
    const before = gauge()
    view.rerender(<WaterBorder ratio={0.6} />)
    expect(gauge()).toBe(before)
    expect(gauge().getAttribute('stroke-dasharray')).toBe('0.6 1')
  })

  it('stills the water, and the fill, for reduced motion', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const block = css.slice(css.indexOf('@keyframes border-fill'))
    const reduced = block.slice(block.indexOf('@media (prefers-reduced-motion: reduce)'))
    for (const name of ['.water-border-flow', '.water-border-flow-back', '.water-border-fill[data-rise]', '.water-wave-front', '.water-slosh']) expect(reduced.slice(0, 600)).toContain(name)
    expect(reduced.slice(0, 700)).toMatch(/\.water-border-fill\s*\{\s*transition: none/)
  })
})

describe('Meter without a bar', () => {
  it('keeps the words and the meter for a screen reader, and draws no bar', () => {
    render(<Meter spentMinor={500_000} limitMinor={2_000_000} currency="INR" variant="text" />)
    const meter = screen.getByRole('meter', { name: 'Monthly budget used' })
    expect(meter).toHaveAttribute('aria-valuetext', '₹15,000 left')
    expect(meter).toHaveAttribute('aria-valuenow', '5000')
    expect(meter).toHaveClass('sr-only')
    expect(meter.firstElementChild).toBeNull()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('₹15,000 left')).toBeInTheDocument()
  })

  it('is still a bar by default, for the category budgets', () => {
    render(<Meter spentMinor={500_000} limitMinor={2_000_000} currency="INR" />)
    expect((screen.getByRole('meter').firstElementChild as HTMLElement).style.width).toBe('25%')
  })
})

describe('The Overview card', () => {
  const props = {
    monthName: 'October', isCurrent: true, totalMinor: 68_000, deltaPct: null, partial: false, prevName: 'September',
    dailyAverageMinor: 2_400, expenseCount: 2, budgetMinor: null as number | null, currency: 'INR', periods: [], privacy: false,
    onTogglePrivacy: () => {}, onPickPeriod: () => {},
  }

  it('has the budget as water on its own border, and no tank or bar under the amounts', () => {
    render(<SpendingOverview {...props} budgetMinor={200_000} />)
    const card = screen.getByRole('region', { name: 'Summary' })
    expect(card.contains(border())).toBe(true)
    expect(border().getAttribute('data-level')).toBe('34')
    expect(card.querySelector('[data-water]')).toBeNull()
    expect(screen.getByRole('meter').firstElementChild).toBeNull()
    expect(screen.getByText('₹1,320 left')).toBeInTheDocument()
  })

  it('has the corners the line follows, set in pixels so they match at any text size', () => {
    render(<SpendingOverview {...props} budgetMinor={200_000} />)
    expect(screen.getByRole('region', { name: 'Summary' }).className).toContain(`rounded-[${CARD_RADIUS}px]`)
  })

  it('has no border gauge, and no meter, when there is no budget', () => {
    render(<SpendingOverview {...props} />)
    expect(document.querySelector('[data-water-border]')).toBeNull()
    expect(screen.queryByRole('meter')).toBeNull()
  })

  it('shows the line all the way round, red, when the month is over the budget', () => {
    render(<SpendingOverview {...props} budgetMinor={50_000} />)
    expect(border().hasAttribute('data-over')).toBe(true)
    expect(gauge().getAttribute('stroke-dasharray')).toBe('1 1')
    expect(gauge().getAttribute('stroke')).toBe('var(--critical)')
  })
})

