// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Category } from '../db/schema'
import type { CategoryTotal } from '../insights/aggregates'
import { CategoryDonut } from './CategoryDonut'

const category = (id: number, name: string, color = `var(--s${id})`): Category => ({ id, name, color })
const categoryById = new Map<number, Category>([
  [1, category(1, 'Groceries')],
  [2, category(2, 'Shopping')],
  [3, category(3, 'Food & Dining')],
  [4, category(4, 'Health')],
])
// Out of ₹1,000.
const totals: CategoryTotal[] = [
  { categoryId: 1, totalMinor: 40_000 },
  { categoryId: 2, totalMinor: 30_000 },
  { categoryId: 3, totalMinor: 20_000 },
  { categoryId: 4, totalMinor: 10_000 },
]

const mount = (over: Record<string, unknown> = {}) =>
  render(<CategoryDonut totals={totals} categoryById={categoryById} currency="INR" {...over} />)
const legend = () => screen.getByRole('list', { name: 'Spending by category' })
const centre = () => screen.getByTestId('donut-centre')
const segments = () => Array.from(document.querySelectorAll<SVGCircleElement>('circle[data-segment]'))

describe('CategoryDonut: a ring with a segment for each category', () => {
  it('draws one rounded segment for each category in its colour, round-capped so the ends are soft', () => {
    mount()
    expect(segments()).toHaveLength(4)
    expect(segments().map((s) => s.getAttribute('stroke'))).toEqual(['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'])
    for (const s of segments()) expect(s.getAttribute('stroke-linecap')).toBe('round')
  })

  it('gives each segment a length in proportion to its share, with a gap between neighbours', () => {
    mount()
    const length = (el: SVGCircleElement) => parseFloat(el.getAttribute('stroke-dasharray')!.split(' ')[0])
    const [a, b, c, d] = segments().map(length)
    // 40%, 30%, 20% and 10% of the ring, each less the same cap and gap, so differences are in proportion to the shares.
    expect(a - b).toBeCloseTo(b - c, 5)
    expect(b - c).toBeCloseTo(c - d, 5)
    expect(a).toBeGreaterThan(b)
  })

  it('never lets a tiny share vanish: it is at least a dot', () => {
    mount({ totals: [{ categoryId: 1, totalMinor: 99_900 }, { categoryId: 2, totalMinor: 100 }] })
    const length = (el: SVGCircleElement) => parseFloat(el.getAttribute('stroke-dasharray')!.split(' ')[0])
    expect(length(segments()[1])).toBeGreaterThan(0)
  })

  it('shows the total in the middle to begin with', () => {
    mount()
    expect(centre()).toHaveTextContent('₹1,000')
    expect(centre()).toHaveTextContent('Total')
  })
})

describe('CategoryDonut: the legend', () => {
  it('lists every category with its share and amount, biggest first', () => {
    mount({ onPick: () => {} })
    const rows = within(legend()).getAllByRole('listitem')
    expect(rows).toHaveLength(4)
    expect(rows[0]).toHaveTextContent('Groceries')
    expect(rows[0]).toHaveTextContent('40.0%')
    expect(rows[0]).toHaveTextContent('₹400')
    expect(rows[3]).toHaveTextContent('Health')
  })

  it('opens a category when its row is tapped, and says so to a screen reader', () => {
    const onPick = vi.fn()
    mount({ onPick })
    fireEvent.click(screen.getByRole('button', { name: 'Shopping, 30.0%, ₹300. Show these expenses' }))
    expect(onPick).toHaveBeenCalledWith(2)
  })

  it('is plain rows, not buttons, when there is nothing to open', () => {
    mount()
    expect(within(legend()).queryAllByRole('button')).toHaveLength(0)
    expect(within(legend()).getAllByRole('listitem')[1]).toHaveTextContent('Shopping')
  })

  it('folds everything past the sixth into one grey row, which opens nothing', () => {
    const ids = Array.from({ length: 9 }, (_, i) => i + 1)
    const many = new Map<number, Category>(ids.map((id) => [id, category(id, `Cat ${id}`)]))
    const rows: CategoryTotal[] = ids.map((id) => ({ categoryId: id, totalMinor: (10 - id) * 1000 }))
    mount({ totals: rows, categoryById: many, onPick: () => {} })
    expect(within(legend()).getAllByRole('listitem')).toHaveLength(7)
    expect(within(legend()).getAllByRole('button')).toHaveLength(6)
    expect(within(legend()).getByText('Everything else')).toBeInTheDocument()
    expect(segments()).toHaveLength(7)
    expect(segments()[6].getAttribute('stroke')).toBe('var(--other)')
  })
})

describe('CategoryDonut: looking at one category', () => {
  it('shows that category in the middle while its row is in focus, and goes back to the total after', () => {
    mount({ onPick: () => {} })
    const row = screen.getByRole('button', { name: /^Shopping,/ })
    fireEvent.focus(row)
    expect(centre()).toHaveTextContent('₹300')
    expect(centre()).toHaveTextContent('Shopping')
    expect(centre()).toHaveTextContent('30.0%')
    fireEvent.blur(row)
    expect(centre()).toHaveTextContent('₹1,000')
    expect(centre()).toHaveTextContent('Total')
  })

  it('does the same when a mouse is over a legend row', () => {
    mount({ onPick: () => {} })
    fireEvent.pointerEnter(screen.getByRole('button', { name: /^Health,/ }), { pointerType: 'mouse' })
    expect(centre()).toHaveTextContent('Health')
    fireEvent.pointerLeave(legend(), { pointerType: 'mouse' })
    expect(centre()).toHaveTextContent('Total')
  })

  it('picks a segment when it is tapped, makes it stand out, and lets go when it is tapped again', () => {
    mount()
    fireEvent.click(segments()[2])
    expect(centre()).toHaveTextContent('Food & Dining')
    expect(segments()[2].getAttribute('stroke-width')).toBe('15')
    expect(segments()[0].getAttribute('stroke-width')).toBe('13')
    expect(segments()[0].style.opacity).toBe('0.4')
    fireEvent.click(segments()[2])
    expect(centre()).toHaveTextContent('Total')
    expect(segments()[0].style.opacity).toBe('1')
  })

  it('announces the middle of the ring as it changes', () => {
    mount()
    expect(centre()).toHaveAttribute('aria-live', 'polite')
  })
})

describe('CategoryDonut: what the spending says', () => {
  it('names the two biggest and what they come to together', () => {
    mount()
    expect(screen.getByText('Most of it went on Groceries and Shopping, 70.0% together.')).toBeInTheDocument()
  })

  it('says "more than half" when one category has over half', () => {
    mount({ totals: [{ categoryId: 1, totalMinor: 60_000 }, { categoryId: 2, totalMinor: 40_000 }] })
    expect(screen.getByText('More than half of it went on Groceries.')).toBeInTheDocument()
  })

  it('says all of it when there is only one category', () => {
    mount({ totals: [{ categoryId: 1, totalMinor: 5_000 }] })
    expect(screen.getByText('All of it went on Groceries.')).toBeInTheDocument()
  })
})

describe('CategoryDonut: nothing to show', () => {
  it('draws nothing when nothing was spent', () => {
    const { container } = mount({ totals: [] })
    expect(container).toBeEmptyDOMElement()
    expect(render(<CategoryDonut totals={[{ categoryId: 1, totalMinor: 0 }]} categoryById={categoryById} currency="INR" />).container).toBeEmptyDOMElement()
  })

  it('never prints a broken number', () => {
    const { container } = mount({ onPick: () => {} })
    expect(container.textContent).not.toMatch(/NaN|undefined|Infinity/)
  })
})
