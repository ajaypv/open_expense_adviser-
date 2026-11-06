// @vitest-environment jsdom
import '../test/dom'
import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { Timeline } from './Timeline'

const today = new Date(2026, 10, 6) // Fri 6 Nov 2026

const categories: Category[] = [
  { id: 1, name: 'Food & Dining', color: 'var(--s1)' },
  { id: 2, name: 'Transport', color: 'var(--s2)' },
  { id: 3, name: 'Bills & Utilities', color: 'var(--s5)' },
]
const categoryById = new Map(categories.map((c) => [c.id, c]))

let id = 0
const tx = (date: string, rupees: number, categoryId: number, merchant: string): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId, merchant, note: '', date,
  paymentMethod: '', source: 'manual', createdAt: id,
})

const expenses = () => [
  tx('2026-11-06', 120, 1, 'Cafe'),
  tx('2026-11-05', 450, 1, 'Swiggy'),
  tx('2026-11-05', 300, 2, 'Uber'),
  tx('2026-11-03', 1500, 3, 'Jio recharge'),
  tx('2026-10-31', 80, 1, 'Tea stall'),
]

function mount(list: Transaction[] = expenses(), onPickDay = vi.fn()) {
  render(<Timeline expenses={list} categoryById={categoryById} currency="INR" today={today} onPickDay={onPickDay} />)
  return onPickDay
}

const days = () => within(screen.getByRole('list', { name: 'Spending, day by day' }))
const dayRow = (date: string) => document.querySelector(`li[data-day="${date}"]`) as HTMLElement

describe('Timeline: the week at the top', () => {
  it('says what went in the last 7 days, and what that is a day', () => {
    mount()
    const card = screen.getByRole('region', { name: 'Last 7 days' })
    expect(screen.getByTestId('week-total')).toHaveTextContent('₹2,450')
    expect(card).toHaveTextContent('₹350 a day')
  })

  it('draws one bar of what it went on, described in words, with each category and its share below', () => {
    mount()
    const card = screen.getByRole('region', { name: 'Last 7 days' })
    expect(within(card).getByRole('img')).toHaveAccessibleName('Bills & Utilities 61.2%, Food & Dining 26.5%, Transport 12.2%')
    const list = within(card).getByRole('list', { name: 'Last 7 days, by category' })
    expect(list).toHaveTextContent('Bills & Utilities')
    expect(list).toHaveTextContent('61.2%')
    expect(list).toHaveTextContent('₹1,500')
    expect(card.querySelectorAll('[data-piece]')).toHaveLength(3)
  })

  it('names the biggest day', () => {
    mount()
    expect(screen.getByRole('region', { name: 'Last 7 days' })).toHaveTextContent('The biggest day was')
    expect(screen.getByRole('region', { name: 'Last 7 days' })).toHaveTextContent('₹1,500.')
  })

  it('compares with the 7 days before, when there was spending then', () => {
    mount([...expenses(), tx('2026-10-28', 5000, 1, 'Big')])
    expect(screen.getByRole('region', { name: 'Last 7 days' })).toHaveTextContent('₹2,550 less than the 7 days before')
  })

  it('says so when nothing was spent in the week', () => {
    mount([tx('2026-09-01', 100, 1, 'Old')])
    expect(screen.getByRole('region', { name: 'Last 7 days' })).toHaveTextContent('Nothing spent in the last 7 days.')
  })
})

describe('Timeline: the days', () => {
  it('has a row for each day something was spent, newest first, named Today and Yesterday', () => {
    mount()
    const rows = [...document.querySelectorAll('li[data-day]')].map((r) => r.getAttribute('data-day'))
    expect(rows).toEqual(['2026-11-06', '2026-11-05', '2026-11-03', '2026-10-31'])
    expect(days().getByRole('button', { name: 'Today, ₹120, 1 expense' })).toBeInTheDocument()
    expect(days().getByRole('button', { name: 'Yesterday, ₹750, 2 expenses' })).toBeInTheDocument()
    expect(days().getByRole('button', { name: /^.+, 3 days ago, ₹1,500, 1 expense$/ })).toBeInTheDocument()
  })

  it('gives each day one dot, bigger for a bigger day, and a folded line for the quiet ones', () => {
    mount()
    expect(document.querySelectorAll('[data-dot]')).toHaveLength(6) // four days and two quiet lines
    const size = (date: string) => Number((dayRow(date).querySelector('[data-dot]') as HTMLElement).style.width.replace('px', ''))
    expect(size('2026-11-03')).toBeGreaterThan(size('2026-11-05'))
    expect(size('2026-11-05')).toBeGreaterThan(size('2026-11-06'))
    expect(size('2026-11-03')).toBe(20)
    const quiet = [...document.querySelectorAll('[data-quiet]')].map((q) => q.textContent)
    expect(quiet).toHaveLength(2)
    expect(quiet.some((t) => t?.includes('2 quiet days'))).toBe(true)
    expect(quiet.some((t) => t?.startsWith('Nothing spent on'))).toBe(true)
  })

  it('colours each dot by what most of that day went on', () => {
    mount()
    const colour = (date: string) => (dayRow(date).querySelector('[data-dot]') as HTMLElement).style.background
    expect(colour('2026-11-05')).toContain('--s1') // Food, 450 of 750
    expect(colour('2026-11-03')).toContain('--s5')
  })

  it('shows each day as a bar of what it went on, as long as the day is against the biggest', () => {
    mount()
    const width = (date: string) => {
      const pieces = dayRow(date).querySelector('[data-piece]') as HTMLElement
      return (pieces.parentElement!.parentElement as HTMLElement).style.width
    }
    expect(width('2026-11-03')).toBe('100%')
    expect(width('2026-11-05')).toBe('50%')
    expect(dayRow('2026-11-05').querySelectorAll('[data-piece]')).toHaveLength(2)
  })

  it('names the top categories of a day on chips, with what each took', () => {
    mount()
    const chips = [...dayRow('2026-11-05').querySelectorAll('[data-chip]')].map((c) => c.textContent)
    expect(chips).toEqual(['Food & Dining₹450', 'Transport₹300'])
  })

  it('has a heading where the month changes, with what the month came to', () => {
    mount()
    const headings = within(screen.getByRole('list', { name: 'Spending, day by day' })).getAllByRole('heading', { level: 3 })
    expect(headings.map((h) => h.textContent)).toEqual(['November', 'October'])
    expect(days().getByText('₹2,370 spent')).toBeInTheDocument()
    expect(days().getByText('₹80 spent')).toBeInTheDocument()
  })

  it('keeps today as a row even before anything is spent', () => {
    mount([tx('2026-11-04', 100, 1, 'Cafe')])
    expect(within(dayRow('2026-11-06')).getByText('Nothing spent yet today.')).toBeInTheDocument()
  })
})

