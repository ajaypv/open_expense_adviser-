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
    expect(await screen.findByText('Nothing logged yet.')).toBeInTheDocument()
  })

  it('saves the currency, balance and budget typed in the welcome', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('dialog', { name: 'Welcome' })
    await user.click(screen.getByRole('button', { name: 'Currency' }))
    await user.click(await screen.findByRole('radio', { name: /USD/ }))
    await user.type(screen.getByLabelText(/What do you have today/), '5,000')
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
    await user.type(screen.getByLabelText(/What do you have today/), 'lots')
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
    await user.type(await screen.findByLabelText('Log an expense'), `${text}{Enter}`)
  }

  it('turns a sentence into an expense and says what was added', async () => {
    const user = await open()
    await type(user, '450 lunch at Cafe')
    await waitFor(async () => expect(await db.transactions.count()).toBe(1))
    expect((await db.transactions.toArray())[0]).toMatchObject({ kind: 'expense', amountMinor: 45_000, source: 'chat', date: localDateString() })
    expect(await screen.findByText(/Added ₹450 to/)).toBeInTheDocument()
    expect(screen.getByLabelText('Log an expense')).toHaveValue('') // the bar clears
  })

  it("shows what was spent today on Home as soon as it is logged, and not yesterday's", async () => {
    const user = await open()
    await type(user, '450 lunch at Cafe')
    expect(await screen.findByRole('group', { name: 'Today: ₹450' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Yesterday: ₹0' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Last 7 days: ₹450' })).toBeInTheDocument()
  })

  it('reads several entries at once', async () => {
    const user = await open()
    await type(user, 'coffee 120, lunch 340')
    await waitFor(async () => expect(await db.transactions.count()).toBe(2))
    expect(await screen.findByText('Added 2 entries, ₹460 sent')).toBeInTheDocument()
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
    await waitFor(async () => expect((await db.transactions.toArray())[0].deletedAt).toBeTypeOf('number'))
  })

  it('asks for an amount when there is none, and keeps what was typed', async () => {
    const user = await open()
    await type(user, 'lunch at the cafe')
    expect(await screen.findByText('No amount found. Try “450 lunch at Cafe”.')).toBeInTheDocument()
    expect(await db.transactions.count()).toBe(0)
    expect(screen.getByLabelText('Log an expense')).toHaveValue('lunch at the cafe')
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
    expect(await screen.findByRole('button', { name: 'Add expense' })).toBeDisabled()
    await user.type(screen.getByLabelText('Log an expense'), '   ')
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled()
  })

  it('opens the full form from the plus button', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Add with the full form' }))
    expect(await screen.findByRole('dialog', { name: 'Add transaction' })).toBeInTheDocument()
  })
})

describe('Moving around', () => {
  it('shows each tab and marks the current one', async () => {
    await tx()
    const user = await open()
    await screen.findByText('Latest')
    for (const [name, heading] of [['Activity', /Filters/], ['Insights', /./], ['Settings', 'Appearance']] as const) {
      await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name }))
      expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name })).toHaveAttribute('aria-current', 'page')
      if (typeof heading === 'string') expect(await screen.findByText(heading)).toBeInTheDocument()
    }
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Home' }))
    expect(await screen.findByText('Latest')).toBeInTheDocument()
  })

  it('does not let any screen slide sideways, however wide something inside it is', async () => {
    await open()
    await screen.findByText('Nothing logged yet.')
    // jsdom has no layout, so this checks the rule that stops it: the scrolling area only moves up and down.
    expect(document.querySelector('main')).toHaveClass('overflow-y-auto', 'overflow-x-hidden')
  })

  it('opens a transaction to edit from the list', async () => {
    await tx({ merchant: 'Cafe' })
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Edit sent Cafe/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit transaction' })
    expect(within(sheet).getByLabelText('Where')).toHaveValue('Cafe')
  })

  it('shows another month from the month picker', async () => {
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    await tx({ merchant: 'Old', date: localDateString(prev) })
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /Choose a month/ }))
    if (prev.getFullYear() !== now.getFullYear()) await user.click(screen.getByRole('button', { name: 'Previous year' }))
    await user.click(screen.getByRole('button', { name: new RegExp(`^${monthLabel(localDateString(prev).slice(0, 7))}`) }))
    expect(await screen.findByText(/You spent in/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'This month' })).toBeInTheDocument()
  })
})

describe('Hide amounts', () => {
  it('masks amounts everywhere without rebuilding the screen, so the page and open sections stay as they were', async () => {
    await tx({ merchant: 'Cafe', amountMinor: 45_000 })
    const user = await open()
    await screen.findByText('Latest')
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Settings' }))
    await screen.findByText('Appearance')

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
    expect(screen.queryByText('Latest')).toBeNull()
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
    await screen.findByText('Latest')
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
    await screen.findByText('Appearance')
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
    expect(screen.getByText('Latest')).toBeInTheDocument()
  })
})
