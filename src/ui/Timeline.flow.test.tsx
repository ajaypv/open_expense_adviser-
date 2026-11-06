// @vitest-environment jsdom
import '../test/dom'
import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { riverPath } from './river'
import { Timeline } from './Timeline'

// The real thing, watched: how often the line's pictures are made says how often its rows are drawn.
vi.mock('./river', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./river')>()
  return { ...actual, riverPath: vi.fn(actual.riverPath) }
})

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

describe('Timeline: the days', () => {
  it('has a row for each day something was spent, newest first, named Today and Yesterday', () => {
    mount()
    const rows = [...document.querySelectorAll('li[data-day]')].map((r) => r.getAttribute('data-day'))
    expect(rows).toEqual(['2026-11-06', '2026-11-05', '2026-11-03', '2026-10-31'])
    expect(days().getByRole('button', { name: 'Today, ₹120, 1 expense' })).toBeInTheDocument()
    expect(days().getByRole('button', { name: 'Yesterday, ₹750, 2 expenses' })).toBeInTheDocument()
    expect(days().getByRole('button', { name: /^.+, 3 days ago, ₹1,500, 1 expense$/ })).toBeInTheDocument()
  })

  it('makes each dot the date of its day, the weekday small over the number, with a tick for a run of quiet days', () => {
    mount()
    expect(document.querySelectorAll('[data-dot]')).toHaveLength(6) // four days and two quiet lines
    const dot = (date: string) => dayRow(date).querySelector('[data-dot]') as HTMLElement
    const date = (d: HTMLElement) => d.querySelector('[data-date]')?.textContent
    expect(date(dot('2026-11-06'))).toBe('6')
    expect(date(dot('2026-11-05'))).toBe('5')
    expect(date(dot('2026-11-03'))).toBe('3')
    expect(date(dot('2026-10-31'))).toBe('31')
    const weekday = (d: string, y: number, m: number, day: number) => expect(dot(d).querySelector('[data-weekday]')?.textContent).toBe(new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(y, m, day)))
    weekday('2026-11-05', 2026, 10, 5)
    weekday('2026-10-31', 2026, 9, 31)
    const quiet = [...document.querySelectorAll('[data-quiet]')]
    const single = quiet.find((q) => q.getAttribute('data-quiet') === '2026-11-04')!
    const run = quiet.find((q) => q.getAttribute('data-quiet') === '2026-11-02')!
    expect(single.querySelector('[data-date]')?.textContent).toBe('4')
    expect(run.querySelector('[data-date]')).toBeNull() // a tick, not a number
    expect(run.querySelector('[data-dot] svg')).toBeInTheDocument()
  })

  it('keeps every dot the same size, since the colour now says how much', () => {
    mount()
    const classes = [...document.querySelectorAll('[data-dot]')].map((d) => d.className)
    expect(new Set(classes).size).toBe(1)
    expect(classes[0]).toContain('size-[2.625rem]')
  })

  it('colours each dot by how much was spent that day against the biggest: calm teal, then amber, then warm coral', () => {
    mount()
    const style = (date: string) => (dayRow(date).querySelector('[data-dot]') as HTMLElement).getAttribute('style')!
    expect(style('2026-11-03')).toContain('var(--heat-high) 100%') // the biggest day, 1,500
    expect(style('2026-11-05')).toContain('var(--heat-high) 0%') // half of it: amber
    expect(style('2026-11-06')).toContain('var(--heat-mid) 16%') // 120 of 1,500: still mostly teal
    expect(style('2026-10-31')).toContain('var(--heat-mid) 11%')
    const quiet = document.querySelector('[data-quiet="2026-11-04"] [data-dot]') as HTMLElement
    expect(quiet.getAttribute('style')).toContain('var(--heat-low)')
    // Not by category, and not a traffic light: the category colours stay on the bars.
    expect(style('2026-11-03')).not.toContain('--s5')
    expect(style('2026-11-03')).not.toContain('--critical')
    expect(style('2026-11-03')).not.toContain('--good')
  })

  it('explains the colours: from spent less to spent more', () => {
    mount()
    expect(screen.getByText('Spent less')).toBeInTheDocument()
    expect(screen.getByText('Spent more')).toBeInTheDocument()
    const scale = screen.getByTestId('spend-scale').getAttribute('style')!
    expect(scale).toContain('var(--heat-low)')
    expect(scale).toContain('var(--heat-high)')
  })

  it('says days with nothing spent are good news', () => {
    mount()
    const single = document.querySelector('[data-quiet="2026-11-04"]')!
    const run = document.querySelector('[data-quiet="2026-11-02"]')!
    expect(single).toHaveTextContent(/No spending on .+\. Nicely done\./)
    expect(run).toHaveTextContent(/2 days with no spending, .+ to .+\. Well done\./)
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
    expect(within(dayRow('2026-11-06')).getByText('Nothing spent yet today. A good start.')).toBeInTheDocument()
    expect(dayRow('2026-11-06').querySelector('[data-dot]')).toHaveTextContent('6')
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

describe('Timeline: it does not redraw what has not changed', () => {
  const drawn = vi.mocked(riverPath)

  it('draws no stretch of the line again when a day is opened or shut', () => {
    mount()
    drawn.mockClear()
    fireEvent.click(days().getByRole('button', { name: 'Yesterday, ₹750, 2 expenses' }))
    fireEvent.click(days().getByRole('button', { name: 'Today, ₹120, 1 expense' }))
    fireEvent.click(days().getByRole('button', { name: 'Today, ₹120, 1 expense' }))
    expect(drawn).not.toHaveBeenCalled()
  })

  it('draws only what changed when a new expense comes in: not the line for days it did not touch', () => {
    const list = expenses()
    const { rerender } = render(<Timeline expenses={list} categoryById={categoryById} currency="INR" today={today} onPickDay={vi.fn()} />)
    drawn.mockClear()
    // A small new expense on the 5th (not the biggest day): that day, the stretch before it and the one after it change, and the rest of the line stays as it was.
    const onPickDay = vi.fn()
    rerender(<Timeline expenses={[...list, tx('2026-11-05', 10, 1, 'Tea')]} categoryById={categoryById} currency="INR" today={today} onPickDay={onPickDay} />)
    const afterSecond = drawn.mock.calls.length
    expect(afterSecond).toBeGreaterThan(0) // it does draw what changed
    expect(afterSecond).toBeLessThanOrEqual(3) // the two stretches either side of that day, and not the other five
  })

  it('opens the one day it is asked to, and shuts the other', () => {
    mount()
    const yesterday = days().getByRole('button', { name: 'Yesterday, ₹750, 2 expenses' })
    const today = days().getByRole('button', { name: 'Today, ₹120, 1 expense' })
    fireEvent.click(yesterday)
    expect(yesterday).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(today)
    expect(yesterday).toHaveAttribute('aria-expanded', 'false')
    expect(today).toHaveAttribute('aria-expanded', 'true')
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

describe('Timeline: the line', () => {
  const css = readFileSync('src/index.css', 'utf8').replace(/\r/g, '')
  const segs = () => [...document.querySelectorAll<HTMLElement>('[data-seg]')]

  it('runs from each day to the next as a line, grey beneath and coloured above', () => {
    mount()
    const seg = dayRow('2026-11-05').querySelector('[data-seg]') as HTMLElement
    expect(seg.querySelectorAll('svg')).toHaveLength(2)
    expect(seg.querySelector('.tl-fill')).toBeInTheDocument()
    expect(seg.querySelector('linearGradient')).toBeInTheDocument()
    expect(seg.querySelector('.tl-head')).toBeInTheDocument()
  })

  it('runs straight down, with no sway, so it never crosses over itself or the dates', () => {
    mount()
    for (const seg of segs()) {
      const d = seg.querySelector('path')!.getAttribute('d')!
      const points = d.slice(1, -1).split('L').map((p) => p.split(' ').map(Number))
      const half = (points.length - 0) / 2
      for (let i = 0; i < half; i++) {
        const [lx] = points[i]
        const [rx] = points[points.length - 1 - i]
        expect(12 - lx).toBeCloseTo(rx - 12, 1) // centred on the middle at every height
      }
      expect(seg.dataset.dir).toBeUndefined()
    }
  })

  it('is broader where more was spent: a wider outline after the biggest day than after a quiet one', () => {
    mount()
    const width = (date: string) => {
      const d = dayRow(date).querySelector('[data-seg] path')!.getAttribute('d')!
      const xs = d.slice(1, -1).split('L').map((p) => Number(p.split(' ')[0]))
      return Math.max(...xs) - Math.min(...xs)
    }
    expect(width('2026-11-03')).toBeGreaterThan(width('2026-11-06') - 0.0001)
  })

  it('stops at the foot of the row before a month heading, which carries it on', () => {
    mount()
    const heading = screen.getByRole('heading', { level: 3, name: 'October' }).closest('li')!
    expect(heading.querySelector('[data-seg]')).toBeInTheDocument()
    const before = document.querySelector('[data-quiet="2026-11-02"] [data-seg]') as HTMLElement
    expect(before.style.bottom).toBe('0px')
  })

  it('has every stretch drawn, and every date lit, when there is no layout to scroll through', () => {
    mount()
    for (const x of segs()) expect(x.style.getPropertyValue('--p')).toBe('1')
    for (const d of document.querySelectorAll('[data-dot]')) expect(d).toHaveAttribute('data-lit', 'true')
  })

  it('is drawn by scrolling, on the screen, and not by the day it comes to be on screen', () => {
    expect(css).toMatch(/\.tl-fill \{[^}]*clip-path: inset\(0 0 calc\(\(1 - var\(--p, 1\)\) \* 100%\) 0\)/)
    expect(css).toMatch(/\.tl-head \{[^}]*top: calc\(var\(--p, 1\) \* 100%\)/)
    expect(css).not.toContain('tl-draw')
    expect(css).not.toContain('tl-flow')
  })

  it('has dates that are dark until the line reaches them, and fill in with a spring', () => {
    expect(css).toMatch(/\.tl-dot \{[^}]*transform: scale\(0\.82\)[^}]*transition:[^}]*transform 0\.55s cubic-bezier\(0\.3, 1\.55/)
    expect(css).toMatch(/\.tl-dot\[data-lit='true'\] \{[^}]*var\(--c\)[^}]*transform: none/)
  })

  it('shows a bead of light only on the stretch being drawn', () => {
    expect(css).toMatch(/\.tl-head \{[^}]*opacity: 0/)
    expect(css).toMatch(/\.tl-river\[data-live='true'\] \.tl-head \{\s*opacity: 1/)
  })
})

describe('Timeline: motion', () => {
  const css = readFileSync('src/index.css', 'utf8').replace(/\r/g, '')

  it('holds each day’s bar and amount until it is on screen', () => {
    mount()
    expect(dayRow('2026-11-05')).toHaveClass('when-seen')
    expect(dayRow('2026-11-05')).toHaveAttribute('data-seen')
    expect(dayRow('2026-11-05').querySelector('.ai-bar-right')).toBeInTheDocument()
  })

  it('marks today with a thin ring that gives out a ping, and no other day', () => {
    mount()
    expect(dayRow('2026-11-06').querySelector('.tl-ping')).toBeInTheDocument()
    expect(dayRow('2026-11-05').querySelector('.tl-ping')).toBeNull()
  })

  it('keeps the ping small enough to stay inside its own column, so nothing is cut off at the left or drawn over by the card', () => {
    const peak = Number(css.match(/@keyframes tl-ping \{[\s\S]*?scale\(([\d.]+)\)/g)!.join(' ').match(/scale\(([\d.]+)\)/g)!.map((m) => m.slice(6, -1)).sort().at(-1))
    // The dot is 2.625rem in a 3rem column: a ring this much bigger reaches about 0.4rem past the dot, either side.
    expect(peak).toBeLessThanOrEqual(1.5)
  })

  it('does nothing of this, or not much, when motion is reduced', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*?\.tl-dot \{\s*transition: none[\s\S]*?\.tl-head \{\s*display: none[\s\S]*?\.tl-ping \{\s*animation: none/)
  })
})

describe('Timeline: today’s water bar', () => {
  const todayBar = () => document.querySelector('[data-today-bar]') as HTMLElement | null
  const pieces = (row: HTMLElement) => [...row.querySelectorAll('[data-piece]')].map((p) => p.getAttribute('data-piece'))

  it('is only on today, and no other day has waves or a floater', () => {
    mount()
    expect(document.querySelectorAll('[data-today-bar]')).toHaveLength(1)
    expect(dayRow('2026-11-06').querySelector('[data-today-bar]')).toBeInTheDocument()
    for (const date of ['2026-11-05', '2026-11-03', '2026-10-31']) {
      expect(dayRow(date).querySelector('.water-wave')).toBeNull()
      expect(dayRow(date).querySelector('[data-floater]')).toBeNull()
    }
  })

  it('rolls two waves along the top of the water', () => {
    mount()
    expect(todayBar()!.querySelectorAll('.water-wave')).toHaveLength(2)
  })

  it('floats the icon of the expense added last on the end of the bar, and ends the bar on its category', () => {
    const list = [tx('2026-11-06', 300, 2, 'Uber'), tx('2026-11-06', 120, 1, 'Cafe'), tx('2026-11-06', 50, 2, 'Metro')]
    mount(list)
    const floater = todayBar()!.querySelector('[data-floater]') as HTMLElement
    expect(floater.getAttribute('data-floater')).toBe(String(list[2].id)) // the Metro, added last
    // Transport is the biggest and Food & Dining the smallest, yet the colour on the end is the one just spent on.
    expect(pieces(dayRow('2026-11-06'))).toEqual(['1', '2'])
  })

  it('drops a new float in when a newer expense is added', () => {
    const first = [tx('2026-11-06', 120, 1, 'Cafe')]
    const { rerender } = render(<Timeline expenses={first} categoryById={categoryById} currency="INR" today={today} onPickDay={vi.fn()} />)
    const before = document.querySelector('[data-floater]')!
    rerender(<Timeline expenses={[...first, tx('2026-11-06', 60, 2, 'Bus')]} categoryById={categoryById} currency="INR" today={today} onPickDay={vi.fn()} />)
    const after = document.querySelector('[data-floater]')!
    expect(after).not.toBe(before)
    expect(after.getAttribute('data-floater')).not.toBe(before.getAttribute('data-floater'))
  })

  it('has no bar, and so no water, on a day with nothing spent', () => {
    mount([tx('2026-11-05', 450, 1, 'Swiggy')])
    expect(todayBar()).toBeNull()
  })

  it('stills the water for reduced motion', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const block = css.slice(css.indexOf('@keyframes wave-roll'))
    const reduced = block.slice(block.indexOf('@media (prefers-reduced-motion: reduce)'))
    for (const name of ['.water-wave-front', '.water-wave-back', '.water-slosh', '.today-drop', '.today-float']) expect(reduced.slice(0, 300)).toContain(name)
  })
})
