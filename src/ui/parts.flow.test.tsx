// @vitest-environment jsdom
import '../test/dom'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLastBackup, getSnoozedUntil } from '../data/backupState'
import { useLedger } from '../data/useLedger'
import { localDateString } from '../db/money'
import { db } from '../db/schema'
import { notify, notificationPermission, requestNotificationPermission, schedulePeriodicReminder, setBadge } from '../reminders/notify'
import { budgetMessage } from '../reminders/logic'
import { setReminderPrefs } from '../reminders/store'
import { useReminders } from '../reminders/useReminders'
import { makeLedger } from '../test/ledger'
import { ChatBar } from './ChatBar'
import { Dialog } from './Dialog'
import { BackupNudge, DueCard, LogNudge } from './HomeCards'
import { PwaBanner } from './PwaBanner'
import { ToastProvider } from './toast'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const key of ['canShare', 'share', 'setAppBadge', 'clearAppBadge', 'serviceWorker']) delete (navigator as unknown as Record<string, unknown>)[key]
})

const dayOffset = (n: number) => {
  const d = new Date()
  return localDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n))
}
const monthsAgo = (n: number) => {
  const d = new Date()
  return localDateString(new Date(d.getFullYear(), d.getMonth() - n, d.getDate()))
}

describe('Due now (recurring)', () => {
  function Card() {
    return <DueCard ledger={useLedger()} today={new Date()} />
  }
  const mount = () =>
    render(
      <ToastProvider>
        <Card />
      </ToastProvider>,
    )
  const rule = (over: Record<string, unknown> = {}) =>
    db.recurring.add({
      kind: 'expense', amountMinor: 1_800_000, currency: 'INR', categoryId: 1, merchant: 'Rent', note: '', paymentMethod: '',
      frequency: 'monthly', nextDue: localDateString(), active: true, ...over,
    } as never) as Promise<number>

  it('shows nothing when nothing is due, or when a rule is paused', async () => {
    await rule({ nextDue: dayOffset(10) })
    await rule({ active: false, merchant: 'Gym' })
    mount()
    await act(async () => {})
    expect(screen.queryByRole('region', { name: 'Due now' })).toBeNull()
  })

  it('adds a due transaction with one tap, moves the rule on, and Undo puts it all back', async () => {
    const id = await rule()
    const due = localDateString()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Add' }))
    await waitFor(async () => expect(await db.transactions.count()).toBe(1))
    expect((await db.transactions.toArray())[0]).toMatchObject({ merchant: 'Rent', amountMinor: 1_800_000, source: 'recurring', date: due })
    expect((await db.recurring.get(id))!.nextDue > due).toBe(true)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Added Rent'))
    await waitFor(() => expect(screen.queryByText('Due now')).toBeNull()) // no longer due

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await db.transactions.count()).toBe(0))
    expect((await db.recurring.get(id))!.nextDue).toBe(due)
    expect(await screen.findByText('Due now')).toBeInTheDocument()
  })

  it('skips an occurrence without adding anything, and Undo brings it back', async () => {
    const id = await rule()
    const due = localDateString()
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Skip' }))
    await waitFor(async () => expect((await db.recurring.get(id))!.nextDue > due).toBe(true))
    expect(await db.transactions.count()).toBe(0)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Skipped this one'))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await db.recurring.get(id))!.nextDue).toBe(due))
  })

  it('catches up on missed months one at a time, or all at once', async () => {
    const id = await rule({ nextDue: monthsAgo(2) }) // three occurrences are due: two months ago, last month, today
    const user = userEvent.setup()
    mount()
    expect(await screen.findByText(/\(3 due\)/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect(await db.transactions.count()).toBe(1)) // only the oldest
    await user.click(await screen.findByRole('button', { name: 'Add all 2' }))
    await waitFor(async () => expect(await db.transactions.count()).toBe(3))
    expect((await db.recurring.get(id))!.nextDue > localDateString()).toBe(true)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Added 2 recurring transactions'))
  })

  it('adds everything due across several rules with Add all', async () => {
    await rule()
    await rule({ merchant: 'Gym', amountMinor: 200_000 })
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Add all 2' }))
    await waitFor(async () => expect(await db.transactions.count()).toBe(2))
  })
})

