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

// 7,000, 8,000, 9,000, and 9,000 so far in October, with Food above its usual and Swiggy bought again and again.
const expenses = [
  tx('2026-07-10', 5000, 1, 'Groceries'), tx('2026-07-12', 2000, 2, 'Cab'),
  tx('2026-08-10', 6000, 1, 'Groceries'), tx('2026-08-12', 2000, 2, 'Cab'),
  tx('2026-09-03', 3000, 1, 'Groceries'), tx('2026-09-10', 2000, 1, 'Groceries'), tx('2026-09-15', 1000, 2, 'Cab'),
  tx('2026-09-25', 2000, 1, 'Groceries'), tx('2026-09-27', 1000, 2, 'Cab'),
  ...['2026-10-02', '2026-10-04', '2026-10-08', '2026-10-12', '2026-10-17'].map((d) => tx(d, 400, 1, 'Swiggy')),
  tx('2026-10-05', 3000, 1, 'Groceries'), tx('2026-10-06', 1500, 2, 'Cab'), tx('2026-10-15', 2500, 3, 'Shoes'),
]
const income = [tx('2026-10-01', 20000, 1, 'Employer', 'income')]
const rule = (over: Partial<Recurring>): Recurring => ({
  id: ++id, kind: 'expense', amountMinor: 1_250_000, currency: 'INR', categoryId: 1, merchant: 'Home loan', note: '', paymentMethod: '', frequency: 'monthly',
  nextDue: '2026-11-05', active: true, tag: 'loan', ...over,
})
const emiNow = rule({ nextDue: '2026-10-28' }) // due on the 28th: still to leave
const emiLater = rule({}) // due next month
const rent = rule({ merchant: 'Rent', amountMinor: 600_000, tag: 'bill', nextDue: '2026-10-25' })
const loggedEmi: Transaction = { ...tx('2026-10-05', 12500, 1, 'Home loan'), source: 'recurring' }

function mount(over: { open?: boolean; txs?: Transaction[]; budgetMinor?: number | null; recurring?: Recurring[]; month?: string; income?: Transaction[] } = {}) {
  const { open = true, txs = expenses, budgetMinor = null, recurring = [], month = '2026-10', income: inc = income } = over
  const onClose = vi.fn()
  const ledger = makeLedger({
    txs: [...txs, ...inc], expenses: txs, income: inc, categories, expenseCategories: categories, categoryById: new Map(categories.map((c) => [c.id, c])),
    budgetMinor, recurring, balanceSet: false,
  })
  render(<AiSheet open={open} onClose={onClose} ledger={ledger} month={month} today={today} />)
  return { onClose }
}

const dialog = () => screen.getByRole('dialog', { name: 'AI insights' })
const section = (labelledBy: string) => dialog().querySelector(`section[aria-labelledby="${labelledBy}"]`) as HTMLElement
const lead = () => section('ai-lead')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AiSheet: the page', () => {
  it('fills the screen, as a page, not a sheet that comes up from the bottom', () => {
    mount()
    expect(dialog()).toHaveClass('page')
    expect(dialog()).not.toHaveClass('sheet')
  })

  it('says which month it is about, and that it is still going', () => {
    mount()
    expect(dialog().querySelector('header')).toHaveTextContent('October 2026, so far')
    expect(dialog().querySelector('header')).toHaveTextContent('AI insights')
  })

  it('says it is worked out here and sent nowhere', () => {
    mount()
    expect(dialog()).toHaveTextContent('Worked out on this phone from your own entries. Nothing is sent anywhere.')
  })

  it('stays at the top while the page is read, so it can be closed from anywhere', () => {
    mount()
    expect(dialog().querySelector('header')).toHaveClass('sticky', 'top-0')
  })

  it('closes from its button', () => {
    const { onClose } = mount()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('reads nothing, and draws nothing, while it is closed', () => {
    mount({ open: false })
    expect(screen.queryByText('Where the money went')).toBeNull()
    expect(document.querySelector('.when-seen')).toBeNull()
  })

  it('says there is nothing to read yet when nothing has been spent', () => {
    mount({ txs: [], income: [] })
    expect(within(dialog()).getByText('Nothing has been spent in October yet.')).toBeInTheDocument()
    expect(within(dialog()).getByText(/there is nothing to read yet/)).toBeInTheDocument()
    expect(screen.queryByText('Where the money went')).toBeNull()
  })

  it('ends by saying these are estimates and not advice', () => {
    mount()
    expect(dialog()).toHaveTextContent('They are a guide, not financial advice.')
  })
})

