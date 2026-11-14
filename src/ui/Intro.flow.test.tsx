// @vitest-environment jsdom
import '../test/dom'
import { readFileSync } from 'node:fs'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
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
import { tilt } from './useTilt'
import { Intro } from './Intro'

const css = readFileSync('src/index.css', 'utf8')
const source = readFileSync('src/ui/Intro.tsx', 'utf8')
const realMatchMedia = window.matchMedia

beforeEach(() => {
  ask.permission = 'default'
  ask.result = 'granted'
  vi.mocked(requestNotificationPermission).mockClear()
  vi.mocked(schedulePeriodicReminder).mockClear()
})
afterEach(() => {
  cleanup()
  window.matchMedia = realMatchMedia
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const mount = (onDone = vi.fn(), extra: { theme?: ThemePref; onTheme?: (t: ThemePref) => void } = {}) => {
  render(<Intro open onDone={onDone} {...extra} />)
  return { onDone, user: userEvent.setup() }
}

describe('Intro: the cards', () => {
  it('opens on a headline and a round arrow button, over cards that are only for looking at', () => {
    mount()
    expect(screen.getByRole('dialog', { name: /Know where your money goes/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    const field = document.querySelector('.intro-field') as HTMLElement
    expect(field).toHaveAttribute('aria-hidden', 'true')
    expect(field.className).toContain('pointer-events-none')
  })

  it('says what the app is for, and that it stays on the phone', () => {
    mount()
    expect(screen.getByText(/Type it the way you would say it/)).toBeInTheDocument()
    expect(screen.getByText(/stays private on your phone/)).toBeInTheDocument()
  })

  it('sets its words as every page does: the headline in the page’s own face, the sentence at the body size in the quiet ink with its figure bold in the number face', () => {
    mount()
    const heading = screen.getByRole('heading', { name: /Know where your money goes/ })
    expect(heading.className).toContain('type-headline')
    const sentence = screen.getByText(/Type it the way you would say it/)
    expect(sentence.className).toContain('text-[1.0625rem]')
    expect(sentence.className).toContain('leading-[1.6]')
    expect(sentence.className).toContain('text-ink-2')
    expect(sentence.querySelector('b.num')!.textContent).toBe('450')
    expect(sentence.textContent).toBe('Type it the way you would say it, like “450 lunch at Cafe”. It all stays private on your phone.')
  })

  it('has four lanes of cards all flowing from the right to the left, at four paces, each a sequence drawn several times so it can drift without a gap', () => {
    mount()
    const lanes = [...document.querySelectorAll<HTMLElement>('.intro-lane')]
    expect(lanes).toHaveLength(4)
    expect(lanes.map((l) => l.dataset.flow)).toEqual(['left', 'left', 'left', 'left'])
    const speeds = lanes.map((l) => l.style.getPropertyValue('--t'))
    expect(new Set(speeds).size).toBe(4)
    expect(lanes[0].querySelectorAll('.intro-card').length % 4).toBe(0)
    expect(lanes[0].querySelectorAll('.intro-card').length).toBeGreaterThanOrEqual(16)
  })

  it('keeps the lane behind slower and smaller than the one in front, so the field has depth', () => {
    mount()
    const wrappers = [...document.querySelectorAll<HTMLElement>('.intro-enter')]
    const lanes = [...document.querySelectorAll<HTMLElement>('.intro-lane')]
    const seconds = lanes.map((l) => parseFloat(l.style.getPropertyValue('--t')))
    const scales = wrappers.map((w) => parseFloat(w.style.scale))
    const depths = wrappers.map((w) => parseFloat(w.style.getPropertyValue('--k')))
    for (let i = 1; i < 4; i++) {
      expect(seconds[i - 1]).toBeGreaterThan(seconds[i])
      expect(scales[i - 1]).toBeLessThan(scales[i])
      expect(depths[i - 1]).toBeLessThan(depths[i])
    }
  })

  it('lays the lanes over one another, a lane lower than the last but not by a whole card, so a big card slides over a small one', () => {
    mount()
    const tops = [...document.querySelectorAll<HTMLElement>('.intro-enter')].map((w) => parseFloat(w.style.top))
    expect(tops[0]).toBe(0)
    for (let i = 1; i < 4; i++) expect(tops[i]).toBeGreaterThan(tops[i - 1])
    // The step between lanes is well under the height of a card, a fifth of the field at most.
    for (let i = 1; i < 4; i++) expect(tops[i] - tops[i - 1]).toBeLessThanOrEqual(22)
    // Later lanes are later in the page, so they are in front.
    const wrappers = [...document.querySelectorAll('.intro-enter')]
    expect(wrappers.every((w, i) => i === 0 || (wrappers[i - 1].compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)).toBe(true)
  })

  it('does not set the cards in a row: they sit at different heights and a different distance apart', () => {
    mount()
    const lane = document.querySelector<HTMLElement>('.intro-lane')!
    const slots = [...lane.children].slice(0, 4) as HTMLElement[]
    expect(new Set(slots.map((s) => s.style.paddingTop)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(slots.map((s) => s.style.paddingRight)).size).toBeGreaterThanOrEqual(3)
  })

  it('makes each card a small poster in a pane of glass: what it is, a big figure, and a line under it', () => {
    mount()
    const cards = [...document.querySelectorAll<HTMLElement>('.intro-card')]
    expect(cards.length).toBe(64)
    const first = cards[0]
    expect(first.style.boxShadow).toContain('inset')
    expect(first.querySelector('.num')).not.toBeNull()
    expect(first.querySelector('svg')).not.toBeNull() // the round icon
    for (const text of ['₹250', 'Money flow', 'Budget', '+₹85,000', 'Quiet days']) expect(document.body.textContent).toContain(text)
  })

  it('has the duck of an empty day on one of the cards, and the ribbons of the money flow on another', () => {
    mount()
    expect(document.body.textContent).toContain('Nothing spent yet')
    expect(document.querySelector('.intro-card ellipse[fill="#FFD23F"]')).not.toBeNull()
    expect(document.querySelector('.intro-card path[stroke="#34d399"]')).not.toBeNull()
  })

  it('drifts by a quarter of a lane, always to the left, which is where a sequence begins again, and stands still when motion is reduced', () => {
    expect(css).toMatch(/@keyframes intro-drift \{\s*to \{\s*transform: translateX\(-25%\)/)
    expect(css).toMatch(/@keyframes intro-enter \{\s*from \{\s*opacity: 0;\s*transform: translateX\(70%\)/)
    expect(css).not.toMatch(/intro-lane\[data-reverse/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.intro-lane,\s*\.intro-card,\s*\.intro-field,\s*\.intro-enter,\s*\.intro-rise,\s*\.intro-mark,\s*\.intro-go::after,\s*\.intro-go > svg \{\s*animation: none/)
  })
})

describe('Intro: the mark and the button, in the app’s own theme', () => {
  it('shows the ring of the app’s icon, not a spark', () => {
    mount()
    const mark = document.querySelector('[data-mark]')!
    expect(mark).not.toBeNull()
    // Four arcs in the colours of the categories and the bright dot, as the launcher icon is drawn.
    expect(mark.querySelectorAll('circle[stroke]')).toHaveLength(4)
    expect(Array.from(mark.querySelectorAll('circle[stroke]')).map((c) => c.getAttribute('stroke'))).toEqual(['#3987e5', '#199e70', '#c98500', '#d95926'])
  })

  it('has the theme’s own button with a right arrow, not a colour of its own', () => {
    mount()
    const button = screen.getByRole('button', { name: 'Continue' })
    expect(button.className).toContain('bg-btn')
    expect(button.className).toContain('text-btn-ink')
    expect(button.className).toContain('intro-go')
    expect(button.querySelector('svg path')?.getAttribute('d')).toBe('M5 12h14M13 6l6 6-6 6')
  })

  it('sets the page in the theme’s colours, so it is light by default and dark in dark, with no fixed black page', () => {
    mount()
    // (The cards keep their own pastel and dark faces, with a little white or black on them; the page and its text are the theme's.)
    expect(source).not.toMatch(/bg-\[#0a0a0b\]|text-white/)
    expect(document.querySelector('dialog [class*="bg-bg"]')).not.toBeNull()
  })
})

describe('Intro: choosing the theme', () => {
  it('offers light, dark and the system, with the one in use marked', () => {
    mount(vi.fn(), { theme: 'light', onTheme: vi.fn() })
    const group = screen.getByRole('radiogroup', { name: 'Theme' })
    const options = within(group).getAllByRole('radio')
    expect(options.map((o) => o.textContent)).toEqual(['Light', 'Dark', 'System'])
    expect(options.map((o) => o.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
  })

  it('changes the theme as one is chosen, and shows the new one marked', async () => {
    const onTheme = vi.fn()
    const { rerender } = (() => {
      const r = render(<Intro open onDone={vi.fn()} theme="light" onTheme={onTheme} />)
      return r
    })()
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

describe('Intro: the cards move with the phone', () => {
  let frames: FrameRequestCallback[] = []
  let clock = 0
  const allow = () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes('no-preference'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    frames = []
    clock = 0
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
  }
  const play = (n: number) =>
    act(() => {
      for (let i = 0; i < n; i++) {
        clock += 1000 / 60
        const due = frames
        frames = []
        for (const cb of due) cb(clock)
      }
    })
  const orient = (gamma: number, beta = 55) => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { gamma, beta, alpha: 0 }))
  const motion = (x: number, y = 0, z = 0) => window.dispatchEvent(Object.assign(new Event('devicemotion'), { acceleration: { x, y, z } }))
  const field = () => document.querySelector<HTMLElement>('.intro-field')!
  const v = (name: string) => Number(field().style.getPropertyValue(name))

  it('slides the cards against the way the phone is rolled, and back to rest when it is level', () => {
    allow()
    mount()
    orient(0)
    play(60)
    expect(v('--tx')).toBeCloseTo(0, 1)
    orient(30)
    play(60)
    expect(v('--tx')).toBeLessThan(-0.5)
    orient(-30)
    play(60)
    expect(v('--tx')).toBeGreaterThan(0.5)
  })

  it('moves them up and down as the phone is tipped forward and back', () => {
    allow()
    mount()
    orient(0, 85)
    play(60)
    expect(v('--ty')).toBeGreaterThan(0.4)
    orient(0, 25)
    play(60)
    expect(v('--ty')).toBeLessThan(-0.4)
  })

  it('takes a push (the accelerometer) as a swing, and a shake as a jolt that dies down', () => {
    allow()
    mount()
    orient(0)
    play(30)
    for (let i = 0; i < 6; i++) {
      motion(i % 2 ? 22 : -22, 8, 4)
      play(2)
    }
    expect(v('--shake')).toBeGreaterThan(0.3)
    play(180)
    expect(v('--shake')).toBe(0)
  })

  it('moves the nearest lane the most, as the depth of each says', () => {
    expect(css).toMatch(/\.intro-enter \{[^}]*translate: calc\(\(var\(--tx, 0\) \* 16px[^}]*var\(--k, 1\)\)/)
  })

  it('holds still, and does not listen, when the person has asked for less motion', () => {
    allow()
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    mount()
    play(30)
    orient(30)
    expect(tilt.live).toBe(false)
    expect(field().style.getPropertyValue('--tx')).toBe('')
  })

  it('does not sway by itself where there is no sensor, since the cards are already flowing', () => {
    allow()
    mount()
    play(120)
    expect(tilt.live).toBe(false)
    expect(v('--tx')).toBe(0)
    expect(v('--ty')).toBe(0)
  })

  it('lets go of the sensors when the intro goes away', () => {
    allow()
    const { unmount } = (() => {
      const r = render(<Intro open onDone={vi.fn()} />)
      return r
    })()
    orient(10)
    expect(tilt.live).toBe(true)
    unmount()
    expect(tilt.live).toBe(false)
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