describe('Backup reminder', () => {
  const mount = (count: number) =>
    render(
      <ToastProvider>
        <BackupNudge transactionCount={count} />
      </ToastProvider>,
    )

  it('stays quiet until there is enough to lose', async () => {
    mount(9)
    await act(async () => {})
    expect(screen.queryByRole('region', { name: 'Backup reminder' })).toBeNull()
  })

  it('asks for a backup once there are ten or more and none has been made', async () => {
    mount(10)
    expect(await screen.findByText('Back up your data')).toBeInTheDocument()
  })

  it('says how long it has been', async () => {
    await db.settings.put({ key: 'lastBackupAt', value: Date.now() - 45 * 86_400_000 })
    mount(20)
    expect(await screen.findByText('Last backup was 45 days ago')).toBeInTheDocument()
  })

  it('stays quiet when a backup is recent', async () => {
    await db.settings.put({ key: 'lastBackupAt', value: Date.now() - 2 * 86_400_000 })
    mount(50)
    await act(async () => {})
    expect(screen.queryByRole('region', { name: 'Backup reminder' })).toBeNull()
  })

  it('goes away for a week when put off', async () => {
    const user = userEvent.setup()
    mount(10)
    await user.click(await screen.findByRole('button', { name: 'Later' }))
    await waitFor(() => expect(screen.queryByText('Back up your data')).toBeNull())
    expect(await getSnoozedUntil()).toBeGreaterThan(Date.now() + 6 * 86_400_000)
  })

  it('backs up from the card, records it, and goes away', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    mount(10)
    await user.click(await screen.findByRole('button', { name: 'Back up now' }))
    await waitFor(async () => expect(await getLastBackup()).toBeTypeOf('number'))
    await waitFor(() => expect(screen.queryByText('Back up your data')).toBeNull())
  })
})

