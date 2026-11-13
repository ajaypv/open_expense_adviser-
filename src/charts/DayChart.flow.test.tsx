// @vitest-environment jsdom
import '../test/dom'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatMoney } from '../db/money'
import type { Category, Transaction } from '../db/schema'
import { DayChart } from './DayChart'

const categoryById = new Map<number, Category>([
  [1, { id: 1, name: 'Food & Dining', color: 'var(--s1)' }],
  [2, { id: 2, name: 'Travel', color: 'var(--s2)' }],
])

let id = 0
const spend = (date: string, rupees: number, categoryId: number, merchant: string): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId, merchant, note: '',
  date, paymentMethod: '', source: 'manual', createdAt: id,
})

// October 2026, up to Monday the 12th. The 3rd, 4th, 10th and 11th are weekend days.
const txs = [
  spend('2026-10-02', 100, 1, 'Cafe'),
  spend('2026-10-03', 400, 1, 'Big lunch'),
  spend('2026-10-06', 200, 2, 'Uber'),
  spend('2026-10-10', 100, 1, 'Alpha'),
  spend('2026-10-10', 90, 2, 'Bravo'),
  spend('2026-10-10', 80, 2, 'Charlie'),
  spend('2026-10-10', 70, 1, 'Delta'),
  spend('2026-10-12', 50, 1, 'Snack'),
]
// ₹1,090 over 12 days.
const average = formatMoney(9083, 'INR')

const label = (d: number) => new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(2026, 9, d))

function mount(over: Partial<React.ComponentProps<typeof DayChart>> = {}) {
  const onPickDay = vi.fn()
  render(<DayChart txs={txs} categoryById={categoryById} monthKey="2026-10" lastDay={12} currency="INR" onPickDay={onPickDay} {...over} />)
  return onPickDay
}

const plot = () => screen.getByTestId('day-plot')
const column = (day: number) => plot().querySelector<HTMLElement>(`[data-day="${day}"]`)!
const bar = (day: number) => column(day).querySelector<HTMLElement>('[data-bar]')
const key = (k: string) => fireEvent.keyDown(plot(), { key: k })
const selectedDays = () => Array.from(plot().querySelectorAll<HTMLElement>('[data-selected]')).map((c) => Number(c.dataset.day))

describe('DayChart: the columns', () => {
  it('has a column for every day of the month, and a bar only for days that have happened', () => {
    mount()
    expect(plot().querySelectorAll('[data-day]')).toHaveLength(31)
    expect(bar(2)).not.toBeNull()
    expect(bar(11)).not.toBeNull() // happened, with nothing spent
    expect(bar(13)).toBeNull() // not yet
    expect(bar(31)).toBeNull()
  })

  it('makes each column as tall as the day was big, in proportion', () => {
    mount()
    const h = (d: number) => parseFloat(bar(d)!.style.height)
    expect(h(3)).toBeCloseTo(100, 5) // the biggest day fills the axis (₹400 is a tidy maximum)
    expect(h(10)).toBeCloseTo(85, 5)
    expect(h(6)).toBeCloseTo(50, 5)
    expect(h(2)).toBeCloseTo(25, 5)
    expect(h(11)).toBe(0)
  })

  it('puts weekend days on a band', () => {
    mount()
    const weekend = Array.from(plot().querySelectorAll<HTMLElement>('[data-weekend]')).map((c) => Number(c.dataset.day))
    expect(weekend.filter((d) => d <= 12)).toEqual([3, 4, 10, 11])
  })

  it('draws a dashed line for the average day, at the right height', () => {
    mount()
    const line = screen.getByTestId('day-average')
    // ₹90.83 of a ₹400 axis.
    expect(parseFloat(line.style.bottom)).toBeCloseTo((9083 / 40000) * 100, 3)
    expect(line).toHaveTextContent('average')
  })

  it('labels the first of each week and marks the axis top', () => {
    mount()
    expect(within(plot().parentElement!.parentElement!).getByText('15')).toBeInTheDocument()
    // The axis top is the small label; the same amount may also stand, in bold, in a sentence below.
    expect(screen.getAllByText('₹400').some((e) => e.className.includes('text-xs'))).toBe(true)
  })
})

