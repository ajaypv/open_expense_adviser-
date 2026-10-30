// @vitest-environment jsdom
import './test/dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { reloadDisplay } from './data/display'
import { localDateString } from './db/money'
import { db } from './db/schema'
import { monthLabel } from './insights/aggregates'
import { APP_VERSION } from './pwa/version'
import { enableLock, getLockState, lockNow, resetLockForTests } from './security/lock'

// The service-worker helper only exists in a real build.
vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }))

beforeEach(() => {
  reloadDisplay()
  resetLockForTests()
})

const onboard = () =>
  db.settings.bulkPut([
    { key: 'onboarded', value: true },
    { key: 'lastSeenVersion', value: APP_VERSION },
  ])

const tx = (over: Record<string, unknown> = {}) =>
  db.transactions.add({
    kind: 'expense', amountMinor: 45_000, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '', date: localDateString(),
    paymentMethod: '', source: 'manual', createdAt: Date.now() + Math.random(), ...over,
  } as never)

const open = async () => {
  await onboard()
  const user = userEvent.setup()
  render(<App />)
  return user
}
const nav = (name: string) => screen.getByRole('navigation', { name: 'Main' }).querySelector<HTMLButtonElement>(`button:has(span.short\\:sr-only)`)!.parentElement && within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name })

describe('First launch', () => {
  it('welcomes a new person, and skipping leaves the app ready to use', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('dialog', { name: 'Welcome' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    await waitFor(async () => expect((await db.settings.get('onboarded'))?.value).toBe(true))
    expect(await screen.findByText('Let’s add your first one.')).toBeInTheDocument()
  })

  it('saves the currency, balance and budget typed in the welcome', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('dialog', { name: 'Welcome' })
    await user.click(screen.getByRole('button', { name: 'Currency' }))
    await user.click(await screen.findByRole('radio', { name: /USD/ }))
    await user.type(screen.getByLabelText(/Money you have today/), '5,000')
    await user.type(screen.getByLabelText(/Monthly budget/), '30000')
    await user.click(screen.getByRole('button', { name: 'Get started' }))
    // The last thing the welcome records is the version seen, so wait for that before checking the rest.
    await waitFor(async () => expect((await db.settings.get('lastSeenVersion'))?.value).toBe(APP_VERSION))
    expect((await db.settings.get('currency'))?.value).toBe('USD')
    expect((await db.accounts.toArray())[0].openingMinor).toBe(500_000)
    expect(await db.budgets.toArray()).toMatchObject([{ categoryId: null, monthlyLimitMinor: 3_000_000 }])
  })

  it('refuses a balance that is not a number', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('dialog', { name: 'Welcome' })
    await user.type(screen.getByLabelText(/Money you have today/), 'lots')
    await user.click(screen.getByRole('button', { name: 'Get started' }))
    expect(await screen.findByText('Use numbers only. Leave a box empty to skip it.')).toBeInTheDocument()
    expect(await db.settings.get('onboarded')).toBeUndefined()
  })

  it('does not welcome someone who already has data, and shows what is new instead', async () => {
    await tx()
    render(<App />)
    expect(await screen.findByRole('dialog', { name: `What’s new in ${APP_VERSION}` })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Welcome' })).toBeNull()
  })

  it('shows what is new once, and not again after it is closed', async () => {
    await tx()
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Got it' }))
    await waitFor(async () => expect((await db.settings.get('lastSeenVersion'))?.value).toBe(APP_VERSION))
  })
})