describe('AiSheet: the sentence to open on', () => {
  it('says where the month is heading, and how that compares with last month', () => {
    mount()
    expect(within(lead()).getByRole('heading', { level: 3 })).toHaveTextContent(/^October is heading for about ₹13,\d{3}\.$/)
    expect(lead()).toHaveTextContent(/\d+% more than September, which ended at ₹9,000\./)
  })

  it('says how far inside the budget the month will end', () => {
    mount({ budgetMinor: 2_000_000 })
    expect(within(lead()).getByRole('heading', { level: 3 })).toHaveTextContent(/^October will probably end near ₹13,\d{3}, ₹6,\d{3} inside your budget\.$/)
    expect(lead()).toHaveAttribute('data-tone', 'good')
  })

  it('says how far over the budget it will end', () => {
    mount({ budgetMinor: 1_200_000 })
    expect(within(lead()).getByRole('heading', { level: 3 })).toHaveTextContent(/^October will probably end near ₹13,\d{3}, ₹1,\d{3} over your budget\.$/)
    expect(lead()).toHaveAttribute('data-tone', 'watch')
  })

  it('says it plainly when the budget has already been passed', () => {
    mount({ budgetMinor: 800_000 })
    expect(within(lead()).getByRole('heading', { level: 3 })).toHaveTextContent('You have already passed your ₹8,000 budget, by ₹1,000.')
    expect(lead()).toHaveAttribute('data-tone', 'bad')
  })

  it('says how much of the month leaves on its own, and how much of that is still to come', () => {
    mount({ recurring: [emiNow] })
    expect(lead()).toHaveTextContent('₹12,500 of that leaves on its own, all of it still to come.')
  })

  it('splits what leaves on its own into what has gone and what has not', () => {
    mount({ txs: [...expenses, loggedEmi], recurring: [emiLater, rent] })
    expect(lead()).toHaveTextContent('₹18,500 of that leaves on its own: ₹12,500 already, ₹6,000 still to come.')
  })

  it('speaks in the past tense of a month that is over', () => {
    mount({ month: '2026-09' })
    expect(within(lead()).getByRole('heading', { level: 3 })).toHaveTextContent('You spent ₹9,000 in September.')
    expect(lead()).toHaveTextContent('13% more than August.')
    expect(dialog().querySelector('header')).not.toHaveTextContent('so far')
  })
})

describe('AiSheet: the month as one bar', () => {
  const legend = () => within(screen.getByRole('list', { name: 'What the month is made of' }))

  it('names each part of the month and what it comes to, so colour is never all there is', () => {
    mount({ recurring: [emiNow] })
    expect(legend().getByText('Spent so far').closest('li')).toHaveTextContent('₹9,000')
    expect(legend().getByText('Still to leave on its own').closest('li')).toHaveTextContent('₹12,500')
    expect(legend().getByText('Likely to spend').closest('li')?.textContent).toMatch(/₹4,\d{3}/)
  })

  it('shows what has already left on its own apart from the everyday', () => {
    mount({ txs: [...expenses, loggedEmi], recurring: [emiLater] })
    expect(legend().getByText('Already left on its own').closest('li')).toHaveTextContent('₹12,500')
    expect(legend().getByText('Spent so far').closest('li')).toHaveTextContent('₹9,000')
  })

  it('draws a segment for each part, left to right', () => {
    mount({ recurring: [emiNow] })
    const segs = Array.from(screen.getByTestId('month-bar').querySelectorAll<HTMLElement>('[data-seg]')).map((s) => s.dataset.seg)
    expect(segs).toEqual(['everyday', 'autoDue', 'expected'])
  })

  it('sizes each in proportion to its amount', () => {
    mount({ recurring: [emiNow] })
    const grow = (seg: string) => Number(screen.getByTestId('month-bar').querySelector<HTMLElement>(`[data-seg="${seg}"]`)!.style.flexGrow)
    expect(grow('everyday')).toBe(900_000)
    expect(grow('autoDue')).toBe(1_250_000)
  })

  it('marks the budget, and shows room left under it', () => {
    mount({ budgetMinor: 5_000_000 })
    expect(screen.getByTestId('budget-marker')).toHaveTextContent('Budget ₹50K')
    expect(legend().getByText('Room left in the budget')).toBeInTheDocument()
    expect(screen.queryByTestId('over-zone')).toBeNull()
  })

  it('strikes through what is past the budget', () => {
    mount({ budgetMinor: 1_000_000 })
    expect(screen.getByTestId('over-zone')).toBeInTheDocument()
    expect(legend().queryByText('Room left in the budget')).toBeNull()
  })

  it('has no budget marker without a budget', () => {
    mount()
    expect(screen.queryByTestId('budget-marker')).toBeNull()
  })
})

