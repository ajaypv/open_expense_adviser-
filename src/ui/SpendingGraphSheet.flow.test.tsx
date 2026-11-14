// @vitest-environment jsdom
import '../test/dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { SpendingGraphSheet } from './SpendingGraphSheet'
import { SpendingOverview } from './SpendingOverview'

const today = new Date(2026, 10, 14) // Sat 14 Nov 2026
const categories: Category[] = [{ id: 1, name: 'Food & Dining', color: 'var(--s1)' }]
const categoryById = new Map(categories.map((c) => [c.id, c]))

let id = 0
const tx = (date: string, rupees: number): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '', date,
  paymentMethod: '', source: 'manual', createdAt: id,
})
const expenses = [tx('2026-11-14', 120), tx('2026-11-14', 30), tx('2026-11-12', 450), tx('2026-11-09', 80), tx('2026-11-04', 200), tx('2026-10-30', 999)]
const inNovember = expenses.filter((t) => t.date.startsWith('2026-11'))

function mount(over: Partial<Parameters<typeof SpendingGraphSheet>[0]> = {}) {
  const props = { open: true, onClose: vi.fn(), expenses, monthTxs: inNovember, categoryById, month: '2026-11', today, currency: 'INR', budgetMinor: null, onPickDay: vi.fn(), ...over }
  render(<SpendingGraphSheet {...props} />)
  return { ...props, user: userEvent.setup() }
}

describe('SpendingGraphSheet: the week', () => {
  it('opens on the last seven days as columns, one for each day, and the Week chosen', () => {
    mount()
    expect(screen.getByRole('dialog', { name: 'Spending' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Week' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Month' })).not.toBeChecked()
    expect(screen.getByText('Last 7 days')).toBeInTheDocument()
    const group = screen.getByRole('group', { name: /day by day, for 7 days/ })
    expect(within(group).getAllByRole('button')).toHaveLength(7)
    expect(document.querySelectorAll('[data-bar]')).toHaveLength(7)
  })

  it('says what the seven days came to, and about how much a day, with the figures bold', () => {
    mount()
    const text = document.body.textContent!
    expect(text).toContain('₹680 in 7 days')
    expect(text).toContain('about ₹97 a day')
    expect(document.querySelector('b.num')!.textContent).toBe('₹680')
  })

  it('says how it compares with the seven days before', () => {
    mount()
    // 680 against 200 + 999 the days before: 4 Nov is before the seven, 30 Oct is before that.
    expect(screen.getByText(/more|less|The same as/)).toBeInTheDocument()
  })

  it('reads out today first, with what was spent and how many expenses, and a button to open them', async () => {
    const { user, onPickDay, onClose } = mount()
    const reading = document.querySelector('[data-reading]') as HTMLElement
    expect(within(reading).getByText('Today')).toBeInTheDocument()
    expect(reading.textContent).toContain('₹150')
    expect(reading.textContent).toContain('2 expenses')
    await user.click(within(reading).getByRole('button', { name: 'See them' }))
    expect(onClose).toHaveBeenCalled()
    expect(onPickDay).toHaveBeenCalledWith('2026-11-14')
  })

  it('lifts a day that is pressed and reads that one out, and has no button for a day with nothing', async () => {
    const { user } = mount()
    const thursday = screen.getByRole('button', { name: /Thursday.*₹450, 1 expense/ })
    await user.click(thursday)
    expect(thursday).toHaveAttribute('aria-pressed', 'true')
    const reading = document.querySelector('[data-reading]') as HTMLElement
    expect(reading.textContent).toContain('₹450')
    expect(reading.textContent).not.toMatch(/^Today/)
    expect(reading.textContent).toMatch(/Thursday/)
    await user.click(screen.getByRole('button', { name: /Wednesday.*nothing spent/ }))
    expect(within(document.querySelector('[data-reading]') as HTMLElement).getByText('Nothing spent')).toBeInTheDocument()
    expect(within(document.querySelector('[data-reading]') as HTMLElement).queryByRole('button', { name: 'See them' })).toBeNull()
  })

  it('draws the tallest column for the biggest day, and marks the average day with a dashed line', () => {
    mount()
    const heights = Object.fromEntries([...document.querySelectorAll<HTMLElement>('[data-bar]')].map((b) => [b.dataset.bar, b.style.height]))
    expect(heights['2026-11-12']).not.toBe(heights['2026-11-14'])
    expect(document.querySelector('[data-average]')).not.toBeNull()
  })

  it('goes back a week at a time, as far as the first expense and no further, and forward again', async () => {
    const { user } = mount()
    const before = screen.getByRole('button', { name: 'The week before' })
    const after = screen.getByRole('button', { name: 'The week after' })
    expect(after).toBeDisabled()
    await user.click(before)
    expect(screen.getByText(/^.+ to .+$/)).toBeInTheDocument()
    expect(screen.queryByText('Last 7 days')).toBeNull()
    expect(after).toBeEnabled()
    await user.click(before) // the week of 1 to 7 Nov, then the week of 25 to 31 Oct, which holds the first expense (30 Oct)
    expect(before).toBeDisabled()
    await user.click(after)
    expect(before).toBeEnabled()
  })

  it('says so when a week has nothing in it', async () => {
    const { user } = mount({ expenses: [tx('2026-09-01', 5), tx('2026-11-14', 10)], monthTxs: [tx('2026-11-14', 10)] })
    await user.click(screen.getByRole('button', { name: 'The week before' }))
    expect(screen.getByText('Nothing spent in these 7 days.')).toBeInTheDocument()
  })

  it('shows the last seven days of a month that is over', () => {
    mount({ month: '2026-10', monthTxs: [tx('2026-10-30', 999)] })
    expect(screen.getByText(/Oct 25 to Oct 31|25 Oct to 31 Oct/)).toBeInTheDocument()
  })
})