describe('Logging from the input bar', () => {
  const type = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
    await user.type(await screen.findByLabelText('Add a transaction'), `${text}{Enter}`)
  }

  it('turns a sentence into an expense and says what was added', async () => {
    const user = await open()
    await type(user, '450 lunch at Cafe')
    await waitFor(async () => expect(await db.transactions.count()).toBe(1))
    expect((await db.transactions.toArray())[0]).toMatchObject({ kind: 'expense', amountMinor: 45_000, source: 'chat', date: localDateString() })
    expect(await screen.findByText(/Added ₹450 to/)).toBeInTheDocument()
    expect(screen.getByLabelText('Add a transaction')).toHaveValue('') // the bar clears
  })

  it('keeps the currency that was typed, so a dollar is not saved as a rupee', async () => {
    const user = await open()
    await type(user, '$5 coffee')
    await waitFor(async () => expect(await db.transactions.count()).toBe(1))
    expect((await db.transactions.toArray())[0]).toMatchObject({ amountMinor: 500, currency: 'USD' })
    expect(await screen.findByText(/Added \$5(\.00)? to/)).toBeInTheDocument()
  })

  it('says which day it filed the entry under when that is not today', async () => {
    const user = await open()
    await type(user, 'Uber 230 yesterday')
    expect(await screen.findByText(/Added ₹230 to .*, yesterday/)).toBeInTheDocument()
  })

  it("shows what was spent today on Home as soon as it is logged, and not yesterday's", async () => {
    const user = await open()
    await type(user, '450 lunch at Cafe')
    expect(await screen.findByRole('button', { name: 'Today: ₹450. See these transactions' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Yesterday: ₹0' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Last 7 days: ₹450. See these transactions' })).toBeInTheDocument()
  })

  it('reads several entries at once', async () => {
    const user = await open()
    await type(user, 'coffee 120, lunch 340')
    await waitFor(async () => expect(await db.transactions.count()).toBe(2))
    expect(await screen.findByText('Added 2 transactions, ₹460 spent')).toBeInTheDocument()
  })

  it('understands received money', async () => {
    const user = await open()
    await type(user, 'Salary 80,000')
    await waitFor(async () => expect(await db.transactions.count()).toBe(1))
    expect((await db.transactions.toArray())[0]).toMatchObject({ kind: 'income', amountMinor: 8_000_000 })
    expect(await screen.findByText('Received ₹80,000')).toBeInTheDocument()
  })

  it('undoes an entry from the message', async () => {
    const user = await open()
    await type(user, '450 lunch')
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await db.transactions.count()).toBe(0)) // gone, not parked in the trash
  })

  it('asks for an amount when there is none, and keeps what was typed', async () => {
    const user = await open()
    await type(user, 'lunch at the cafe')
    expect(await screen.findByText('I couldn’t find an amount. Try “450 lunch at Cafe”.')).toBeInTheDocument()
    expect(await db.transactions.count()).toBe(0)
    expect(screen.getByLabelText('Add a transaction')).toHaveValue('lunch at the cafe')
  })

  it('learns the category chosen for a merchant', async () => {
    await tx({ merchant: 'Chai Point', categoryId: 2, createdAt: 1 })
    await tx({ merchant: 'Chai Point', categoryId: 2, createdAt: 2 })
    const user = await open()
    await type(user, '60 Chai Point')
    await waitFor(async () => expect(await db.transactions.count()).toBe(3))
    const added = (await db.transactions.toArray()).find((t) => t.source === 'chat')!
    expect(added.categoryId).toBe(2)
  })

  it('does not send an empty message', async () => {
    const user = await open()
    expect(await screen.findByRole('button', { name: 'Send' })).toBeDisabled()
    await user.type(screen.getByLabelText('Add a transaction'), '   ')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('opens the full form from the plus button', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Add with the full form' }))
    expect(await screen.findByRole('dialog', { name: 'New transaction' })).toBeInTheDocument()
  })
})

describe('Moving around', () => {
  it('shows each tab and marks the current one', async () => {
    await tx()
    const user = await open()
    await screen.findByText('Recent transactions')
    for (const [name, heading] of [['Activity', /Filters/], ['Insights', /./], ['Settings', 'Appearance']] as const) {
      await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name }))
      expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name })).toHaveAttribute('aria-current', 'page')
      if (typeof heading === 'string') expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    }
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Home' }))
    expect(await screen.findByText('Recent transactions')).toBeInTheDocument()
  })

  it('does not let any screen slide sideways, however wide something inside it is', async () => {
    await open()
    await screen.findByText('Let’s add your first one.')
    // jsdom has no layout, so this checks the rule that stops it: the scrolling area only moves up and down.
    expect(document.querySelector('main')).toHaveClass('overflow-y-auto', 'overflow-x-hidden')
  })

  it('opens a transaction to edit from the list', async () => {
    await tx({ merchant: 'Cafe' })
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Edit spent Cafe/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit transaction' })
    expect(within(sheet).getByLabelText('Merchant')).toHaveValue('Cafe')
  })

  it('shows another month from the month picker', async () => {
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    await tx({ merchant: 'Old', date: localDateString(prev) })
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Choose a month/ }))
    if (prev.getFullYear() !== now.getFullYear()) await user.click(screen.getByRole('button', { name: 'Previous year' }))
    await user.click(screen.getByRole('button', { name: new RegExp(`^${monthLabel(localDateString(prev).slice(0, 7))}`) }))
    expect(await screen.findByText(/Spent in /)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'This month' })).toBeInTheDocument()
  })
})