describe('AiSheet: what needs attention', () => {
  it('puts what is urgent under the bar, in words', () => {
    mount({ budgetMinor: 800_000 })
    const list = within(dialog()).getByRole('list', { name: 'Needs attention' })
    expect(list.querySelector('[data-alert="over"]')).toHaveTextContent('You are over budget')
  })

  it('has no such list when nothing is wrong', () => {
    mount()
    expect(within(dialog()).queryByRole('list', { name: 'Needs attention' })).toBeNull()
  })

  it('warns when EMIs take too much of the income', () => {
    mount({ recurring: [emiNow] })
    expect(dialog().querySelector('[data-alert="emi"]')).toHaveTextContent('EMIs take 63% of your income')
  })
})

describe('AiSheet: what leaves on its own', () => {
  it('lists each payment with its kind, its date and where it stands', () => {
    mount({ recurring: [emiNow] })
    const row = dialog().querySelector('[data-deduction="due"]')!
    expect(row).toHaveTextContent('Home loan')
    expect(row).toHaveTextContent(/Loan EMI\. Due .*28.*, in 8 days/)
    expect(row).toHaveTextContent('₹12,500')
  })

  it('shows what has gone, with the day it left', () => {
    mount({ txs: [...expenses, loggedEmi], recurring: [emiLater] })
    expect(dialog().querySelector('[data-deduction="done"]')).toHaveTextContent(/Left on .*5/)
  })

  it('marks what is late, in words', () => {
    mount({ recurring: [rule({ merchant: 'Electricity', amountMinor: 300_000, tag: 'bill', nextDue: '2026-10-18' })] })
    expect(dialog().querySelector('[data-deduction="late"]')).toHaveTextContent(/Late, was due .*18/)
  })

  it('says how much leaves in the month, and how much is gone and to come', () => {
    mount({ txs: [...expenses, loggedEmi], recurring: [emiLater, rent] })
    expect(section('ai-auto')).toHaveTextContent('₹18,500 in October: ₹12,500 has left, ₹6,000 is still to come.')
  })

  it('draws the month as a line of days with each payment on its day', () => {
    mount({ txs: [...expenses, loggedEmi], recurring: [emiLater, rent] })
    const timeline = screen.getByTestId('deduction-timeline')
    expect(timeline.querySelectorAll('[data-mark="done"]')).toHaveLength(1)
    expect(timeline.querySelectorAll('[data-mark="due"]')).toHaveLength(1)
    expect(timeline).toHaveTextContent('today')
    // A picture: the list says every one in words.
    expect(timeline).toHaveAttribute('aria-hidden', 'true')
  })

  it('makes a bigger payment a bigger dot', () => {
    mount({ recurring: [emiNow, rule({ merchant: 'Gym', amountMinor: 100_000, tag: 'subscription', nextDue: '2026-10-25' })] })
    const dots = Array.from(screen.getByTestId('deduction-timeline').querySelectorAll<HTMLElement>('[data-mark="due"]')).map((d) => parseFloat(d.style.width))
    expect(Math.max(...dots)).toBeGreaterThan(Math.min(...dots))
  })

  it('marks money that comes in on its own, apart from what leaves', () => {
    mount({ recurring: [emiNow, rule({ merchant: 'Bonus', kind: 'income', amountMinor: 500_000, tag: 'income', nextDue: '2026-10-28' })] })
    expect(screen.getByTestId('deduction-timeline').querySelector('[data-mark="income-due"]')).toBeInTheDocument()
  })

  it('says what they come to in an average month, against the income, and what is left', () => {
    mount({ recurring: [emiNow] })
    expect(section('ai-auto').querySelector('[data-line="monthly"]')).toHaveTextContent('In an average month these come to ₹12,500, 63% of your income (EMIs alone 63%), which leaves ₹7,500 for everything else.')
  })

  it('names the next EMI, when, and how long', () => {
    mount({ recurring: [emiNow] })
    expect(section('ai-auto').querySelector('[data-line="next-emi"]')).toHaveTextContent(/Next EMI: Home loan, ₹12,500 on .*28.*, in 8 days\./)
  })

  it('invites you to set some up when none is, and says what that will do', () => {
    mount()
    expect(section('ai-auto')).toHaveTextContent('Nothing is set up to repeat yet.')
    expect(section('ai-auto')).toHaveTextContent('will count them on the day each one leaves')
  })

  it('has no such invitation for a month that is over', () => {
    mount({ month: '2026-09' })
    expect(section('ai-auto')).toBeNull()
  })
})

