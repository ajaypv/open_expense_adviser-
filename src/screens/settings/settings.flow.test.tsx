// @vitest-environment jsdom
import '../../test/dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reloadDisplay } from '../../data/display'
import { useLedger } from '../../data/useLedger'
import { localDateString } from '../../db/money'
import { db } from '../../db/schema'
import { ToastProvider } from '../../ui/toast'
import { AccountsSection } from './AccountsSection'
import { BudgetSection } from './BudgetSection'
import { CurrencySection } from './CurrencySection'
import { DisplaySection } from './DisplaySection'
import { LocationSection } from './LocationSection'
import type { Ledger } from './parts'
import { RecurringSection } from './RecurringSection'
import { RemindersSection } from './RemindersSection'
import { SuggestionsSection } from './SuggestionsSection'
import { UpdatesSection } from './UpdatesSection'

beforeEach(() => reloadDisplay())

/** Shows a section with the real, live ledger, so a change made in it comes back on screen. */
function Live({ children }: { children: (ledger: Ledger) => ReactNode }) {
  return <>{children(useLedger())}</>
}
const mount = (section: (ledger: Ledger) => ReactNode) =>
  render(
    <ToastProvider>
      <Live>{section}</Live>
    </ToastProvider>,
  )

const tx = (over: Record<string, unknown> = {}) =>
  db.transactions.add({
    kind: 'expense', amountMinor: 10_000, currency: 'INR', categoryId: 1, merchant: '', note: '', date: '2026-10-05',
    paymentMethod: '', source: 'manual', createdAt: Date.now(), ...over,
  } as never)

const rowsOf = async () => ({
  budgets: await db.budgets.toArray(),
  rates: ((await db.settings.get('rates'))?.value ?? {}) as Record<string, number>,
})

describe('Monthly budget', () => {
  it('saves an overall limit and shows it as on', async () => {
    const user = userEvent.setup()
    mount((l) => <BudgetSection ledger={l} />)
    await user.type(await screen.findByLabelText(/Limit per month/), '30,000')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await rowsOf()).budgets).toMatchObject([{ categoryId: null, monthlyLimitMinor: 3_000_000 }]))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Budget saved'))
    expect(await screen.findByText('On')).toBeInTheDocument()
  })

  it.each(['', '0', '-5', 'lots'])('refuses %j and says what to do instead', async (text) => {
    const user = userEvent.setup()
    mount((l) => <BudgetSection ledger={l} />)
    const input = await screen.findByLabelText(/Limit per month/)
    if (text) await user.type(input, text)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a budget above 0, or use Remove budget.')
    expect((await rowsOf()).budgets).toHaveLength(0)
  })

  it('removes the limit', async () => {
    await db.budgets.add({ categoryId: null, monthlyLimitMinor: 500_000, currency: 'INR' } as never)
    const user = userEvent.setup()
    mount((l) => <BudgetSection ledger={l} />)
    await user.click(await screen.findByRole('button', { name: 'Remove budget' }))
    await waitFor(async () => expect((await rowsOf()).budgets).toHaveLength(0))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Budget removed'))
  })

  it('sets a limit for one category when the field is left, and clears it when emptied', async () => {
    const user = userEvent.setup()
    mount((l) => <BudgetSection ledger={l} />)
    await user.click(await screen.findByText('Limits by category'))
    const groceries = await screen.findByLabelText('Groceries monthly limit (INR)')
    await user.type(groceries, '2500')
    await user.tab()
    await waitFor(async () => expect((await rowsOf()).budgets).toMatchObject([{ monthlyLimitMinor: 250_000 }]))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Groceries limit saved'))
    await user.clear(groceries)
    await user.tab()
    await waitFor(async () => expect((await rowsOf()).budgets).toHaveLength(0))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Groceries limit removed'))
  })

  it('marks a category limit that is not a number, and saves nothing', async () => {
    const user = userEvent.setup()
    mount((l) => <BudgetSection ledger={l} />)
    await user.click(await screen.findByText('Limits by category'))
    const field = await screen.findByLabelText('Groceries monthly limit (INR)')
    await user.type(field, 'abc')
    await user.tab()
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'))
    expect((await rowsOf()).budgets).toHaveLength(0)
  })
})

