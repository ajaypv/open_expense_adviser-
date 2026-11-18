import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { ThemePref } from '../theme/useTheme'
import { notificationPermission, requestNotificationPermission, schedulePeriodicReminder } from '../reminders/notify'
import { setReminderPrefs } from '../reminders/store'
import { AppMark } from './AppMark'
import { Dialog } from './Dialog'
import { Icon, type IconName } from './Icon'

const THEMES: { id: ThemePref; label: string; icon: IconName }[] = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'monitor' },
]

function ThemePicker({ value, onChange }: { value: ThemePref; onChange: (t: ThemePref) => void }) {
  return (
    <div role="radiogroup" aria-label="Theme" className="flex gap-0.5 rounded-full bg-surface p-1 shadow-[0_0_0_1px_var(--ring)]">
      {THEMES.map((th) => (
        <button
          key={th.id}
          type="button"
          role="radio"
          aria-checked={value === th.id}
          onClick={() => onChange(th.id)}
          className={`flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors motion-reduce:transition-none ${value === th.id ? 'bg-btn text-btn-ink' : 'text-ink-2'}`}
        >
          <Icon name={th.icon} size={16} />
          {th.label}
        </button>
      ))}
    </div>
  )
}

function Notification({ title, body, time, icon }: { title: string; body: string; time: string; icon: IconName }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-btn text-btn-ink">
        <Icon name={icon} size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink-2">{`Expense Tracker · ${time}`}</span>
        <span className="block truncate font-semibold text-ink">{title}</span>
        <span className="block truncate text-sm text-ink-2">{body}</span>
      </span>
    </div>
  )
}

export function Intro({ open, onDone, theme, onTheme }: { open: boolean; onDone: () => void; theme?: ThemePref; onTheme?: (t: ThemePref) => void }) {
  const [step, setStep] = useState<'hello' | 'notify'>('hello')
  const [busy, setBusy] = useState(false)
  const titleId = useId()
  const primary = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) primary.current?.focus()
  }, [open, step])

  async function next() {
    // Permission is requested only after the separate notification action, never on this first tap.
    const permission = notificationPermission()
    if (permission === 'default') setStep('notify')
    else onDone()
  }

  async function turnOn() {
    setBusy(true)
    const result = await requestNotificationPermission()
    if (result === 'granted') {
      await setReminderPrefs({ logReminder: true, budgetAlerts: true })
      await schedulePeriodicReminder(true)
    }
    setBusy(false)
    onDone()
  }

  const body: Record<typeof step, ReactNode> = {
    hello: (
      <div className="intro-welcome">
        <div className="intro-topbar">
          {theme !== undefined && onTheme && <ThemePicker value={theme} onChange={onTheme} />}
        </div>
        <div className="intro-content">
          <div className="intro-emblem" aria-hidden="true">
            <span className="intro-aura" />
            <AppMark size={136} className="intro-mark" />
          </div>
          <div className="intro-rise text-center">
            <p className="intro-eyebrow">Expense Tracker</p>
            <h2 id={titleId} className="type-headline intro-title">
              Know where{' '}
              <br />
              <span className="text-ink-2">your money goes.</span>
            </h2>
            <p className="intro-description text-ink-2">
              Type it the way you would say it.
              <br />
              It all stays private on your phone.
            </p>
          </div>
        </div>
        <div className="intro-actions intro-rise">
          <button ref={primary} type="button" onClick={() => void next()} className="intro-go flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-btn px-6 text-lg font-semibold text-btn-ink">
            Continue
            <Icon name="arrowRight" size={21} />
          </button>
          <p className="mt-4 text-center text-xs text-ink-2">No account needed</p>
        </div>
      </div>
    ),
    notify: (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex justify-end">
          <button type="button" onClick={onDone} className="min-h-11 rounded-full px-3 text-lg font-medium text-ink">
            Skip
          </button>
        </div>
        <div className="flex flex-col items-center text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-surface-2 text-ink">
            <Icon name="bell" size={30} />
          </span>
          <h2 id={titleId} className="type-title intro-rise mt-5 text-3xl font-medium">
            Get Notified
          </h2>
          <p className="mt-3 max-w-xs text-lg text-ink-2 text-pretty">A nudge each evening to log your day, and a heads-up when you near your budget.</p>
        </div>

        <div className="intro-rise mt-auto divide-y divide-line overflow-hidden rounded-[1.6rem] bg-surface shadow-[0_0_0_1px_var(--ring)]" aria-hidden="true">
          <Notification icon="send" time="9:00 pm" title="Log today’s spending" body="Nothing added today yet. It only takes a few seconds." />
          <Notification icon="warn" time="2d" title="Close to your budget" body="You’ve used 80% of your overall budget this month." />
          <Notification icon="check" time="1w" title="Over budget" body="You’ve gone over your Food & Dining budget this month." />
        </div>

        <button
          ref={primary}
          type="button"
          onClick={() => void turnOn()}
          disabled={busy}
          className="min-h-14 w-full shrink-0 rounded-full bg-btn text-xl font-semibold text-btn-ink active:opacity-80 disabled:opacity-60"
        >
          Turn on notifications
        </button>
      </div>
    ),
  }

  return (
    <Dialog open={open} onClose={onDone} labelledBy={titleId} variant="page">
      <div className="min-h-dvh bg-bg text-ink">{body[step]}</div>
    </Dialog>
  )
}