describe('SpendingGraphSheet: the month', () => {
  it('has the month’s day by day chart when Month is chosen, and the week again when Week is', async () => {
    const { user } = mount()
    await user.click(screen.getByRole('radio', { name: 'Month' }))
    expect(screen.getByRole('radio', { name: 'Month' })).toBeChecked()
    expect(screen.getByRole('region', { name: 'Month' })).toBeInTheDocument()
    expect(screen.getByText('November 2026')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Week' })).toBeNull()
    await user.click(screen.getByRole('radio', { name: 'Week' }))
    expect(screen.getByRole('region', { name: 'Week' })).toBeInTheDocument()
  })
})

describe('SpendingOverview: the headline opens the graph', () => {
  const overview = (onOpenGraph?: () => void) =>
    render(
      <SpendingOverview
        monthName="November" isCurrent totalMinor={23_000} deltaPct={null} partial={false} prevName="October" dailyAverageMinor={1_600}
        expenseCount={1} budgetMinor={null} currency="INR" periods={[]} privacy={false} onTogglePrivacy={() => {}} onPickPeriod={() => {}} onOpenGraph={onOpenGraph}
      />,
    )

  it('is one button, named with the month and the amount and what it does, that opens it when pressed', async () => {
    const open = vi.fn()
    overview(open)
    const button = screen.getByRole('button', { name: 'Spent so far in November: ₹230. See the graph' })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(within(button).getByText('Spent so far in November')).toBeInTheDocument()
    expect(button.querySelector('[data-graph-hint]')).not.toBeNull()
    await userEvent.setup().click(button)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('is only words, with no button, where there is no graph to open', () => {
    overview()
    expect(screen.queryByRole('button', { name: /See the graph/ })).toBeNull()
    expect(screen.getByText('Spent so far in November')).toBeInTheDocument()
  })

  it('leaves the button that hides amounts as its own button, not inside the headline', () => {
    overview(() => {})
    const hide = screen.getByRole('button', { name: 'Hide amounts' })
    expect(hide.closest('[data-headline]')).toBeNull()
  })
})