describe('DayChart: the budget', () => {
  it('draws no budget line, and flags nothing, without a budget', () => {
    mount()
    expect(screen.queryByTestId('day-limit')).toBeNull()
    expect(plot().querySelector('[data-over]')).toBeNull()
  })

  it('draws the daily share of the budget and caps the days above it', () => {
    // ₹3,100 a month is ₹100 a day: the 3rd, 6th and 10th are above; the 2nd (exactly ₹100) and the 12th are not.
    mount({ budgetMinor: 310_000 })
    const line = screen.getByTestId('day-limit')
    expect(parseFloat(line.style.bottom)).toBeCloseTo(25, 5)
    expect(line).toHaveTextContent('budget')
    const over = Array.from(plot().querySelectorAll<HTMLElement>('[data-over]')).map((c) => Number(c.dataset.day))
    expect(over).toEqual([3, 6, 10])
  })

  it('leaves the line out when the daily share is far above every day, rather than stretching the chart', () => {
    mount({ budgetMinor: 31_000_000 }) // ₹10,000 a day
    expect(screen.queryByTestId('day-limit')).toBeNull()
  })
})

describe('DayChart: reading a day', () => {
  it('starts with the average day and what it came to', () => {
    mount()
    expect(screen.getByText('a day on average')).toBeInTheDocument()
    expect(screen.getByText(average)).toBeInTheDocument()
    const total = screen.getByText('a day on average').nextElementSibling!
    expect(total.textContent).toBe(`${formatMoney(109_000, 'INR')} over 12 days`)
    // The amount and the number of days are in bold; the words are not.
    expect(Array.from(total.querySelectorAll('b')).map((b) => b.textContent)).toEqual([formatMoney(109_000, 'INR'), '12'])
  })

  it('moves through the days with the arrow keys, starting from today', () => {
    mount()
    key('ArrowLeft')
    expect(selectedDays()).toEqual([12])
    expect(screen.getByText(`${label(12)}, today`)).toBeInTheDocument()
    key('ArrowLeft')
    expect(selectedDays()).toEqual([11])
    key('ArrowRight')
    key('ArrowRight')
    expect(selectedDays()).toEqual([12]) // none after today
    key('Home')
    expect(selectedDays()).toEqual([1])
    key('ArrowLeft')
    expect(selectedDays()).toEqual([1]) // none before the 1st
    key('End')
    expect(selectedDays()).toEqual([12])
  })

  it('goes back to the average on Escape or Close', () => {
    mount()
    key('ArrowLeft')
    key('Escape')
    expect(selectedDays()).toEqual([])
    expect(screen.getByText('a day on average')).toBeInTheDocument()
    key('ArrowLeft')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(selectedDays()).toEqual([])
  })

  it('says what the day came to and how it compares with the average', () => {
    mount()
    key('Home')
    for (let i = 0; i < 2; i++) key('ArrowRight') // the 3rd, ₹400 against ₹90.83
    const readout = document.querySelector('[aria-live="polite"]')!
    expect(readout).toHaveTextContent(label(3))
    expect(readout).toHaveTextContent('₹400')
    expect(readout).toHaveTextContent('4.4× your average') // 400 / 90.83
  })

  it('says nothing was spent for a day with no spending', () => {
    mount()
    key('End')
    key('ArrowLeft') // the 11th
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Nothing spent')
    expect(screen.getByText('Nothing spent on this day.')).toBeInTheDocument()
  })

  it('lifts the chosen column and dims the rest', () => {
    mount()
    key('End')
    expect(bar(12)!.style.opacity).toBe('1')
    expect(bar(3)!.style.opacity).toBe('0.35')
  })

  it('floats the amount above the chosen column, and not for a day with nothing spent', () => {
    mount()
    key('End')
    expect(screen.getByTestId('day-tag')).toHaveTextContent('₹50')
    key('ArrowLeft') // the 11th
    expect(screen.queryByTestId('day-tag')).toBeNull()
  })
})

describe('DayChart: what a day was made of', () => {
  const pickTenth = () => {
    key('End')
    key('ArrowLeft')
    key('ArrowLeft')
  }

  it('lists the biggest expenses of the day and says how many more there are', () => {
    mount()
    pickTenth()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Bravo')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
    expect(screen.queryByText('Delta')).toBeNull()
    expect(screen.getByText('and 1 more')).toBeInTheDocument()
  })

  it('opens just that day when asked, and only offers it for a day with spending', () => {
    const onPickDay = mount()
    pickTenth()
    fireEvent.click(screen.getByRole('button', { name: 'See these' }))
    expect(onPickDay).toHaveBeenCalledExactlyOnceWith('2026-10-10')
    key('ArrowRight') // the 11th, nothing spent
    expect(screen.queryByRole('button', { name: 'See these' })).toBeNull()
  })

  it('has no button to open a day when nothing was given to do it', () => {
    mount({ onPickDay: undefined })
    pickTenth()
    expect(screen.queryByRole('button', { name: 'See these' })).toBeNull()
  })

  it('steps to the day before or after from its own buttons, and stops at the ends', () => {
    mount()
    key('End')
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(selectedDays()).toEqual([11])
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
    expect(selectedDays()).toEqual([12])
    key('Home')
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeDisabled()
  })
})

