// @vitest-environment jsdom
import '../test/dom'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { SpendingOverview } from './SpendingOverview'
import { DROPS, WaterDrops } from './WaterDrops'

const layer = () => document.querySelector('[data-water-drops]') as HTMLElement
const drops = () => [...layer().querySelectorAll('[data-drop]')] as HTMLElement[]

/** A card with a figure in it, as the Overview has, and the drops hanging from the figure. */
function Card({ fast = false, color }: { fast?: boolean; color?: string }) {
  const figure = useRef<HTMLParagraphElement>(null)
  return (
    <section className="relative">
      <p ref={figure}>₹2,180</p>
      <WaterDrops anchor={figure} fast={fast} color={color} />
    </section>
  )
}

describe('WaterDrops', () => {
  it('is four drops, each with the drop itself, a ring, two sprays and a film', () => {
    render(<Card />)
    expect(drops()).toHaveLength(DROPS.length)
    for (const d of drops()) {
      expect(d.querySelector('.water-drop')).toBeInTheDocument()
      expect(d.querySelector('.water-ring')).toBeInTheDocument()
      expect(d.querySelector('.water-spray-left')).toBeInTheDocument()
      expect(d.querySelector('.water-spray-right')).toBeInTheDocument()
      expect(d.querySelector('.water-film')).toBeInTheDocument()
    }
  })

  it('is decoration: hidden from a screen reader, taking no clicks, and clipped to the card', () => {
    render(<Card />)
    expect(layer().getAttribute('aria-hidden')).toBe('true')
    expect(layer().className).toContain('pointer-events-none')
    expect(layer().className).toContain('overflow-hidden')
    expect(layer().className).toContain('rounded-[24px]')
  })

  it('lets the drops go at different times and speeds, so they do not fall in step', () => {
    render(<Card />)
    const value = (d: HTMLElement, name: string) => d.style.getPropertyValue(name)
    expect(new Set(drops().map((d) => value(d, '--dur'))).size).toBe(DROPS.length)
    expect(new Set(drops().map((d) => value(d, '--delay'))).size).toBe(DROPS.length)
    expect(new Set(drops().map((d) => value(d, '--size'))).size).toBeGreaterThan(1)
  })

  it('hangs them along the width of the figure, in order, from its foot, each over its own spot', () => {
    render(<Card />)
    const lefts = drops().map((d) => parseFloat(d.style.left))
    expect(lefts).toEqual([...lefts].sort((a, b) => a - b))
    expect(new Set(lefts).size).toBe(DROPS.length)
    // They all fall the same distance, to the foot of the card.
    expect(new Set(drops().map((d) => d.style.getPropertyValue('--fall'))).size).toBe(1)
    expect(parseFloat(drops()[0].style.getPropertyValue('--fall'))).toBeGreaterThan(40)
  })

  it('has each film run the whole width of the card from where its drop lands, to both edges', () => {
    render(<Card />)
    for (const d of drops()) {
      const film = d.querySelector('.water-film') as HTMLElement
      // Placed so its left end is the card's left edge, and its growing starts at the drop's own spot.
      expect(parseFloat(film.style.left)).toBeCloseTo(-parseFloat(d.style.left))
      expect(film.style.transformOrigin.split(' ')[0]).toBe(`${parseFloat(d.style.left)}px`)
      expect(parseFloat(film.style.width)).toBeGreaterThan(parseFloat(d.style.left))
    }
  })

  it('is the colour it is given, blue by default, and drips quicker when told to', () => {
    const view = render(<Card />)
    const slow = drops().map((d) => parseFloat(d.style.getPropertyValue('--dur')))
    expect(layer().style.getPropertyValue('--water')).toBe('var(--accent)')
    view.unmount()
    render(<Card fast color="var(--critical)" />)
    expect(layer().style.getPropertyValue('--water')).toBe('var(--critical)')
    drops().forEach((d, i) => expect(parseFloat(d.style.getPropertyValue('--dur'))).toBeLessThan(slow[i]))
  })

  it('moves only by transform and opacity, forever, and is not drawn for reduced motion', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const start = css.indexOf('.water-drop,\n') >= 0 ? css.indexOf('.water-drop,\n') : css.indexOf('.water-drop,\r\n')
    const block = css.slice(start, css.indexOf('/* ---------- Settings ---------- */'))
    expect(block).toMatch(/animation-iteration-count: infinite/)
    for (const name of ['drop-fall', 'drop-ring', 'drop-spray-left', 'drop-spray-right', 'drop-film']) expect(block).toContain(`@keyframes ${name}`)
    // Nothing in the keyframes moves a layout property.
    const keyframes = [...block.matchAll(/@keyframes [\w-]+ \{[\s\S]*?\n\}\n/g)].map((m) => m[0]).join('')
    expect(keyframes).not.toMatch(/\b(top|left|width|height|margin)\s*:/)
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.water-drops \{\s*display: none/)
  })
})

describe('The Overview card with drops', () => {
  const props = {
    monthName: 'October', isCurrent: true, totalMinor: 68_000, deltaPct: null, partial: false, prevName: 'September',
    dailyAverageMinor: 2_400, expenseCount: 2, budgetMinor: null as number | null, currency: 'INR', periods: [], privacy: false,
    onTogglePrivacy: () => {}, onPickPeriod: () => {},
  }

  it('lets drops fall inside the card when something was spent', () => {
    render(<SpendingOverview {...props} />)
    const card = screen.getByRole('region', { name: 'Summary' })
    expect(card.contains(layer())).toBe(true)
    expect(drops()).toHaveLength(DROPS.length)
    expect(layer().style.getPropertyValue('--water')).toBe('var(--accent)')
  })

  it('has none when nothing was spent', () => {
    render(<SpendingOverview {...props} totalMinor={0} />)
    expect(document.querySelector('[data-water-drops]')).toBeNull()
  })

  it('takes the colour of the budget: blue, amber near the limit, red and quicker when over', () => {
    const colorAt = (spent: number) => {
      const view = render(<SpendingOverview {...props} totalMinor={spent} budgetMinor={100_000} />)
      const color = layer().style.getPropertyValue('--water')
      const dur = parseFloat(drops()[0].style.getPropertyValue('--dur'))
      view.unmount()
      return { color, dur }
    }
    expect(colorAt(30_000).color).toBe('var(--accent)')
    expect(colorAt(85_000).color).toBe('var(--warn-ui)')
    const over = colorAt(120_000)
    expect(over.color).toBe('var(--critical)')
    expect(over.dur).toBeLessThan(colorAt(30_000).dur)
  })

  it('hangs from the figure, which is only as wide as its digits', () => {
    render(<SpendingOverview {...props} />)
    const figure = screen.getByRole('region', { name: 'Summary' }).querySelector('p.w-fit')
    expect(figure?.textContent).toContain('₹')
  })
})