describe('Hide amounts', () => {
  it('masks amounts everywhere without rebuilding the screen, so the page and open sections stay as they were', async () => {
    await tx({ merchant: 'Cafe', amountMinor: 45_000 })
    const user = await open()
    await screen.findByText('Recent transactions')
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }))
    await screen.findByRole('heading', { name: 'Appearance' })

    // Something half-way down the page that a rebuild would lose: an opened section and the scroll position.
    await user.click(screen.getByText('Limits by category'))
    const details = screen.getByText('Limits by category').closest('details')!
    expect(details.open).toBe(true)
    const main = document.querySelector('main')!
    main.scrollTop = 420

    await user.click(screen.getByRole('switch', { name: /Hide amounts/ }))

    expect(document.querySelector('main')).toBe(main) // the same element: not remounted
    expect(main.isConnected).toBe(true)
    expect(main.scrollTop).toBe(420)
    expect(details.isConnected).toBe(true)
    expect(details.open).toBe(true)
    expect(screen.getByRole('switch', { name: /Hide amounts/ })).toBeChecked()

    // Amounts on the other screens are masked straight away.
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Home' }))
    await waitFor(() => expect(document.querySelector('main')!.textContent).toMatch(/•{4}/))
    expect(document.querySelector('main')!.textContent).not.toContain('450')
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Activity' }))
    await waitFor(() => expect(document.querySelector('main')!.textContent).toMatch(/•{4}/))
    expect(document.querySelector('main')!.textContent).not.toContain('450')
  })

  it('shows amounts again when switched back off, in place', async () => {
    await tx({ merchant: 'Cafe', amountMinor: 45_000 })
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Hide amounts' }))
    await waitFor(() => expect(document.querySelector('main')!.textContent).toMatch(/•{4}/))
    const main = document.querySelector('main')!
    await user.click(screen.getByRole('button', { name: 'Show amounts' }))
    await waitFor(() => expect(document.querySelector('main')!.textContent).toContain('₹450'))
    expect(document.querySelector('main')).toBe(main)
  })
})

describe('App lock', () => {
  it('shows only the PIN screen while locked, then the app once unlocked', async () => {
    await onboard()
    await tx()
    await enableLock('1234', 60)
    lockNow()
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Enter your PIN' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    expect(screen.queryByText('Recent transactions')).toBeNull()
    await user.type(screen.getByLabelText('PIN'), '1234')
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(getLockState().locked).toBe(false)
  })
})