describe('AiSheet: where it is leaking', () => {
  const leakList = () => within(screen.getByRole('list', { name: 'Where money is leaking' }))
  const total = () => screen.getByTestId('leak-total')

  it('lists what would keep money, biggest first, each with a month and a year', () => {
    mount()
    const keys = Array.from(dialog().querySelectorAll('[data-leak]')).map((l) => (l as HTMLElement).dataset.leak)
    expect(keys).toEqual(['usual-1', 'repeat-swiggy', 'usual-2'])
    const food = dialog().querySelector('[data-leak="usual-1"]')!
    expect(food).toHaveTextContent('Food is running above your usual')
    expect(food).toHaveTextContent('₹1,750')
    expect(food).toHaveTextContent('a month')
    expect(food).toHaveTextContent('₹21,000 a year')
  })

  it('adds them up as what stopping all of them keeps, by the month and the year', () => {
    mount()
    expect(total()).toHaveTextContent('Stopping all of these keeps you')
    expect(total()).toHaveTextContent('₹2,575')
    expect(total()).toHaveTextContent('₹30,900 a year')
  })

  it('says where the month would end with those cuts', () => {
    mount()
    expect(total()).toHaveTextContent(/October would end near ₹1[01],\d{3}/)
  })

  it('has a switch on each, all on to begin with', () => {
    mount()
    const switches = leakList().getAllByRole('switch')
    expect(switches).toHaveLength(3)
    expect(switches.every((s) => (s as HTMLInputElement).checked)).toBe(true)
  })

  it('takes one out of the total when it is switched off, and puts it back when it is switched on', () => {
    mount()
    fireEvent.click(leakList().getByRole('switch', { name: 'Count Food is running above your usual' }))
    expect(dialog().querySelector('[data-leak="usual-1"]')).toHaveAttribute('data-on', 'false')
    expect(total()).toHaveTextContent('Stopping these 2 keeps you')
    expect(total()).toHaveTextContent('₹825')
    expect(total()).toHaveTextContent('₹9,900 a year')
    fireEvent.click(leakList().getByRole('switch', { name: 'Count Food is running above your usual' }))
    expect(total()).toHaveTextContent('₹2,575')
  })

  it('says so, and keeps nothing, when all are switched off', () => {
    mount()
    for (const sw of leakList().getAllByRole('switch')) fireEvent.click(sw)
    expect(total()).toHaveTextContent('Nothing switched on')
    expect(total()).toHaveTextContent('₹0')
    expect(total().textContent).not.toContain('would end near')
  })

  it('says nothing stands out when there is nothing to find', () => {
    mount({ txs: [tx('2026-10-05', 500, 1, 'Cafe')] })
    expect(section('ai-leaks')).toHaveTextContent('Nothing stands out.')
    expect(screen.queryByRole('list', { name: 'Where money is leaking' })).toBeNull()
  })

  it('keeps the aim to keep a fifth of what comes in, apart from the leaks', () => {
    mount({ income: [tx('2026-10-01', 14000, 1, 'Employer', 'income')] })
    expect(section('ai-leaks').querySelector('[data-line="goal"]')).toHaveTextContent('Aim to keep 20% of what comes in.')
  })
})

describe('AiSheet: how the month has gone', () => {
  it('draws the running total, with a label that says the same in words', () => {
    mount()
    const chart = within(section('ai-pace')).getByRole('img', { name: /Running total of spending in October: ₹9,000 so far, heading for about ₹13,\d{3}/ })
    expect(chart.getAttribute('aria-label')).toMatch(/Last month ended at ₹9,000/)
  })

  it('says what can be spent a day to stay inside the budget, after what is still to leave', () => {
    mount({ budgetMinor: 3_000_000, recurring: [emiNow] })
    expect(section('ai-pace')).toHaveTextContent(/About ₹772 a day for the rest of October keeps you inside your budget, after the ₹12,500 still to leave on its own\./)
  })

  it('says when the budget will run out at this pace', () => {
    mount({ budgetMinor: 1_200_000 })
    expect(section('ai-pace').querySelector('[data-budget="over"]')).toBeInTheDocument()
    expect(section('ai-pace')).toHaveTextContent('At this pace the budget runs out around the 27th.')
  })

  it('says when the budget was passed', () => {
    mount({ budgetMinor: 800_000 })
    expect(section('ai-pace')).toHaveTextContent('Your ₹8,000 budget was passed on the 15th.')
  })
})

