// @vitest-environment jsdom
import '../test/dom'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/schema'
import { getReminderPrefs } from '../reminders/store'
import type { ThemePref } from '../theme/useTheme'

const ask = vi.hoisted(() => ({ permission: 'default' as 'default' | 'granted' | 'denied' | 'unsupported', result: 'granted' as 'granted' | 'denied' }))
vi.mock('../reminders/notify', async (original) => ({
  ...(await original<typeof import('../reminders/notify')>()),
  notificationPermission: vi.fn(() => ask.permission),
  requestNotificationPermission: vi.fn(async () => ask.result),
  schedulePeriodicReminder: vi.fn(async () => true),
}))

import { requestNotificationPermission, schedulePeriodicReminder } from '../reminders/notify'
import { Intro } from './Intro'

beforeEach(() => {
  ask.permission = 'default'
  ask.result = 'granted'
  vi.mocked(requestNotificationPermission).mockClear()
  vi.mocked(schedulePeriodicReminder).mockClear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const mount = (onDone = vi.fn(), extra: { theme?: ThemePref; onTheme?: (t: ThemePref) => void } = {}) => {
  render(<Intro open onDone={onDone} {...extra} />)
  return { onDone, user: userEvent.setup() }
}

describe('Intro: a calm, logo-led welcome', () => {
  it('shows one decorative mark rather than a field of animated posters', () => {
    mount()
    expect(screen.getByRole('dialog', { name: /Know where your money goes/ })).toBeInTheDocument()
    expect(screen.getByText('Expense Tracker')).toBeInTheDocument()
    const emblem = document.querySelector('.intro-emblem')
    expect(emblem).toHaveAttribute('aria-hidden', 'true')
    expect(emblem?.querySelectorAll('[data-mark]')).toHaveLength(1)
    expect(document.querySelector('.intro-lane')).toBeNull()
    expect(document.querySelector('.intro-card')).toBeNull()
  })

  it('explains logging and privacy without exposing decorative artwork to screen readers', () => {
    mount()
    expect(screen.getByText(/Type it the way you would say it/)).toBeInTheDocument()
    expect(screen.getByText(/stays private on your phone/)).toBeInTheDocument()
    expect(screen.getByText('No account needed')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('loads the shared mark under a deployed subpath', () => {
    vi.stubEnv('BASE_URL', '/expenses/')
    mount()
    const mark = document.querySelector<HTMLElement>('[data-mark]')!
    expect(mark.style.maskImage).toContain('/expenses/brand-mark.svg')
  })

  it('focuses a visibly labelled Continue button and can advance immediately by keyboard', async () => {
    ask.permission = 'unsupported'
    const { user, onDone } = mount()
    const button = screen.getByRole('button', { name: 'Continue' })
    expect(button).toHaveTextContent('Continue')
    expect(button).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('does not request phone sensors for a decorative welcome animation', () => {
    const listen = vi.spyOn(window, 'addEventListener')
    mount()
    const events = listen.mock.calls.map(([event]) => event)
    expect(events).not.toContain('deviceorientation')
    expect(events).not.toContain('devicemotion')
  })

  it('does not show a dialog until it is opened', () => {
    const { rerender } = render(<Intro open={false} onDone={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(<Intro open onDone={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus()
  })
})

describe('Intro: choosing the theme', () => {
  it('offers light, dark and the system, with the one in use marked', () => {
    mount(vi.fn(), { theme: 'light', onTheme: vi.fn() })
    const options = within(screen.getByRole('radiogroup', { name: 'Theme' })).getAllByRole('radio')
    expect(options.map((o) => o.textContent)).toEqual(['Light', 'Dark', 'System'])
    expect(options.map((o) => o.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
  })

  it('changes the theme as one is chosen, and shows the new one marked', async () => {
    const onTheme = vi.fn()
    const { rerender } = render(<Intro open onDone={vi.fn()} theme="light" onTheme={onTheme} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(onTheme).toHaveBeenCalledWith('dark')
    rerender(<Intro open onDone={vi.fn()} theme="dark" onTheme={onTheme} />)
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false')
    await user.click(screen.getByRole('radio', { name: 'System' }))
    expect(onTheme).toHaveBeenLastCalledWith('system')
  })

  it('does not interrupt the intro: choosing a theme leaves it on the first screen', async () => {
    const { onDone, user } = mount(vi.fn(), { theme: 'light', onTheme: vi.fn() })
    await user.click(screen.getByRole('radio', { name: 'System' }))
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })

  it('leaves the choice out where it is given no theme to show', () => {
    mount()
    expect(screen.queryByRole('radiogroup', { name: 'Theme' })).toBeNull()
  })
})

describe('Intro: asking for notifications', () => {
  it('advances to the notification explanation without requesting permission', async () => {
    const { user } = mount()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Get Notified' })).toBeInTheDocument()
    expect(screen.getByText(/log your day/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on notifications' })).toHaveFocus()
    expect(requestNotificationPermission).not.toHaveBeenCalled()
  })

  it('turns the reminders on, and is done, when notifications are allowed', async () => {
    const { user, onDone } = mount()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(await screen.findByRole('button', { name: 'Turn on notifications' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(await getReminderPrefs()).toMatchObject({ logReminder: true, budgetAlerts: true })
    expect(schedulePeriodicReminder).toHaveBeenCalledWith(true)
  })

  it('changes nothing, and is done, when they are not allowed', async () => {
    ask.result = 'denied'
    const { user, onDone } = mount()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(await screen.findByRole('button', { name: 'Turn on notifications' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect((await getReminderPrefs()).logReminder).toBe(false)
    expect(schedulePeriodicReminder).not.toHaveBeenCalled()
  })

  it('asks for nothing when skipped', async () => {
    const { user, onDone } = mount()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(await screen.findByRole('button', { name: 'Skip' }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(requestNotificationPermission).not.toHaveBeenCalled()
    expect(await db.settings.get('reminders')).toBeUndefined()
  })

  it.each(['granted', 'denied', 'unsupported'] as const)('leaves the ask out when notifications are already %s', async (state) => {
    ask.permission = state
    const { user, onDone } = mount()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('heading', { name: 'Get Notified' })).toBeNull()
  })
})