describe('Timeline: opening a day', () => {
  it('is shut at first, and opens to every category and every expense when pressed', () => {
    mount()
    const button = days().getByRole('button', { name: 'Yesterday, ₹750, 2 expenses' })
    const details = document.getElementById('tl-2026-11-05')!
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(details).toHaveAttribute('inert')
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(details).not.toHaveAttribute('inert')
    expect(within(details).getByRole('list', { name: 'Yesterday, by category' })).toHaveTextContent('60.0%')
    const each = within(details).getByRole('list', { name: 'Yesterday, each expense' })
    expect(each).toHaveTextContent('Swiggy')
    expect(each).toHaveTextContent('Uber')
    expect(each).toHaveTextContent('₹300')
  })

  it('has one day open at a time, and shuts it when pressed again', () => {
    mount()
    const yesterday = days().getByRole('button', { name: 'Yesterday, ₹750, 2 expenses' })
    const today = days().getByRole('button', { name: 'Today, ₹120, 1 expense' })
    fireEvent.click(yesterday)
    fireEvent.click(today)
    expect(today).toHaveAttribute('aria-expanded', 'true')
    expect(yesterday).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(today)
    expect(today).toHaveAttribute('aria-expanded', 'false')
  })

  it('gives each expense the icon for what it was, an EMI or a recharge by its name', () => {
    mount()
    fireEvent.click(days().getByRole('button', { name: /3 days ago/ }))
    expect(document.getElementById('tl-2026-11-03')!.querySelector('[data-icon="recharge"]')).toBeInTheDocument()
  })

  it('opens the day’s expenses from the button inside it', () => {
    const onPickDay = mount()
    fireEvent.click(days().getByRole('button', { name: 'Yesterday, ₹750, 2 expenses' }))
    fireEvent.click(screen.getByRole('button', { name: 'See yesterday’s expenses' }))
    expect(onPickDay).toHaveBeenCalledWith('2026-11-05')
  })
})

describe('Timeline: further back, and nothing', () => {
  it('stops at the first expense, with a button for earlier days only when there are some', () => {
    mount()
    expect(screen.queryByRole('button', { name: 'Show earlier days' })).toBeNull()
    document.body.innerHTML = ''
  })

  it('goes back 30 days at a time', () => {
    mount([...expenses(), tx('2026-08-01', 40, 1, 'Old')])
    expect(document.querySelectorAll('li[data-day]')).toHaveLength(4)
    // 98 days back to the first expense: 30, 60, 90, then all of it.
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Show earlier days' }))
    expect(screen.queryByRole('button', { name: 'Show earlier days' })).toBeNull()
    expect(document.querySelector('li[data-day="2026-08-01"]')).toBeInTheDocument()
  })

  it('says what it is for when there is nothing to show', () => {
    mount([])
    expect(screen.getByText(/No spending to show yet/)).toBeInTheDocument()
  })
})

describe('Timeline: motion', () => {
  const css = readFileSync('src/index.css', 'utf8').replace(/\r/g, '')

  it('draws the line down, and sends a pulse of light along it, once the day is reached; neither with reduced motion', () => {
    expect(css).toMatch(/\.tl-line \{[^}]*animation: tl-draw/)
    expect(css).toMatch(/\.tl-flow \{[^}]*animation: tl-flow/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*?\.tl-line \{\s*animation: none;\s*\}\s*\.tl-flow \{\s*display: none/)
  })

  it('holds each day’s animations until it is on screen', () => {
    mount()
    expect(dayRow('2026-11-05')).toHaveClass('when-seen')
    expect(dayRow('2026-11-05')).toHaveAttribute('data-seen')
    expect(dayRow('2026-11-05').querySelector('.tl-line')).toBeInTheDocument()
    expect(dayRow('2026-11-05').querySelector('.ai-pop')).toBeInTheDocument()
    expect(dayRow('2026-11-05').querySelector('.ai-bar-right')).toBeInTheDocument()
  })

  it('marks today with a pulse that says you are here', () => {
    mount()
    expect(dayRow('2026-11-06').querySelector('.ai-pulse')).toBeInTheDocument()
    expect(dayRow('2026-11-05').querySelector('.ai-pulse')).toBeNull()
  })
})