describe('DayChart: what the days say', () => {
  it('says a few things about the pattern while no day is chosen', () => {
    mount({ budgetMinor: 310_000 })
    const list = screen.getByRole('list', { name: 'What the days say' })
    expect(list).toHaveTextContent('Biggest day')
    expect(list).toHaveTextContent('3 days above your daily budget of ₹100')
  })

  it('shows the biggest day on the chart when that sentence is tapped', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /Biggest day.*Show this day/ }))
    expect(selectedDays()).toEqual([3])
    // The sentences give way to the day.
    expect(screen.queryByRole('list', { name: 'What the days say' })).toBeNull()
  })

  it('has nothing to say when nothing was spent', () => {
    mount({ txs: [] })
    expect(screen.queryByRole('list', { name: 'What the days say' })).toBeNull()
  })
})

describe('DayChart: by category', () => {
  const slices = (day: number) => Array.from(bar(day)!.querySelectorAll<HTMLElement>('[data-slice]'))

  it('colours every column one colour by total, and by what it was spent on when asked', () => {
    mount()
    expect(screen.getByRole('button', { name: 'Total' })).toHaveAttribute('aria-pressed', 'true')
    expect(new Set(slices(10).map((s) => s.style.background)).size).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'By category' }))
    expect(screen.getByRole('button', { name: 'By category' })).toHaveAttribute('aria-pressed', 'true')
    expect(slices(10).map((s) => s.style.background).sort()).toEqual(['var(--s1)', 'var(--s2)'])
  })

  it('sizes each slice by its share of the day', () => {
    mount()
    // The 10th: ₹170 on food and ₹170 on travel.
    expect(slices(10).map((s) => parseFloat(s.style.height))).toEqual([50, 50])
  })

  it('shows what the colours mean, only in that view', () => {
    mount()
    expect(screen.queryByRole('list', { name: 'Colours by category' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'By category' }))
    const legend = screen.getByRole('list', { name: 'Colours by category' })
    expect(legend).toHaveTextContent('Food & Dining')
    expect(legend).toHaveTextContent('Travel')
  })

  it('keeps the chosen day when the view changes', () => {
    mount()
    key('End')
    fireEvent.click(screen.getByRole('button', { name: 'By category' }))
    expect(selectedDays()).toEqual([12])
  })
})

describe('DayChart: a finished month', () => {
  it('treats every day as having happened, with no marker for today', () => {
    mount({ monthKey: '2026-10', lastDay: null })
    expect(bar(31)).not.toBeNull()
    expect(screen.getByText('a day on average').nextElementSibling!.textContent).toMatch(/over 31 days/)
    key('End')
    expect(screen.queryByText(/, today/)).toBeNull()
  })
})

describe('DayChart: for everyone', () => {
  it('names the chart and says how to move through it', () => {
    mount()
    expect(plot()).toHaveAttribute('tabindex', '0')
    expect(plot().getAttribute('aria-label')).toMatch(/Daily spending in October 2026.*arrow keys/)
  })

  it('announces the reading politely', () => {
    mount()
    expect(document.querySelector('[aria-live="polite"]')).toBeInTheDocument()
  })

  it('has a table of the days with spending', () => {
    mount()
    // jsdom does not open a <details> from a click on its summary, so open it and tell React, as a browser does.
    const details = document.querySelector('details')!
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(6) // the header, then the 2nd, 3rd, 6th, 10th and 12th
  })
})

describe('DayChart: arriving only when seen', () => {
  class FakeObserver {
    static all: FakeObserver[] = []
    disconnected = false
    constructor(private cb: IntersectionObserverCallback) {
      FakeObserver.all.push(this)
    }
    observe() {}
    unobserve() {}
    disconnect() {
      this.disconnected = true
    }
    fire(isIntersecting: boolean) {
      this.cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
    }
  }
  afterEach(() => {
    vi.unstubAllGlobals()
    FakeObserver.all = []
  })

  it('holds every animation until the chart is in view', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    mount()
    const root = document.querySelector('.when-seen')!
    expect(root).toHaveAttribute('data-seen', 'false')
    act(() => FakeObserver.all.at(-1)!.fire(true))
    expect(root).toHaveAttribute('data-seen', 'true')
  })

  it('staggers the columns left to right, within about half a second in all', () => {
    mount()
    const delays = Array.from(plot().querySelectorAll<HTMLElement>('[data-bar]')).map((b) => parseFloat(b.style.getPropertyValue('--d')))
    expect(delays[0]).toBe(0)
    expect(delays.every((d, i) => i === 0 || d > delays[i - 1])).toBe(true)
    expect(delays.at(-1)!).toBeLessThanOrEqual(500)
  })
})

