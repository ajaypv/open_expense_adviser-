// @vitest-environment jsdom
import '../test/dom'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WaterTank } from '../ui/Water'
import { Meter } from './Meter'

const meter = () => screen.getByRole('meter', { name: 'Monthly budget used' })
const water = () => meter().querySelector('[data-water]') as HTMLElement
const level = () => water().querySelector('.water-level') as HTMLElement

describe('Meter as a tank of water', () => {
  it('keeps what the meter says, and draws a tank in place of the bar', () => {
    render(<Meter spentMinor={500_000} limitMinor={2_000_000} currency="INR" variant="water" />)
    expect(meter()).toHaveAttribute('aria-valuetext', '₹15,000 left')
    expect(meter()).toHaveAttribute('aria-valuenow', '5000')
    expect(water()).toBeInTheDocument()
    expect(meter().querySelector('.bar-reveal')).toBeNull()
  })

  it('fills to how much of the budget is spent: more spent, higher the water', () => {
    const levelOf = (spent: number) => {
      const view = render(<Meter spentMinor={spent} limitMinor={1_000_000} currency="INR" variant="water" />)
      const data = water().getAttribute('data-level')
      view.unmount()
      return Number(data)
    }
    expect(levelOf(250_000)).toBe(25)
    expect(levelOf(500_000)).toBe(50)
    expect(levelOf(900_000)).toBe(90)
  })

  it('moves the water by a transform, which rises from the bottom as much as is left empty', () => {
    render(<Meter spentMinor={250_000} limitMinor={1_000_000} currency="INR" variant="water" />)
    expect(level().style.transform).toBe('translateY(75%)')
  })

  it('is brim full, not past it, when the budget is passed, and says so in words', () => {
    render(<Meter spentMinor={1_400_000} limitMinor={1_000_000} currency="INR" variant="water" />)
    expect(level().style.transform).toBe('translateY(0%)')
    expect(meter()).toHaveAttribute('aria-valuetext', 'Over budget by ₹4,000')
  })

  it('shows a little water even for a little spent, so it still reads as water', () => {
    render(<Meter spentMinor={1} limitMinor={100_000_000} currency="INR" variant="water" />)
    expect(level().style.transform).toBe('translateY(90%)')
  })

  it('has two waves, bubbles, and takes the colour of the state: blue, then amber near the limit, then red', () => {
    const colorAt = (spent: number) => {
      const view = render(<Meter spentMinor={spent} limitMinor={1_000_000} currency="INR" variant="water" />)
      const body = level().firstElementChild as HTMLElement
      const color = body.style.background
      expect(water().querySelectorAll('.water-wave')).toHaveLength(2)
      expect(water().querySelectorAll('.water-bubble').length).toBeGreaterThan(0)
      view.unmount()
      return color
    }
    expect(colorAt(300_000)).toBe('var(--accent)')
    expect(colorAt(900_000)).toBe('var(--warn-ui)')
    expect(colorAt(1_100_000)).toBe('var(--critical)')
  })

  it('cuts the waves out of the colour of the empty part, so the surface is wavy', () => {
    render(<Meter spentMinor={500_000} limitMinor={1_000_000} currency="INR" variant="water" />)
    expect(water().style.getPropertyValue('--wave-sky')).toBe(water().style.background)
    expect(water().style.getPropertyValue('--wave-sky')).toContain('var(--accent)')
  })

  it('rises from empty the first time the app shows it, and not when it is shown again', () => {
    const first = render(<Meter spentMinor={500_000} limitMinor={1_000_000} currency="INR" variant="water" />)
    expect(level()).toHaveClass('water-rise')
    first.unmount()
    render(<Meter spentMinor={500_000} limitMinor={1_000_000} currency="INR" variant="water" />)
    expect(level()).not.toHaveClass('water-rise')
  })

  it('leaves the plain bar for lists of many, which is still the default', () => {
    render(<Meter spentMinor={500_000} limitMinor={1_000_000} currency="INR" />)
    expect(meter().querySelector('[data-water]')).toBeNull()
    expect((meter().firstElementChild as HTMLElement).style.width).toBe('50%')
  })

  it('stills the water, and hides the bubbles, for reduced motion', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const block = css.slice(css.indexOf('@keyframes water-fill'))
    const reduced = block.slice(block.indexOf('@media (prefers-reduced-motion: reduce)'))
    for (const name of ['.water-wave-front', '.water-wave-back', '.water-slosh', '.water-rise', '.water-bubble', '.today-float']) expect(reduced.slice(0, 600)).toContain(name)
    expect(reduced.slice(0, 600)).toMatch(/\.water-level\s*\{\s*transition: none/)
  })
})

describe('WaterTank', () => {
  it('goes to a new level when the level changes, by moving the same water', () => {
    const view = render(<WaterTank level={0.2} color="red" sky="white" />)
    const before = view.container.querySelector('.water-level')
    view.rerender(<WaterTank level={0.6} color="red" sky="white" />)
    const after = view.container.querySelector('.water-level') as HTMLElement
    expect(after).toBe(before)
    expect(after.style.transform).toBe('translateY(40%)')
  })

  it('is hidden from a screen reader: the meter says it all', () => {
    const view = render(<WaterTank level={0.5} color="red" sky="white" />)
    expect(view.container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0)
    expect(view.container.textContent).toBe('')
  })
})
