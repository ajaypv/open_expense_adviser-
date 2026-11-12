// @vitest-environment jsdom
import '../test/dom'
import { readFileSync } from 'node:fs'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/schema'
import { getReminderPrefs } from '../reminders/store'

const ask = vi.hoisted(() => ({ permission: 'default' as 'default' | 'granted' | 'denied' | 'unsupported', result: 'granted' as 'granted' | 'denied' }))
vi.mock('../reminders/notify', async (original) => ({
  ...(await original<typeof import('../reminders/notify')>()),
  notificationPermission: vi.fn(() => ask.permission),
  requestNotificationPermission: vi.fn(async () => ask.result),
  schedulePeriodicReminder: vi.fn(async () => true),
}))

import { requestNotificationPermission, schedulePeriodicReminder } from '../reminders/notify'
import { Intro } from './Intro'

const css = readFileSync('src/index.css', 'utf8')

beforeEach(() => {
  ask.permission = 'default'
  ask.result = 'granted'
  vi.mocked(requestNotificationPermission).mockClear()
  vi.mocked(schedulePeriodicReminder).mockClear()
})
afterEach(cleanup)

const mount = (onDone = vi.fn()) => {
  render(<Intro open onDone={onDone} />)
  return { onDone, user: userEvent.setup() }
}

describe('Intro: the cards', () => {
  it('opens on a headline and a round button, over cards that are only for looking at', () => {
    mount()
    expect(screen.getByRole('dialog', { name: /Simple spending/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    const field = document.querySelector('.intro-field') as HTMLElement
    expect(field).toHaveAttribute('aria-hidden', 'true')
    expect(field.className).toContain('pointer-events-none')
  })

  it('has three lanes of cards, one going the other way, each a sequence drawn several times so it can drift without a gap', () => {
    mount()
    const lanes = [...document.querySelectorAll<HTMLElement>('.intro-lane')]
    expect(lanes).toHaveLength(3)
    expect(lanes.map((l) => l.dataset.reverse)).toEqual(['false', 'true', 'false'])
    const speeds = lanes.map((l) => l.style.getPropertyValue('--t'))
    expect(new Set(speeds).size).toBe(3)
    expect(lanes[0].querySelectorAll('.intro-card').length % 4).toBe(0)
    expect(lanes[0].querySelectorAll('.intro-card').length).toBeGreaterThanOrEqual(16)
  })

  it('drifts by a quarter of a lane, which is where a sequence begins again, and stands still when motion is reduced', () => {
    expect(css).toMatch(/@keyframes intro-drift \{\s*to \{\s*transform: translateX\(-25%\)/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.intro-lane,\s*\.intro-card,\s*\.intro-field,\s*\.intro-rise \{\s*animation: none/)
  })
})

describe('Intro: asking for notifications', () => {
  it('goes on to the ask, in words about what it is for, when the phone has not been asked yet', async () => {
    const { user } = mount()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Get Notified' })).toBeInTheDocument()
    expect(screen.getByText(/log your day/)).toBeInTheDocument()
    expect(requestNotificationPermission).not.toHaveBeenCalled() // never before the button
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