describe.skipIf(typeof PointerEvent === 'undefined')('DayChart: touch and mouse', () => {
  // 310 px across 31 columns: each is 10 px wide.
  const lay = () => {
    vi.spyOn(plot(), 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 310, height: 192, right: 310, bottom: 192, x: 0, y: 0, toJSON() {} })
  }
  const pointer = (type: string, x: number, pointerType = 'touch') => fireEvent(plot(), new PointerEvent(type, { bubbles: true, clientX: x, clientY: 80, pointerType }))

  it('reads the day under a finger, and a second tap on it puts it away', () => {
    mount()
    lay()
    pointer('pointerdown', 25) // column 2: the 3rd
    expect(selectedDays()).toEqual([3])
    pointer('pointerdown', 26)
    expect(selectedDays()).toEqual([])
  })

  it('follows a finger dragged across, and a wobble inside one column does not undo the tap', () => {
    mount()
    lay()
    pointer('pointerdown', 25)
    pointer('pointermove', 26)
    expect(selectedDays()).toEqual([3])
    pointer('pointermove', 95) // the 10th
    expect(selectedDays()).toEqual([10])
  })

  it('does not choose a day that has not happened', () => {
    mount()
    lay()
    pointer('pointerdown', 205) // the 21st
    expect(selectedDays()).toEqual([])
  })

  it('only looks while a mouse hovers, then goes back to what was kept', () => {
    mount()
    lay()
    pointer('pointerdown', 115, 'mouse') // keeps the 12th
    pointer('pointermove', 5, 'mouse') // looks at the 1st
    expect(selectedDays()).toEqual([1])
    pointer('pointerout', 5, 'mouse') // React's onPointerLeave comes from pointerout with nothing entered
    expect(selectedDays()).toEqual([12])
  })
})

describe('DayChart: one day that towers over the rest', () => {
  // The same month, with a day of ₹10,000 on the 6th: more than two and a half times anything else.
  const towering = [...txs, spend('2026-10-06', 10_000, 1, 'Laptop')]

  it('cuts that day short, with a break through it and its amount above it, so the others can be read', () => {
    mount({ txs: towering })
    expect(column(6)).toHaveAttribute('data-cut', 'true')
    expect(parseFloat(bar(6)!.style.height)).toBe(100)
    expect(bar(6)!.querySelector('[data-break]')).toBeInTheDocument()
    expect(within(column(6)).getByTestId('day-cut-label')).toHaveTextContent(/10.2K/i)
    // The others are drawn against the second biggest, not against the tower: ₹400 is no sliver.
    expect(parseFloat(bar(3)!.style.height)).toBeGreaterThan(30)
  })

  it('says in words that the day is cut short, with its amount', () => {
    mount({ txs: towering })
    expect(screen.getByTestId('day-cut-note')).toHaveTextContent(`${label(6)} (${formatMoney(1_020_000, 'INR')}) is cut short`)
  })

  it('leaves the average line out when it is above the top of the axis, rather than drawing it off the chart', () => {
    mount({ txs: towering })
    expect(screen.queryByTestId('day-average')).toBeNull()
  })

  it('shows the amount in the chosen day’s own tag, and not twice', () => {
    mount({ txs: towering })
    key('ArrowLeft') // keys start from today, the 12th
    for (let i = 0; i < 6; i++) key('ArrowLeft')
    expect(selectedDays()).toEqual([6])
    expect(within(column(6)).queryByTestId('day-cut-label')).toBeNull()
    expect(screen.getByTestId('day-tag')).toBeInTheDocument()
  })

  it('does not cut anything when no day towers, or when there are too few days to say what the rest are', () => {
    mount()
    expect(plot().querySelector('[data-cut]')).toBeNull()
    expect(screen.queryByTestId('day-cut-note')).toBeNull()
  })

  it('does not cut when there are only two days with spending, since there is no rest to protect', () => {
    mount({ txs: [spend('2026-10-02', 10, 1, 'A'), spend('2026-10-03', 10_000, 1, 'B')] })
    expect(plot().querySelector('[data-cut]')).toBeNull()
  })
})