describe('Log nudge', () => {
  it('offers to add something', async () => {
    const onAdd = vi.fn()
    render(<LogNudge onAdd={onAdd} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledOnce()
  })
})

describe('Input bar', () => {
  const setup = (onSubmit = vi.fn().mockResolvedValue(true), initialText = '') => {
    const onOpenForm = vi.fn()
    render(<ChatBar onSubmit={onSubmit} onOpenForm={onOpenForm} initialText={initialText} />)
    return { onSubmit, onOpenForm, user: userEvent.setup(), box: screen.getByLabelText('Log an expense') }
  }

  it('sends on Enter and clears the box when it was understood', async () => {
    const { user, onSubmit, box } = setup()
    await user.type(box, '450 lunch{Enter}')
    await waitFor(() => expect(onSubmit).toHaveBeenCalledExactlyOnceWith('450 lunch'))
    await waitFor(() => expect(box).toHaveValue(''))
  })

  it('keeps the text when it was not understood', async () => {
    const { user, box } = setup(vi.fn().mockResolvedValue(false))
    await user.type(box, 'lunch{Enter}')
    await waitFor(() => expect(box).toBeEnabled())
    expect(box).toHaveValue('lunch')
  })

  it('starts a new line on Shift+Enter instead of sending', async () => {
    const { user, onSubmit, box } = setup()
    await user.type(box, 'a{Shift>}{Enter}{/Shift}b')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(box).toHaveValue('a\nb')
  })

  it.each([
    ['isComposing', { isComposing: true }],
    ['keyCode 229', { keyCode: 229 }],
  ])('does not send while a word is still being composed (%s)', async (_what, init) => {
    const { onSubmit, box } = setup()
    fireEvent.change(box, { target: { value: 'こんにちは' } })
    fireEvent.keyDown(box, { key: 'Enter', ...init })
    await act(async () => {})
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('will not send an empty or blank message', async () => {
    const { user, onSubmit, box } = setup()
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled()
    await user.type(box, '   {Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('sends only once while the first send is still going', async () => {
    let finish!: (ok: boolean) => void
    const { user, onSubmit, box } = setup(vi.fn(() => new Promise<boolean>((r) => (finish = r))))
    await user.type(box, '450 lunch{Enter}')
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled()
    await user.type(box, '{Enter}')
    expect(onSubmit).toHaveBeenCalledOnce()
    finish(true)
    await waitFor(() => expect(box).toHaveValue(''))
  })

  it('starts with the text it was given, and opens the full form from the plus', async () => {
    const { user, onOpenForm, box } = setup(undefined, 'Uber 230 yesterday')
    expect(box).toHaveValue('Uber 230 yesterday')
    await user.click(screen.getByRole('button', { name: 'Add with the full form' }))
    expect(onOpenForm).toHaveBeenCalledOnce()
  })
})

describe('Update and install banner', () => {
  const pwa = (over: Record<string, unknown> = {}) =>
    ({ canInstall: false, install: vi.fn(), showIosHint: false, updateReady: false, applyUpdate: vi.fn(), checkNow: vi.fn(), offlineReady: false, ...over }) as never

  it('shows nothing when there is nothing to say', () => {
    const { container } = render(<PwaBanner pwa={pwa()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('offers to reload for a waiting update, and applies it', async () => {
    const applyUpdate = vi.fn()
    render(<PwaBanner pwa={pwa({ updateReady: true, applyUpdate })} />)
    expect(screen.getByText('A new version is ready.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull() // an update can't be dismissed
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reload' }))
    expect(applyUpdate).toHaveBeenCalledOnce()
  })

  it('offers to install, and can be dismissed', async () => {
    const install = vi.fn()
    const user = userEvent.setup()
    render(<PwaBanner pwa={pwa({ canInstall: true, install })} />)
    await user.click(screen.getByRole('button', { name: 'Install' }))
    expect(install).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByText(/Install the app/)).toBeNull()
  })

  it('tells an iPhone how to install', () => {
    render(<PwaBanner pwa={pwa({ showIosHint: true })} />)
    expect(screen.getByText('To install, tap Share, then Add to Home Screen.')).toBeInTheDocument()
  })
})

describe('Sheets', () => {
  it('closes when the backdrop is tapped, but not when the content is', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} labelledBy="t">
        <h2 id="t">Title</h2>
        <button type="button">Inside</button>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Title' })
    fireEvent.click(screen.getByRole('button', { name: 'Inside' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('opens and closes as its open flag changes', () => {
    const { rerender } = render(
      <Dialog open={false} onClose={() => {}} labelledBy="t">
        <h2 id="t">Title</h2>
      </Dialog>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(
      <Dialog open onClose={() => {}} labelledBy="t">
        <h2 id="t">Title</h2>
      </Dialog>,
    )
    expect(screen.getByRole('dialog', { name: 'Title' })).toBeInTheDocument()
    rerender(
      <Dialog open={false} onClose={() => {}} labelledBy="t">
        <h2 id="t">Title</h2>
      </Dialog>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Notifications', () => {
  const stubNotification = (permission: string, requestPermission = vi.fn().mockResolvedValue(permission)) => {
    const ctor = vi.fn()
    vi.stubGlobal('Notification', Object.assign(ctor, { permission, requestPermission }))
    return { ctor, requestPermission }
  }
  const serviceWorker = (showNotification = vi.fn().mockResolvedValue(undefined), extra: Record<string, unknown> = {}) => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ showNotification, ...extra }) } })
    return showNotification
  }

  it('reports whether notifications can be shown at all', () => {
    expect(notificationPermission()).toBe('unsupported')
    stubNotification('denied')
    expect(notificationPermission()).toBe('denied')
  })

  it('asks for permission, and survives a browser that throws', async () => {
    expect(await requestNotificationPermission()).toBe('unsupported')
    stubNotification('default', vi.fn().mockResolvedValue('granted'))
    expect(await requestNotificationPermission()).toBe('granted')
    stubNotification('denied', vi.fn().mockRejectedValue(new Error('no')))
    expect(await requestNotificationPermission()).toBe('denied')
  })

  it('shows nothing without permission', async () => {
    const show = serviceWorker()
    stubNotification('default')
    expect(await notify('Hi', 'There', 'tag')).toBe(false)
    expect(show).not.toHaveBeenCalled()
  })

  it('shows through the service worker, as installed phone apps need', async () => {
    const show = serviceWorker()
    stubNotification('granted')
    expect(await notify('Over budget', 'Careful', 'budget-1')).toBe(true)
    expect(show).toHaveBeenCalledWith('Over budget', expect.objectContaining({ body: 'Careful', tag: 'budget-1' }))
  })

  it('falls back to a plain notification with no service worker, and says false if it fails', async () => {
    const { ctor } = stubNotification('granted')
    expect(await notify('Hi', 'There', 'tag')).toBe(true)
    expect(ctor).toHaveBeenCalledWith('Hi', { body: 'There', tag: 'tag' })
    serviceWorker(vi.fn().mockRejectedValue(new Error('blocked')))
    expect(await notify('Hi', 'There', 'tag')).toBe(false)
  })

  it('puts a number on the app icon, and clears it at zero', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    const clear = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: set })
    Object.defineProperty(navigator, 'clearAppBadge', { configurable: true, value: clear })
    await setBadge(3)
    expect(set).toHaveBeenCalledWith(3)
    await setBadge(0)
    expect(clear).toHaveBeenCalledOnce()
  })

  it('never throws over the badge', async () => {
    Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: vi.fn().mockRejectedValue(new Error('no')) })
    await expect(setBadge(2)).resolves.toBeUndefined()
    delete (navigator as unknown as Record<string, unknown>).setAppBadge
    await expect(setBadge(2)).resolves.toBeUndefined()
  })

  it('asks the browser to wake the app about twice a day, and stops when turned off', async () => {
    const register = vi.fn().mockResolvedValue(undefined)
    const unregister = vi.fn().mockResolvedValue(undefined)
    serviceWorker(undefined, { periodicSync: { register, unregister } })
    expect(await schedulePeriodicReminder(true)).toBe(true)
    expect(register).toHaveBeenCalledWith('daily-reminder', { minInterval: 12 * 60 * 60 * 1000 })
    expect(await schedulePeriodicReminder(false)).toBe(false)
    expect(unregister).toHaveBeenCalledWith('daily-reminder')
  })

  it('says it could not, rather than throwing, where the browser does not allow it', async () => {
    serviceWorker()
    expect(await schedulePeriodicReminder(true)).toBe(false) // no periodicSync on the registration
    serviceWorker(undefined, { periodicSync: { register: vi.fn().mockRejectedValue(new Error('no')), unregister: vi.fn() } })
    expect(await schedulePeriodicReminder(true)).toBe(false)
  })
})

describe('Reminders while the app is open', () => {
  const at = (hour: number, minute = 0) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 30, hour, minute))
  }
  const expense = (over: Record<string, unknown> = {}) => ({
    id: 1, kind: 'expense' as const, amountMinor: 100, currency: 'INR', categoryId: 1, merchant: '', note: '', date: '2026-10-30',
    paymentMethod: '', source: 'manual' as const, createdAt: new Date(2026, 9, 30, 9).getTime(), ...over,
  })
  const settled = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 80))))
  const run = (ledger = makeLedger(), onMessage = vi.fn()) => {
    const hook = renderHook(({ l }) => useReminders(l, onMessage), { initialProps: { l: ledger } })
    return { ...hook, onMessage }
  }

  it('nudges once the time has passed with nothing logged, and not before', async () => {
    at(12)
    await setReminderPrefs({ logReminder: true, logTime: '21:00' })
    const early = run()
    await act(async () => {})
    expect(early.result.current.logNudge).toBe(false)
    early.unmount()

    at(22)
    const late = run()
    await waitFor(() => expect(late.result.current.logNudge).toBe(true))
  })

  it('does not nudge when something was logged today, or the reminder is off', async () => {
    at(22)
    await setReminderPrefs({ logReminder: true, logTime: '21:00' })
    const logged = run(makeLedger({ txs: [expense()] }))
    await act(async () => {})
    expect(logged.result.current.logNudge).toBe(false)
    logged.unmount()

    await setReminderPrefs({ logReminder: false })
    const off = run()
    await act(async () => {})
    expect(off.result.current.logNudge).toBe(false)
  })

  it('does not count a recurring transaction added for you as logging', async () => {
    at(22)
    await setReminderPrefs({ logReminder: true, logTime: '21:00' })
    const { result } = run(makeLedger({ txs: [expense({ source: 'recurring', createdAt: new Date(2026, 9, 30, 8).getTime() })] }))
    await waitFor(() => expect(result.current.logNudge).toBe(true))
  })

  it('counts what is waiting, and puts it on the app icon', async () => {
    at(22)
    const set = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: set })
    Object.defineProperty(navigator, 'clearAppBadge', { configurable: true, value: vi.fn().mockResolvedValue(undefined) })
    await setReminderPrefs({ logReminder: true, logTime: '21:00' })
    const due = { id: 1, kind: 'expense' as const, amountMinor: 1, currency: 'INR', categoryId: 1, merchant: 'Rent', note: '', paymentMethod: '', frequency: 'monthly' as const, nextDue: '2026-10-01', active: true }
    const { result } = run(makeLedger({ recurring: [due] }))
    await waitFor(() => expect(result.current).toEqual({ logNudge: true, dueCount: 1 }))
    await waitFor(() => expect(set).toHaveBeenLastCalledWith(2)) // one rule due, plus the nudge
  })

  it('sends one system notification a day', async () => {
    at(22)
    const show = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ showNotification: show }) } })
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'granted' }))
    await setReminderPrefs({ logReminder: true, logTime: '21:00' })
    const first = run()
    await waitFor(() => expect(show).toHaveBeenCalledWith('Log today’s spending', expect.anything()))
    await waitFor(async () => expect((await db.settings.get('reminderState'))?.value).toMatchObject({ lastLogNudge: '2026-10-30' }))
    first.unmount()
    show.mockClear()
    run() // opening the app again the same day
    await act(async () => {})
    expect(show).not.toHaveBeenCalled()
  })

  it('warns as a budget fills, but stays quiet about what was already past when the app opened', async () => {
    at(12)
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'default' }))
    const withSpend = (spent: number) =>
      makeLedger({ budgetMinor: 100_000, expenses: [expense({ amountMinor: spent })] as never, categoryById: new Map([[1, { id: 1, name: 'Food', color: '' }]]) })
    const { rerender, onMessage } = run(withSpend(50_000)) // 50%: nothing yet
    await settled()
    expect(onMessage).not.toHaveBeenCalled()

    rerender({ l: withSpend(85_000) })
    const close = budgetMessage('monthly', 80)
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith(`${close.title}: ${close.body}`))

    rerender({ l: withSpend(85_500) }) // still in the same band: no repeat
    await act(async () => {})
    expect(onMessage).toHaveBeenCalledOnce()

    rerender({ l: withSpend(105_000) })
    const over = budgetMessage('monthly', 100)
    await waitFor(() => expect(onMessage).toHaveBeenLastCalledWith(`${over.title}: ${over.body}`))
  })

  it('does not greet the person with warnings for spending that was already high when the app opened', async () => {
    at(12)
    const { onMessage } = run(
      makeLedger({ budgetMinor: 100_000, expenses: [expense({ amountMinor: 150_000 })] as never, categoryById: new Map([[1, { id: 1, name: 'Food', color: '' }]]) }),
    )
    await act(async () => {})
    await act(async () => {})
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('is silent about budgets when alerts are off', async () => {
    at(12)
    await setReminderPrefs({ budgetAlerts: false })
    const withSpend = (spent: number) => makeLedger({ budgetMinor: 100_000, expenses: [expense({ amountMinor: spent })] as never })
    const { rerender, onMessage } = run(withSpend(10_000))
    await settled()
    rerender({ l: withSpend(95_000) })
    await settled()
    expect(onMessage).not.toHaveBeenCalled()
  })
})
