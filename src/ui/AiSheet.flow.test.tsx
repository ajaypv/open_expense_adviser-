// @vitest-environment jsdom
import '../test/dom'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Category, Recurring, Transaction } from '../db/schema'
import { makeLedger } from '../test/ledger'
import { AiSheet } from './AiSheet'

const categories: Category[] = [
  { id: 1, name: 'Food', color: 'var(--s1)' },
  { id: 2, name: 'Travel', color: 'var(--s2)' },
  { id: 3, name: 'Shopping', color: 'var(--s3)' },
]
const today = new Date(2026, 9, 20) // Tue 20 Oct 2026

let id = 0
const tx = (date: string, rupees: number, categoryId: number, merchant: string, kind: Transaction['kind'] = 'expense'): Transaction => ({
  id: ++id, kind, amountMinor: rupees * 100, currency: 'INR', categoryId, merchant, note: '', date, paymentMethod: '', source: 'manual', createdAt: id,
})

// ₹7,000, ₹8,000, ₹9,000, and ₹9,000 so far in October, with Food above its usual.
const expenses = [
  tx('2026-07-10', 5000, 1, 'Groceries'), tx('2026-07-12', 2000, 2, 'Cab'),
  tx('2026-08-10', 6000, 1, 'Groceries'), tx('2026-08-12', 2000, 2, 'Cab'),
  tx('2026-09-03', 3000, 1, 'Groceries'), tx('2026-09-10', 2000, 1, 'Groceries'), tx('2026-09-15', 1000, 2, 'Cab'),
  tx('2026-09-25', 2000, 1, 'Groceries'), tx('2026-09-27', 1000, 2, 'Cab'),
  ...['2026-10-02', '2026-10-04', '2026-10-08', '2026-10-12', '2026-10-17'].map((d) => tx(d, 400, 1, 'Swiggy')),
  tx('2026-10-05', 3000, 1, 'Groceries'), tx('2026-10-06', 1500, 2, 'Cab'), tx('2026-10-15', 2500, 3, 'Shoes'),
]
const income = [tx('2026-10-01', 20000, 1, 'Employer', 'income')]
const emiNow: Recurring = { id: 5, kind: 'expense', amountMinor: 1_250_000, currency: 'INR', categoryId: 1, merchant: 'Home loan', note: '', paymentMethod: '', frequency: 'monthly', nextDue: '2026-10-28', active: true, tag: 'loan' }
const emi: Recurring = { id: 1, kind: 'expense', amountMinor: 1_250_000, currency: 'INR', categoryId: 1, merchant: 'Home loan', note: '', paymentMethod: '', frequency: 'monthly', nextDue: '2026-11-05', active: true, tag: 'loan' }

function mount(over: { open?: boolean; txs?: Transaction[]; budgetMinor?: number | null; recurring?: Recurring[]; month?: string } = {}) {
  const { open = true, txs = expenses, budgetMinor = null, recurring = [], month = '2026-10' } = over
  const onClose = vi.fn()
  const ledger = makeLedger({
    txs: [...txs, ...income], expenses: txs, income, categories, expenseCategories: categories, categoryById: new Map(categories.map((c) => [c.id, c])),
    budgetMinor, recurring, balanceSet: false,
  })
  render(<AiSheet open={open} onClose={onClose} ledger={ledger} month={month} today={today} />)
  return { onClose }
}

const dialog = () => screen.getByRole('dialog', { name: 'AI insights' })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AiSheet: what it is', () => {
  it('is named AI insights, and says it is worked out here and sent nowhere', () => {
    mount()
    expect(dialog()).toHaveTextContent('Worked out on this phone from your own entries. Nothing is sent anywhere.')
  })

  it('closes from its button', () => {
    const { onClose } = mount()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('reads nothing, and draws nothing, while it is closed', () => {
    mount({ open: false })
    expect(screen.queryByText('Where the money went')).toBeNull()
    expect(document.querySelector('.reveal')).toBeNull()
  })

  it('says there is nothing to read yet when nothing has been spent', () => {
    mount({ txs: [] })
    expect(within(dialog()).getByText('Nothing has been spent in October yet.')).toBeInTheDocument()
    expect(within(dialog()).getByText(/there is nothing to read yet/)).toBeInTheDocument()
    expect(screen.queryByText('Where the money went')).toBeNull()
  })

  it('does not say a word about regular payments it cannot see', () => {
    mount()
    expect(screen.queryByText('Coming up')).toBeNull()
  })
})