describe('AiSheet: where the rest went', () => {
  it('draws the biggest categories as one bar and lists them with amount, share and how each moved', () => {
    mount()
    expect(screen.getByTestId('share-bar')).toBeInTheDocument()
    const food = dialog().querySelector('[data-category="1"]')!
    expect(food).toHaveTextContent('Food')
    expect(food).toHaveTextContent('₹5,000')
    expect(food).toHaveTextContent('56%')
    expect(food).toHaveTextContent('Same on September')
    expect(dialog().querySelector('[data-category="3"]')).toHaveTextContent('New on September')
    expect(dialog().querySelector('[data-category="2"]')).toHaveTextContent('▲ 50% on September')
  })

  it('shows up to five', () => {
    mount({ txs: [...expenses, tx('2026-10-16', 100, 1, 'Pen'), tx('2026-10-16', 50, 2, 'Bus')] })
    expect(dialog().querySelectorAll('[data-category]').length).toBeLessThanOrEqual(5)
  })
})

describe('AiSheet: what next month looks like', () => {
  it('says what it will probably cost, in the two parts it is made of', () => {
    mount({ recurring: [emiLater] })
    const o = screen.getByTestId('outlook')
    expect(o).toHaveTextContent('Next month will probably cost')
    expect(o.querySelector('[data-part="fixed"]')).toHaveTextContent('₹12,500')
    expect(o.querySelector('[data-part="everyday"]')).toHaveTextContent('₹8,833')
  })

  it('says the range it will probably land in', () => {
    mount()
    expect(screen.getByTestId('outlook').querySelector('[data-line="range"]')).toHaveTextContent(/Most likely between ₹\d,\d{3} and ₹\d,\d{3}\./)
  })

  it('says what a year of it comes to', () => {
    mount()
    expect(screen.getByTestId('outlook').querySelector('[data-line="year"]')).toHaveTextContent(/At this rate a year comes to about ₹[\d,]+\./)
  })

  it('draws the last five months, the latest as where it is heading, each read out with its amount', () => {
    mount()
    const items = within(within(dialog()).getByRole('list', { name: 'Spending by month' })).getAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(items[1]).toHaveAccessibleName('Jul: ₹7,000')
    expect(items[4].getAttribute('aria-label')).toMatch(/^Oct: ₹13,\d{3}, where it is heading$/)
  })

  it('says which way spending has been going', () => {
    mount()
    expect(dialog().querySelector('[data-trend="up"]')).toHaveTextContent('Spending has been rising by about 13% a month.')
  })

  it('says it needs more months when there are too few', () => {
    mount({ txs: expenses.filter((t) => t.date >= '2026-09') })
    expect(section('ai-ahead')).toHaveTextContent('A few more months of entries')
    expect(screen.queryByTestId('outlook')).toBeNull()
  })
})

describe('AiSheet: habits', () => {
  it('says a few things about the days', () => {
    mount()
    expect(section('ai-habits')).toHaveTextContent(/Biggest day: /)
  })
})

describe('AiSheet: the page holds still and the data draws', () => {
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

  it('does not slide its parts up as they appear', () => {
    mount()
    expect(document.querySelector('.reveal')).toBeNull()
  })

  it('holds each part until it is in view, and lets only that part go', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    mount({ recurring: [emiNow] })
    const parts = Array.from(document.querySelectorAll<HTMLElement>('.when-seen'))
    expect(parts.length).toBeGreaterThanOrEqual(6)
    expect(parts.every((p) => p.dataset.seen === 'false')).toBe(true)
    act(() => FakeObserver.all.find((o) => o.el === parts[0])!.fire())
    expect(parts[0].dataset.seen).toBe('true')
    expect(parts[1].dataset.seen).toBe('false')
  })

  it('draws the line, the columns, the bar and its segments, and staggers them', () => {
    mount({ recurring: [emiNow] })
    expect(dialog().querySelectorAll('.ai-draw').length).toBeGreaterThanOrEqual(2)
    expect(dialog().querySelectorAll('.ai-bar-up')).toHaveLength(5)
    const delays = Array.from(screen.getByTestId('month-bar').querySelectorAll<HTMLElement>('[data-seg]')).map((b) => parseFloat(b.style.getPropertyValue('--d')))
    expect(delays).toEqual([0, 170, 340])
  })

  it('pops each payment onto the timeline one after another', () => {
    mount({ recurring: [emiNow, rent] })
    const dots = Array.from(screen.getByTestId('deduction-timeline').querySelectorAll<HTMLElement>('.ai-pop[data-mark="due"]'))
    expect(dots).toHaveLength(2)
    const delays = dots.map((d) => parseFloat(d.style.getPropertyValue('--d')))
    expect(delays[1]).toBeGreaterThan(delays[0])
  })

  it('marks today on the line with a ring that breathes', () => {
    mount()
    expect(dialog().querySelector('.ai-pulse')).toBeInTheDocument()
  })
})