describe('Goals from Home', () => {
  const goalsButton = () => screen.findByRole('button', { name: /^Goals\./ })

  it('opens from the button at the top right of Home, and is not a tab', async () => {
    await tx()
    await db.goals.add({ name: 'Phone', targetMinor: 6_000_000, savedMinor: 0, createdAt: 1 } as never)
    const user = await open()
    await screen.findByText('Recent transactions')
    // The goals sit in a sheet that is closed, so nothing about them can be reached on the page itself.
    expect(screen.queryByRole('button', { name: 'Edit goal Phone' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Goals' })).toBeNull()
    expect(within(screen.getByRole('navigation', { name: 'Main' })).queryByRole('button', { name: 'Goals' })).toBeNull()
    await user.click(await goalsButton())
    const sheet = await screen.findByRole('dialog', { name: 'Goals' })
    expect(within(sheet).getByText('Phone')).toBeInTheDocument()
  })

  it('glows once when the app opens, and not again when coming back to Home', async () => {
    await tx()
    const user = await open()
    expect(await goalsButton()).toHaveClass('goal-glow')
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }))
    await screen.findByRole('heading', { name: 'Appearance' })
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Home' }))
    expect(await goalsButton()).not.toHaveClass('goal-glow')
  })

  it('makes a goal and sets money aside for it, and the button keeps count', async () => {
    await tx()
    const user = await open()
    await user.click(await goalsButton())
    const overview = await screen.findByRole('dialog', { name: 'Goals' })
    await user.click(within(overview).getByRole('button', { name: 'Set a goal' }))
    const sheet = await screen.findByRole('dialog', { name: 'New goal' })
    await user.type(within(sheet).getByLabelText('What are you saving for?'), 'Goa trip')
    await user.type(within(sheet).getByLabelText('How much does it cost?'), '25,000')
    await user.click(within(sheet).getByRole('button', { name: 'Save goal' }))
    expect(await within(overview).findByText('Goa trip')).toBeInTheDocument()
    expect(within(overview).getAllByText('saved of ₹25,000')).toHaveLength(2) // in the total and on the goal: the overview stayed open behind the form
    expect(within(overview).getAllByText('₹25,000 to go').length).toBeGreaterThan(0) // the new goal, with nothing saved yet

    await user.click(within(overview).getByRole('button', { name: 'Add money to Goa trip' }))
    const money = await screen.findByRole('dialog', { name: 'Add money to Goa trip' })
    await user.type(within(money).getByLabelText('Amount'), '5000')
    await user.click(within(money).getByRole('button', { name: 'Add to goal' }))
    await waitFor(async () => expect((await db.goals.toArray())[0].savedMinor).toBe(500_000))
    expect(await within(overview).findByRole('progressbar', { name: 'Goa trip saved' })).toHaveAttribute('aria-valuenow', '20')
    expect((await within(overview).findAllByText('₹20,000 to go')).length).toBeGreaterThan(0) // updated in place, on the goal and in the total
    expect(await screen.findByRole('button', { name: 'Goals. 1 goal, 20% saved' })).toBeInTheDocument()
  })

  it('changes a goal when it is tapped', async () => {
    await tx()
    await db.goals.add({ name: 'Phone', targetMinor: 6_000_000, savedMinor: 0, createdAt: 1 } as never)
    const user = await open()
    await user.click(await goalsButton())
    await user.click(await screen.findByRole('button', { name: 'Edit goal Phone' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit goal' })
    expect(within(sheet).getByLabelText('What are you saving for?')).toHaveValue('Phone')
  })

  it('works before anything has been logged', async () => {
    const user = await open()
    await user.click(await goalsButton())
    expect(await screen.findByText('Saving for something?')).toBeInTheDocument()
  })

  it('closes and leaves Home as it was', async () => {
    await tx()
    const user = await open()
    await user.click(await goalsButton())
    const overview = await screen.findByRole('dialog', { name: 'Goals' })
    await user.click(within(overview).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Goals' })).toBeNull()
    expect(screen.getByText('Recent transactions')).toBeInTheDocument()
  })
})

describe('The backup reminder', () => {
  it('shows on the month in progress, and stays out of the way when looking back at an old one', async () => {
    await db.transactions.bulkAdd(
      Array.from({ length: 12 }, (_, i) => ({
        kind: 'expense', amountMinor: 1000, currency: 'INR', categoryId: 1, merchant: `Shop ${i}`, note: '', date: localDateString(),
        paymentMethod: '', source: 'manual', createdAt: 1000 + i,
      })) as never,
    )
    const user = await open()
    expect(await screen.findByRole('region', { name: 'Backup reminder' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Backup reminder' })).toBeNull())
  })
})

describe('The page title', () => {
  const mainNav = () => within(screen.getByRole('navigation', { name: 'Main' }))

  it('says which screen is open, so the browser tab, history and a screen reader all know', async () => {
    await tx()
    const user = await open()
    await screen.findByText('Recent transactions')
    expect(document.title).toBe('Expense Tracker')
    await user.click(mainNav().getByRole('button', { name: 'Activity' }))
    await waitFor(() => expect(document.title).toBe('Activity - Expense Tracker'))
    await user.click(mainNav().getByRole('button', { name: 'Settings' }))
    await waitFor(() => expect(document.title).toBe('Settings - Expense Tracker'))
    await user.click(mainNav().getByRole('button', { name: 'Home' }))
    await waitFor(() => expect(document.title).toBe('Expense Tracker'))
  })
})

describe('Opening a category from Home', () => {
  const lastMonthDay = () => {
    const d = new Date()
    return localDateString(new Date(d.getFullYear(), d.getMonth() - 1, 15))
  }
  const mainNav = () => within(screen.getByRole('navigation', { name: 'Main' }))

  it('lands on the month Home was showing, so the totals match', async () => {
    await tx({ merchant: 'Swiggy' })
    await tx({ merchant: 'Oldcafe', date: lastMonthDay() })
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Food & Dining, .*Show these expenses/ }))
    expect(await screen.findByRole('button', { name: /Edit spent Swiggy/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit spent Oldcafe/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'This month' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('forgets the category and the month when you leave Activity and come back', async () => {
    await tx({ merchant: 'Swiggy' })
    await tx({ merchant: 'Oldcafe', date: lastMonthDay() })
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Food & Dining, .*Show these expenses/ }))
    await screen.findByRole('button', { name: /Edit spent Swiggy/ })
    await user.click(mainNav().getByRole('button', { name: 'Home' }))
    await user.click(mainNav().getByRole('button', { name: 'Activity' }))
    expect(await screen.findByRole('button', { name: /Edit spent Oldcafe/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Any time' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Upcoming payments', () => {
  const addLoan = async (user: ReturnType<typeof userEvent.setup>) => {
    const sheet = await screen.findByRole('dialog', { name: 'New regular payment' })
    await user.type(within(sheet).getByLabelText('Name'), 'Home loan')
    await user.type(within(sheet).getByLabelText('Amount'), '12500')
    await user.click(within(sheet).getByRole('button', { name: 'Type' }))
    await user.click(await screen.findByRole('radio', { name: /Loan EMI/ }))
    const due = new Date()
    due.setDate(due.getDate() + 6)
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(within(sheet).getByLabelText('Next payment date'), { target: { value: localDateString(due) } })
    await user.click(within(sheet).getByRole('button', { name: 'Add payment' }))
  }

  it('is offered on Home, and leads from the invitation to a payment on the card', async () => {
    await tx()
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Track loans, auto-payments and salary/ }))
    const upcoming = await screen.findByRole('dialog', { name: 'Upcoming payments' })
    expect(within(upcoming).getByText('Nothing set up yet')).toBeInTheDocument()

    await user.click(within(upcoming).getByRole('button', { name: 'Add a payment' }))
    await addLoan(user)
    await waitFor(async () => expect(await db.recurring.count()).toBe(1))

    // The sheet it was added from now lists it, six days away.
    expect(await within(upcoming).findByRole('button', { name: /^Edit Home loan, Loan EMI, In 6 days/ })).toBeInTheDocument()

    // And once the sheet is closed, Home shows it in its card.
    await user.click(within(upcoming).getByRole('button', { name: 'Close' }))
    const card = await screen.findByRole('region', { name: 'Coming up' })
    expect(within(card).getByText('Home loan')).toBeInTheDocument()
    expect(card).toHaveTextContent('In 6 days')
  })

  it('opens a payment from the list to change it', async () => {
    await tx()
    await db.recurring.add({ kind: 'expense', amountMinor: 1_250_000, currency: 'INR', categoryId: 1, merchant: 'Home loan', note: '', paymentMethod: '', frequency: 'monthly', nextDue: localDateString(new Date(Date.now() + 6 * 86_400_000)), active: true, tag: 'loan' } as never)
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'See all upcoming payments' }))
    const upcoming = await screen.findByRole('dialog', { name: 'Upcoming payments' })
    await user.click(await within(upcoming).findByRole('button', { name: /^Edit Home loan/ }))
    const edit = await screen.findByRole('dialog', { name: 'Edit regular payment' })
    expect(within(edit).getByLabelText('Name')).toHaveValue('Home loan')
    expect(within(edit).getByLabelText('Amount')).toHaveValue('12500')
  })

  it('stays off the page while looking back at an old month', async () => {
    await tx()
    const user = await open()
    await screen.findByRole('button', { name: /Track loans, auto-payments and salary/ })
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Track loans, auto-payments and salary/ })).toBeNull())
  })
});

describe('Tapping Today, Yesterday or Last 7 days on Home', () => {
  const daysAgo = (n: number) => {
    const d = new Date()
    return localDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n))
  }

  it('shows the spending behind the figure tapped, for that day only', async () => {
    await tx({ merchant: 'TodayCafe' })
    await tx({ merchant: 'YesterdayCab', date: daysAgo(1) })
    await tx({ merchant: 'Employer', kind: 'income', amountMinor: 800_000, categoryId: 4 })
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /^Today: .*See these transactions/ }))
    expect(await screen.findByRole('button', { name: /Edit spent TodayCafe/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit spent YesterdayCab/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Edit received Employer/ })).toBeNull() // the figure was what was spent
    // What is filtering it is named, and can be taken off.
    expect(screen.getByRole('button', { name: 'Remove Today filter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Spent filter' })).toBeInTheDocument()
  })

  it('shows yesterday when yesterday is tapped', async () => {
    await tx({ merchant: 'TodayCafe' })
    await tx({ merchant: 'YesterdayCab', date: daysAgo(1) })
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /^Yesterday: .*See these transactions/ }))
    expect(await screen.findByRole('button', { name: /Edit spent YesterdayCab/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit spent TodayCafe/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove Yesterday filter' })).toBeInTheDocument()
  })

  it('shows the whole week for Last 7 days, and not older spending', async () => {
    await tx({ merchant: 'TodayCafe' })
    await tx({ merchant: 'FiveDaysAgo', date: daysAgo(5) })
    await tx({ merchant: 'TenDaysAgo', date: daysAgo(10) })
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /^Last 7 days: .*See these transactions/ }))
    expect(await screen.findByRole('button', { name: /Edit spent FiveDaysAgo/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit spent TodayCafe/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit spent TenDaysAgo/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove Last 7 days filter' })).toBeInTheDocument()
  })

  it('leaves a day with nothing spent as plain text, not a button to an empty list', async () => {
    await tx({ merchant: 'TodayCafe' })
    await open()
    await screen.findByRole('button', { name: /^Today: .*See these transactions/ })
    expect(screen.getByRole('group', { name: 'Yesterday: ₹0' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Yesterday:/ })).toBeNull()
  })

  it('starts fresh when Activity is opened from the tab bar afterwards', async () => {
    await tx({ merchant: 'TodayCafe' })
    await tx({ merchant: 'FiveDaysAgo', date: daysAgo(5) })
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /^Today: .*See these transactions/ }))
    await screen.findByRole('button', { name: /Edit spent TodayCafe/ })
    const nav = within(screen.getByRole('navigation', { name: 'Main' }))
    await user.click(nav.getByRole('button', { name: 'Home' }))
    await user.click(nav.getByRole('button', { name: 'Activity' }))
    expect(await screen.findByRole('button', { name: /Edit spent FiveDaysAgo/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Today filter' })).toBeNull()
  })
});

describe('The redesigned Home', () => {
  it('leads from the insight card to the Insights screen', async () => {
    await tx({ merchant: 'Cafe' })
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'See insights' }))
    expect(await screen.findByRole('heading', { name: 'Insights' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Insights' })).toHaveAttribute('aria-current', 'page')
  })

  it('greets by the time of day and shows the goal that matters, with what it means', async () => {
    await tx({ merchant: 'Cafe' })
    await db.goals.add({ name: 'Goa trip', targetMinor: 2_500_000, savedMinor: 500_000, createdAt: 1 } as never)
    await open()
    expect(await screen.findByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ })).toBeInTheDocument()
    const goals = await screen.findByRole('region', { name: 'Goals summary' })
    expect(goals).toHaveTextContent('Goa trip')
    expect(goals).toHaveTextContent('₹5,000 of ₹25,000')
    expect(goals).toHaveTextContent('₹20,000 to go')
  })

  it('shows the recent transactions before where it went', async () => {
    await tx({ merchant: 'Cafe' })
    await open()
    const recent = await screen.findByRole('heading', { name: 'Recent transactions' })
    const where = screen.getByRole('heading', { name: 'Where it went' })
    expect(recent.compareDocumentPosition(where) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
});