describe('AiSheet: what has happened', () => {
  it('says how the month is going, in a word and a mark', () => {
    mount()
    const pill = dialog().querySelector('[data-tone]')!
    expect(pill).toHaveAttribute('data-tone', 'watch')
    expect(pill).toHaveTextContent('Spending more than September')
  })

  it('states what was spent, in the headline and in words', () => {
    mount()
    expect(within(dialog()).getByText('You have spent ₹9,000 in October so far, about ₹450 a day over 20 days.')).toBeInTheDocument()
    expect(within(dialog()).getByText('That is 50% more than the same days in September.')).toBeInTheDocument()
  })

  it('shows the daily average, the change on last month and what was kept', () => {
    mount()
    const stats = within(dialog()).getByText('A day').closest('dl')!
    expect(stats).toHaveTextContent('₹450')
    expect(stats).toHaveTextContent('Against September')
    expect(stats).toHaveTextContent('▲ 50%')
    expect(stats).toHaveTextContent('Kept')
    expect(stats).toHaveTextContent('₹11,000')
  })
})

describe('AiSheet: where it is heading', () => {
  it('says where the month will end, and draws the line with a label that says the same', () => {
    mount()
    expect(dialog().querySelector('[data-projection]')).toHaveTextContent(/At this pace October ends near ₹13,\d{3}, against ₹9,000 in September\./)
    const chart = within(dialog()).getByRole('img', { name: /Running total of spending in October: ₹9,000 so far, heading for about ₹13,\d{3}/ })
    expect(chart.getAttribute('aria-label')).toMatch(/Last month ended at ₹9,000/)
  })

  it('says whether the budget will hold, and what can be spent a day', () => {
    mount({ budgetMinor: 2_000_000 })
    const note = dialog().querySelector('[data-budget]')!
    expect(note).toHaveAttribute('data-budget', 'inside')
    expect(note).toHaveTextContent('On course to stay inside your ₹20,000 budget')
    expect(within(dialog()).getByText(/About ₹1,000 a day for the rest of October keeps you inside it/)).toBeInTheDocument()
  })

  it('warns when the pace will pass the budget, with the day', () => {
    mount({ budgetMinor: 1_200_000 })
    const note = dialog().querySelector('[data-budget]')!
    expect(note).toHaveAttribute('data-budget', 'over')
    expect(note).toHaveTextContent('You would pass your ₹12,000 budget around the 27th')
  })

  it('says it plainly when the budget is already passed', () => {
    mount({ budgetMinor: 800_000 })
    expect(dialog().querySelector('[data-budget="over"]')).toHaveTextContent('You are ₹1,000 over your ₹8,000 budget, passed on the 15th.')
  })

  it('draws a budget line only when there is a budget', () => {
    mount()
    expect(within(dialog()).getByRole('img', { name: /Running total/ }).textContent).not.toContain('budget')
  })

  it('says how a finished month ended, and projects nothing', () => {
    mount({ month: '2026-09' })
    expect(within(dialog()).getByText('How it ended')).toBeInTheDocument()
    expect(within(dialog()).queryByText(/will end near/)).toBeNull()
  })
})

describe('AiSheet: where the money went', () => {
  it('ranks the categories with amount, share and how each moved', () => {
    mount()
    const food = dialog().querySelector('[data-category="1"]')!
    expect(food).toHaveTextContent('Food')
    expect(food).toHaveTextContent('₹5,000')
    expect(food).toHaveTextContent('56%')
    expect(food).toHaveTextContent('Same on September')
    expect(dialog().querySelector('[data-category="3"]')).toHaveTextContent('New on September')
    expect(dialog().querySelector('[data-category="2"]')).toHaveTextContent('▲ 50% on September')
  })

  it('shows only the three biggest', () => {
    mount({ txs: [...expenses, tx('2026-10-16', 100, 1, 'Pen'), tx('2026-10-16', 50, 2, 'Bus')] })
    expect(dialog().querySelectorAll('[data-category]')).toHaveLength(3)
  })
})

describe('AiSheet: how you could save', () => {
  it('lists what it found, each with what it would keep a month', () => {
    mount()
    const tips = Array.from(dialog().querySelectorAll('[data-tip]')).map((t) => (t as HTMLElement).dataset.tip)
    expect(tips).toContain('usual-1')
    expect(tips).toContain('repeat-swiggy')
    const food = dialog().querySelector('[data-tip="usual-1"]')!
    expect(food).toHaveTextContent('Food is running above your usual')
    expect(food).toHaveTextContent('Keep about ₹1,750 a month')
  })

  it('adds them up as what could be kept in all', () => {
    mount()
    const section = dialog().querySelector('section[aria-labelledby="ai-save"]')!
    expect(section).toHaveTextContent(/up to ₹[\d,]+ a month/)
  })

  it('says nothing stands out when there is nothing to find', () => {
    mount({ txs: [tx('2026-10-05', 500, 1, 'Cafe')] })
    expect(within(dialog()).getByText(/Nothing stands out/)).toBeInTheDocument()
  })

  it('names the subscriptions when there are some', () => {
    mount({ txs: [tx('2026-10-05', 500, 1, 'Cafe')], recurring: [{ ...emi, id: 2, merchant: 'Netflix', amountMinor: 49_900, tag: 'subscription', nextDue: '2026-10-25' }] })
    expect(dialog().querySelector('[data-tip="subscriptions"]')).toHaveTextContent('₹499 a month')
  })
})