describe('Accounts and balance', () => {
  const openMain = async (user: ReturnType<typeof userEvent.setup>) => user.click(await screen.findByRole('button', { name: /^Main/ }))

  it('adds an account, and refuses a blank name', async () => {
    const user = userEvent.setup()
    mount((l) => <AccountsSection ledger={l} />)
    await user.click(await screen.findByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Give the account a name')
    await user.type(screen.getByLabelText('Add an account'), 'Cash')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect((await db.accounts.toArray()).map((a) => a.name)).toEqual(['Main', 'Cash']))
    expect(await screen.findByRole('button', { name: /^Cash/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Add an account')).toHaveValue('')
  })

  it('stores a balance so the estimate matches what was typed, counting transactions already logged', async () => {
    await tx({ kind: 'income', amountMinor: 100_000 }) // ₹1,000 received into the first account
    const user = userEvent.setup()
    mount((l) => <AccountsSection ledger={l} />)
    await openMain(user)
    await user.type(screen.getByLabelText(/Balance today/), '5,000')
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])
    // Opening balance = what was typed (₹5,000) minus what the logged money already adds (₹1,000).
    await waitFor(async () => expect((await db.accounts.toArray())[0].openingMinor).toBe(400_000))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Main balance saved'))
  })

  it('never fills the balance box with the saved balance', async () => {
    await db.accounts.update(1, { openingMinor: 123_400 })
    const user = userEvent.setup()
    mount((l) => <AccountsSection ledger={l} />)
    await openMain(user)
    expect(screen.getByLabelText(/Balance today/)).toHaveValue('')
    expect(screen.queryByDisplayValue(/1,?234/)).toBeNull()
    expect(screen.getByText('Saved. For privacy it isn’t shown here.')).toBeInTheDocument()
  })

  it('refuses a balance that is not a number, but accepts a negative one', async () => {
    const user = userEvent.setup()
    mount((l) => <AccountsSection ledger={l} />)
    await openMain(user)
    await user.type(screen.getByLabelText(/Balance today/), 'abc')
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the balance as a number. A negative number is fine.')
    await user.clear(screen.getByLabelText(/Balance today/))
    await user.type(screen.getByLabelText(/Balance today/), '-250')
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])
    await waitFor(async () => expect((await db.accounts.toArray())[0].openingMinor).toBe(-25_000))
  })

  it('clears a balance', async () => {
    await db.accounts.update(1, { openingMinor: 50_000 })
    const user = userEvent.setup()
    mount((l) => <AccountsSection ledger={l} />)
    await openMain(user)
    await user.click(await screen.findByRole('button', { name: 'Clear balance' }))
    await waitFor(async () => expect((await db.accounts.toArray())[0].openingMinor).toBeNull())
  })

  it('renames an account, and refuses a blank name', async () => {
    const user = userEvent.setup()
    mount((l) => <AccountsSection ledger={l} />)
    await openMain(user)
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Give the account a name')
    await user.type(name, 'Salary account')
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    await waitFor(async () => expect((await db.accounts.toArray())[0].name).toBe('Salary account'))
  })

  it('archives and unarchives', async () => {
    const user = userEvent.setup()
    mount((l) => <AccountsSection ledger={l} />)
    await openMain(user)
    await user.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(async () => expect((await db.accounts.toArray())[0].archived).toBe(true))
    expect(await screen.findByRole('button', { name: 'Unarchive' })).toBeInTheDocument()
  })

  it('deletes an unused account after confirming, and keeps it if not confirmed', async () => {
    await db.accounts.add({ name: 'Cash', openingMinor: null } as never)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    mount((l) => <AccountsSection ledger={l} />)
    await user.click(await screen.findByRole('button', { name: /^Cash/ }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await db.accounts.count()).toBe(2)
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect(await db.accounts.count()).toBe(1))
    confirm.mockRestore()
  })

  it('will not delete an account that has transactions, and says to archive it instead', async () => {
    await db.accounts.add({ name: 'Cash', openingMinor: null } as never)
    await tx({ accountId: 2 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    mount((l) => <AccountsSection ledger={l} />)
    await user.click(await screen.findByRole('button', { name: /^Cash/ }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText(/can’t be deleted. Archive it instead/)).toBeInTheDocument()
    expect(await db.accounts.count()).toBe(2)
    vi.restoreAllMocks()
  })
})

describe('Currency and exchange rates', () => {
  it('changes the main currency from the list', async () => {
    const user = userEvent.setup()
    mount((l) => <CurrencySection ledger={l} />)
    await user.click(await screen.findByRole('button', { name: 'Main currency' }))
    await user.click(await screen.findByRole('radio', { name: /USD/ }))
    await waitFor(async () => expect((await db.settings.get('currency'))?.value).toBe('USD'))
  })

  it('adds a currency, saves its rate when the field is left, and removes it when emptied', async () => {
    const user = userEvent.setup()
    mount((l) => <CurrencySection ledger={l} />)
    await user.click(await screen.findByRole('button', { name: 'Add a currency' }))
    await user.click(await screen.findByRole('radio', { name: /EUR/ }))
    const rate = await screen.findByLabelText('Value of 1 EUR in INR')
    await user.type(rate, '90.5')
    await user.tab()
    await waitFor(async () => expect((await rowsOf()).rates).toEqual({ EUR: 90.5 }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('EUR rate saved'))
    await user.clear(rate)
    await user.tab()
    await waitFor(async () => expect((await rowsOf()).rates).toEqual({}))
  })

  it.each(['abc', '0', '-3'])('does not save a rate of %j and marks the field', async (text) => {
    await db.settings.put({ key: 'rates', value: { EUR: 90 } })
    const user = userEvent.setup()
    mount((l) => <CurrencySection ledger={l} />)
    const rate = await screen.findByLabelText('Value of 1 EUR in INR')
    await user.clear(rate)
    await user.type(rate, text)
    await user.tab()
    await waitFor(() => expect(rate).toHaveAttribute('aria-invalid', 'true'))
    expect((await rowsOf()).rates).toEqual({ EUR: 90 })
  })

  it('asks for a rate for a currency in use, until one is set', async () => {
    await tx({ currency: 'USD', amountMinor: 1_000 })
    const user = userEvent.setup()
    mount((l) => <CurrencySection ledger={l} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Set a rate for USD')
    expect(screen.getByText('Rate needed')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Value of 1 USD in INR'), '83')
    await user.tab()
    await waitFor(() => expect(screen.queryByText('Rate needed')).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('Recurring', () => {
  const rule = (over: Record<string, unknown> = {}) =>
    db.recurring.add({
      kind: 'expense', amountMinor: 1_800_000, currency: 'INR', categoryId: 1, merchant: 'Rent', note: '', paymentMethod: '',
      frequency: 'monthly', nextDue: '2099-01-01', active: true, ...over,
    } as never)

  it('lists a rule and pauses and resumes it', async () => {
    const id = await rule()
    const user = userEvent.setup()
    mount((l) => <RecurringSection ledger={l} />)
    expect(await screen.findByText('Rent')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Active' }))
    await waitFor(async () => expect((await db.recurring.get(id))!.active).toBe(false))
    expect(await screen.findByText('Paused')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Active' }))
    await waitFor(async () => expect((await db.recurring.get(id))!.active).toBe(true))
  })

  it('stops a rule after confirming, and keeps it if not confirmed', async () => {
    await rule()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    mount((l) => <RecurringSection ledger={l} />)
    await user.click(await screen.findByRole('button', { name: 'Delete recurring Rent' }))
    expect(await db.recurring.count()).toBe(1)
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Delete recurring Rent' }))
    await waitFor(async () => expect(await db.recurring.count()).toBe(0))
    confirm.mockRestore()
  })

  it('offers to repeat something that happens every month, and sets it up', async () => {
    const now = new Date()
    for (let k = 0; k < 3; k++) {
      await tx({ merchant: 'Netflix', amountMinor: 64_900, date: localDateString(new Date(now.getFullYear(), now.getMonth() - k, 1)) })
    }
    const user = userEvent.setup()
    mount((l) => <RecurringSection ledger={l} />)
    expect(await screen.findByText('Found in your history')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Repeat monthly' }))
    await waitFor(async () => expect(await db.recurring.count()).toBe(1))
    expect(await db.recurring.toArray()).toMatchObject([{ merchant: 'Netflix', amountMinor: 64_900, frequency: 'monthly', active: true }])
    await waitFor(() => expect(screen.queryByText('Found in your history')).toBeNull()) // now a rule, so no longer "found"
  })

  it('explains itself when nothing repeats', async () => {
    mount((l) => <RecurringSection ledger={l} />)
    expect(await screen.findByText(/Nothing repeats yet/)).toBeInTheDocument()
  })
})

describe('Appearance', () => {
  const setup = () => {
    const onTheme = vi.fn()
    render(<DisplaySection theme="system" onTheme={onTheme} />)
    return { onTheme, user: userEvent.setup() }
  }

  it('reports the theme chosen', async () => {
    const { user, onTheme } = setup()
    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(onTheme).toHaveBeenCalledWith('dark')
  })

  it('scales the whole app with the text size, and remembers it', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('radio', { name: 'Largest' }))
    expect(document.documentElement.style.fontSize).toBe('125%')
    expect(JSON.parse(localStorage.getItem('display-prefs')!).textSize).toBe('xlarge')
    await user.click(screen.getByRole('radio', { name: 'Small' }))
    expect(document.documentElement.style.fontSize).toBe('90%')
  })

  it('hides amounts, shows them again, and remembers the choice', async () => {
    const { user } = setup()
    const hide = screen.getByRole('switch', { name: /Hide amounts/ })
    expect(hide).not.toBeChecked()
    await user.click(hide)
    expect(hide).toBeChecked()
    expect(JSON.parse(localStorage.getItem('display-prefs')!).privacy).toBe(true)
    await user.click(hide)
    expect(JSON.parse(localStorage.getItem('display-prefs')!).privacy).toBe(false)
  })

  it('changes the number grouping', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('radio', { name: /Indian grouping/ }))
    expect(JSON.parse(localStorage.getItem('display-prefs')!).numberFormat).toBe('indian')
    await user.click(screen.getByRole('radio', { name: /International grouping/ }))
    expect(JSON.parse(localStorage.getItem('display-prefs')!).numberFormat).toBe('international')
  })
})

describe('Suggestions placement', () => {
  it('starts above the input bar, and moves to Home or off', async () => {
    const user = userEvent.setup()
    render(<SuggestionsSection />)
    // The saved choice loads a moment after the section appears; until then nothing is shown as chosen.
    await waitFor(() => expect(screen.getByRole('radio', { name: /Above the input bar/ })).toBeChecked())
    await user.click(screen.getByRole('radio', { name: /On the Home screen/ }))
    await waitFor(() => expect(screen.getByRole('radio', { name: /On the Home screen/ })).toBeChecked())
    await user.click(screen.getByRole('radio', { name: /^Off/ }))
    await waitFor(() => expect(screen.getByRole('radio', { name: /^Off/ })).toBeChecked())
  })
})

describe('Reminders', () => {
  it('shows the time and budget alert switches, and stores what is chosen', async () => {
    const user = userEvent.setup()
    mount(() => <RemindersSection />)
    expect(screen.queryByRole('button', { name: 'Remind me at' })).toBeNull()
    await user.click(await screen.findByRole('switch', { name: /Remind me to log/ }))
    expect(await screen.findByRole('button', { name: 'Remind me at' })).toBeInTheDocument()
    // Budget alerts start on; switching them flips the stored choice.
    const alerts = screen.getByRole('switch', { name: /Budget alerts/ })
    await waitFor(() => expect(alerts).toBeChecked())
    await user.click(alerts)
    await waitFor(async () => expect((await db.settings.get('reminders'))?.value).toMatchObject({ logReminder: true, budgetAlerts: false }))
    await waitFor(() => expect(alerts).not.toBeChecked())
  })

  it('changes the reminder time with the time picker', async () => {
    const user = userEvent.setup()
    mount(() => <RemindersSection />)
    await user.click(await screen.findByRole('switch', { name: /Remind me to log/ }))
    await user.click(await screen.findByRole('button', { name: 'Remind me at' }))
    await user.click(screen.getByRole('button', { name: '8 o’clock' }))
    await user.click(screen.getByRole('button', { name: '30 minutes' }))
    await user.click(screen.getByRole('button', { name: 'Set time' }))
    await waitFor(async () => expect(((await db.settings.get('reminders'))?.value as { logTime: string }).logTime).toMatch(/^(08|20):30$/))
  })

  it('asks the browser for permission only when the button is tapped', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', Object.assign(function () {}, { permission: 'default', requestPermission }))
    const user = userEvent.setup()
    mount(() => <RemindersSection />)
    expect(requestPermission).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Allow notifications' }))
    expect(requestPermission).toHaveBeenCalledOnce()
    expect(await screen.findByText('Notifications are allowed.')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('says reminders appear inside the app where notifications cannot be shown', async () => {
    mount(() => <RemindersSection />)
    expect(await screen.findByText(/Reminders will appear inside the app instead/)).toBeInTheDocument()
  })
})

describe('Location', () => {
  const geolocation = (outcome: 'ok' | 'denied') => {
    const getCurrentPosition = vi.fn((ok: (p: unknown) => void, fail: (e: unknown) => void) => {
      if (outcome === 'ok') ok({ coords: { latitude: 12.97161, longitude: 77.59461, accuracy: 18.4 } })
      else fail({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 })
    })
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
    return getCurrentPosition
  }

  it('turns on once the browser allows it, and says new transactions will carry a place', async () => {
    geolocation('ok')
    const user = userEvent.setup()
    mount((l) => <LocationSection ledger={l} />)
    await user.click(await screen.findByRole('switch', { name: /Save where I add transactions/ }))
    await waitFor(async () => expect((await db.settings.get('recordLocation'))?.value).toBe(true))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Location will be saved with new transactions'))
  })

  it('stays off and says why when the browser says no', async () => {
    geolocation('denied')
    const user = userEvent.setup()
    mount((l) => <LocationSection ledger={l} />)
    await user.click(await screen.findByRole('switch', { name: /Save where I add transactions/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Location is blocked for this app')
    expect(await db.settings.get('recordLocation')).toBeUndefined()
  })

  it('turns off again', async () => {
    await db.settings.put({ key: 'recordLocation', value: true })
    const user = userEvent.setup()
    mount((l) => <LocationSection ledger={l} />)
    const toggle = await screen.findByRole('switch', { name: /Save where I add transactions/ })
    await waitFor(() => expect(toggle).toBeChecked())
    await user.click(toggle)
    await waitFor(async () => expect(await db.settings.get('recordLocation')).toBeUndefined())
  })

  it('removes saved places from transactions, after confirming', async () => {
    await tx({ location: { lat: 1, lon: 2, accuracyM: 3 } })
    await tx({ location: { lat: 4, lon: 5, accuracyM: 6 } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    mount((l) => <LocationSection ledger={l} />)
    await user.click(await screen.findByRole('button', { name: 'Remove location from 2 transactions' }))
    await waitFor(async () => expect((await db.transactions.toArray()).every((t) => t.location === undefined)).toBe(true))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Removed location from 2 transactions'))
    vi.restoreAllMocks()
  })
})

describe('App updates', () => {
  const setup = (over: Partial<Parameters<typeof UpdatesSection>[0]> = {}) => {
    const props = { updateReady: false, onApplyUpdate: vi.fn(), onCheckUpdate: vi.fn().mockResolvedValue('latest'), onShowWhatsNew: vi.fn(), ...over }
    render(<UpdatesSection {...props} />)
    return { ...props, user: userEvent.setup() }
  }

  it('checks, and says when this is the latest version', async () => {
    const { user, onCheckUpdate } = setup()
    await user.click(screen.getByRole('button', { name: 'Check for updates' }))
    expect(onCheckUpdate).toHaveBeenCalledOnce()
    expect(await screen.findByText('You’re on the latest version.')).toBeInTheDocument()
  })

  it('shows that it is checking while it waits', async () => {
    let finish!: (v: string) => void
    const { user } = setup({ onCheckUpdate: vi.fn(() => new Promise((r) => (finish = r))) as never })
    await user.click(screen.getByRole('button', { name: 'Check for updates' }))
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled()
    finish('latest')
    expect(await screen.findByText('You’re on the latest version.')).toBeInTheDocument()
  })

  it.each([
    ['offline', 'You’re offline. Connect to the internet and try again.'],
    ['error', 'Couldn’t check for updates. Try again in a moment.'],
    ['unsupported', /nothing to update here/],
  ])('says so plainly when the check ends as %s', async (result, message) => {
    const { user } = setup({ onCheckUpdate: vi.fn().mockResolvedValue(result) })
    await user.click(screen.getByRole('button', { name: 'Check for updates' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
  })

  it('offers Update now when a new version is found, and applies it', async () => {
    const { user, onApplyUpdate } = setup({ onCheckUpdate: vi.fn().mockResolvedValue('available') })
    await user.click(screen.getByRole('button', { name: 'Check for updates' }))
    await user.click(await screen.findByRole('button', { name: 'Update now' }))
    expect(onApplyUpdate).toHaveBeenCalledOnce()
    expect(screen.getByText('Update ready')).toBeInTheDocument()
  })

  it('offers Update now straight away when one has already downloaded', () => {
    setup({ updateReady: true })
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull()
  })

  it('opens What’s new', async () => {
    const { user, onShowWhatsNew } = setup()
    await user.click(screen.getByRole('button', { name: /What’s new in this version/ }))
    expect(onShowWhatsNew).toHaveBeenCalledOnce()
  })
})

// The scoped queries above rely on this, so keep the import used.
void within
