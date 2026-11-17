// @vitest-environment jsdom
import '../test/dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KeptBar } from './KeptBar'

const mount = (over: Partial<Parameters<typeof KeptBar>[0]> = {}) =>
  render(<KeptBar salaryMinor={80_000_00} otherMinor={0} sentMinor={50_000_00} currency="INR" monthName="November" {...over} />)

const row = (c: HTMLElement, key: string) => c.querySelector(`[data-row="${key}"]`) as HTMLElement
const widths = (c: HTMLElement) => Array.from(c.querySelectorAll('[data-segment]')).map((s) => [s.getAttribute('data-segment'), (s as HTMLElement).style.width])

describe('KeptBar', () => {
  it('says what was saved first, then the salary, what was spent and what was saved with their shares', () => {
    const { container } = mount()
    expect(screen.getByText('You saved')).toBeInTheDocument()
    expect(screen.getByText('out of ₹80,000 you had')).toBeInTheDocument()
    expect(row(container, 'salary').textContent).toMatch(/Salary.*Received in November.*₹80,000/)
    expect(row(container, 'spent').textContent).toMatch(/Spent.*62% of it.*₹50,000/)
    expect(row(container, 'kept').textContent).toMatch(/Saved.*38% of it.*₹30,000/)
    expect(container.querySelector('[data-row="carried"]')).toBeNull()
    expect(container.querySelector('[data-row="other"]')).toBeNull()
  })

  it('counts what was left from the month before as money you had, and names the month', () => {
    const { container } = mount({ salaryMinor: 60_000_00, carriedMinor: 20_000_00, carriedFrom: 'October', sentMinor: 50_000_00 })
    expect(screen.getByText('out of ₹80,000 you had')).toBeInTheDocument()
    expect(row(container, 'carried').textContent).toMatch(/Left from October.*Carried forward.*₹20,000/)
    expect(row(container, 'kept').textContent).toContain('₹30,000')
  })

  it('shows October\'s salary paying for November: nothing received this month still leaves money to spend', () => {
    const { container } = mount({ salaryMinor: 0, carriedMinor: 40_000_00, carriedFrom: 'October', sentMinor: 10_000_00 })
    expect(screen.getByText('out of ₹40,000 you had')).toBeInTheDocument()
    expect(container.querySelector('[data-row="salary"]')).toBeNull()
    expect(row(container, 'kept').textContent).toContain('₹30,000')
  })

  it('lists other money in apart from the salary', () => {
    const { container } = mount({ otherMinor: 5_000_00 })
    expect(row(container, 'other').textContent).toMatch(/Other money in.*₹5,000/)
    expect(screen.getByText('out of ₹85,000 you had')).toBeInTheDocument()
  })

  it('calls money in "Money received" when there is no salary', () => {
    const { container } = mount({ salaryMinor: 0, otherMinor: 5_000_00, sentMinor: 1_000_00 })
    expect(row(container, 'other').textContent).toMatch(/Money received.*₹5,000/)
  })

  it('shares add up to a hundred, and the bar is split in the same proportions', () => {
    const { container } = mount({ salaryMinor: 3_000_00, sentMinor: 1_000_00 })
    expect(row(container, 'spent').textContent).toContain('33% of it')
    expect(row(container, 'kept').textContent).toContain('67% of it')
    const [spent, kept] = widths(container)
    expect(spent[0]).toBe('spent')
    expect(parseFloat(spent[1] as string)).toBeCloseTo(33.33, 1)
    expect(parseFloat(kept[1] as string)).toBeCloseTo(66.67, 1)
  })

  it('says "so far" while the month is not over', () => {
    mount({ inProgress: true })
    expect(screen.getByText('You saved so far')).toBeInTheDocument()
    expect(screen.getByText('Saved so far')).toBeInTheDocument()
  })

  it('gives the whole bar to what was spent, with the uncovered part marked, when more went out than you had', () => {
    const { container } = mount({ salaryMinor: 1_000_00, sentMinor: 1_600_00 })
    expect(screen.getByText('You spent more than you had')).toBeInTheDocument()
    expect(row(container, 'over').textContent).toContain('₹600')
    expect(row(container, 'over').textContent).toContain('Over by')
    expect(container.querySelector('[data-row="kept"]')).toBeNull()
    const [covered, over] = widths(container)
    expect(covered[0]).toBe('covered')
    expect(parseFloat(covered[1] as string)).toBeCloseTo(62.5, 1)
    expect(parseFloat(over[1] as string)).toBeCloseTo(37.5, 1)
  })

  it('describes the bar in words for a screen reader', () => {
    mount()
    expect(screen.getByRole('img', { name: '₹80,000 to spend: ₹50,000 spent (62%) and ₹30,000 saved (38%)' })).toBeInTheDocument()
  })

  it('keeps all of what you had when nothing was spent', () => {
    const { container } = mount({ sentMinor: 0 })
    expect(row(container, 'kept').textContent).toContain('100% of it')
    expect(container.querySelector('[data-segment="spent"]')).toBeNull()
  })
})