describe('AiSheet: month by month', () => {
  it('draws the last five months, the latest as where it is heading, each read out with its amount', () => {
    mount()
    const list = within(dialog()).getByRole('list', { name: 'Spending by month' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(items[1]).toHaveAccessibleName('Jul: ₹7,000')
    expect(items[4].getAttribute('aria-label')).toMatch(/^Oct: ₹13,\d{3}, where it is heading$/)
  })

  it('says which way spending has been going and where next month may land', () => {
    mount()
    expect(dialog().querySelector('[data-trend="up"]')).toHaveTextContent('Spending has been rising by about 13% a month.')
    expect(within(dialog()).getByText('If that carries on, next month could come to about ₹8,833.')).toBeInTheDocument()
  })
})

describe('AiSheet: habits and what is coming', () => {
  it('says a few things about the habits', () => {
    mount()
    expect(within(dialog()).getByText(/^Biggest day: /)).toBeInTheDocument()
  })

  it('shows regular payments and EMIs when some are set up', () => {
    mount({ recurring: [emiNow] })
    const section = dialog().querySelector('section[aria-labelledby="ai-commit"]')!
    expect(section).toHaveTextContent('Regular payments and EMIs')
    expect(section).toHaveTextContent('Regular a month₹12,500')
    expect(section).toHaveTextContent('EMIs a month₹12,500')
    expect(section).toHaveTextContent('Still due₹12,500')
  })

  it('names the next EMI and what share of the income the payments take', () => {
    mount({ recurring: [emiNow] })
    const section = dialog().querySelector('section[aria-labelledby="ai-commit"]')!
    expect(section.querySelector('[data-line="next-emi"]')).toHaveTextContent(/Next EMI: Home loan, ₹12,500 on .*28.*, in 8 days\./)
    // ₹12,500 of the ₹20,000 that came in: 63%, all of it EMIs.
    expect(section.querySelector('[data-line="share"]')).toHaveTextContent('63% of your income goes on regular payments, 63% of it on EMIs, leaving ₹7,500 for everything else.')
  })

  it('counts the payments still to leave in where the month is heading', () => {
    mount({ recurring: [emiNow] })
    expect(dialog().querySelector('[data-committed]')).toHaveTextContent('Includes ₹12,500 of regular payments still to leave, on their due days.')
    expect(dialog().querySelector('[data-line="left"]')).toHaveTextContent('1 payment still to leave this month')
  })

  it('warns when EMIs take too much of the income', () => {
    mount({ recurring: [emiNow] })
    expect(dialog().querySelector('[data-tip="emi"]')).toHaveTextContent('EMIs take 63% of your income')
  })

  it('has no such part when no regular payment is going out', () => {
    mount()
    expect(dialog().querySelector('section[aria-labelledby="ai-commit"]')).toBeNull()
  })
})

describe('AiSheet: it plays as it is scrolled to', () => {
  class FakeObserver {
    static all: FakeObserver[] = []
    constructor(private cb: IntersectionObserverCallback, public el?: Element) {
      FakeObserver.all.push(this)
    }
    observe(el: Element) {
      this.el = el
    }
    unobserve() {}
    disconnect() {}
    fire() {
      this.cb([{ isIntersecting: true, target: this.el } as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver)
    }
  }
  afterEach(() => {
    FakeObserver.all = []
  })

  it('holds each part until it is in view, and lets only that part go', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    mount()
    const parts = Array.from(document.querySelectorAll<HTMLElement>('.reveal'))
    expect(parts.length).toBeGreaterThan(6)
    expect(parts.every((p) => p.dataset.seen === 'false')).toBe(true)
    const first = FakeObserver.all.find((o) => o.el === parts[0])!
    act(() => first.fire())
    expect(parts[0].dataset.seen).toBe('true')
    expect(parts[1].dataset.seen).toBe('false')
  })

  it('draws the line, the columns and the bars, and staggers them', () => {
    mount()
    expect(dialog().querySelectorAll('.ai-draw').length).toBeGreaterThanOrEqual(2)
    expect(dialog().querySelectorAll('.ai-bar-up')).toHaveLength(5)
    const delays = Array.from(dialog().querySelectorAll<HTMLElement>('.ai-bar-up')).map((b) => parseFloat(b.style.getPropertyValue('--d')))
    expect(delays).toEqual([0, 90, 180, 270, 360])
    expect(dialog().querySelectorAll('.ai-bar-right').length).toBe(3)
  })

  it('marks today on the line with a ring that breathes', () => {
    mount()
    expect(dialog().querySelector('.ai-pulse')).toBeInTheDocument()
  })
})
