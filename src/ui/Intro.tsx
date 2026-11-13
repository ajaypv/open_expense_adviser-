import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { ThemePref } from '../theme/useTheme'
import { notificationPermission, requestNotificationPermission, schedulePeriodicReminder } from '../reminders/notify'
import { setReminderPrefs } from '../reminders/store'
import { Dialog } from './Dialog'
import { Icon, type IconName } from './Icon'
import { useSway } from './useSway'

interface Poster {
  /** Width in rem; the card is as tall as its content. */
  w: number
  bg: string
  ink: string
  icon: IconName
  title: string
  sub: string
  /** Something to draw between the icon and the words. */
  art?: 'budget' | 'water' | 'ring' | 'dots'
  /** How far down its lane it sits, in rem, so the cards of a lane do not line up. */
  drop: number
}

/**
 * What the app does, as little posters: the first thing a new person sees is cards flowing by, each a small picture of a thing they can do.
 * All three lanes flow from the right to the left, at three paces, and the lane behind is smaller and slower than the one in front, so the
 * field has depth. Each lane arrives from the right, one after another, when the screen opens. They also answer the phone: tipped (the
 * gyroscope), the lanes slide against it, the nearest the most, as things at different distances would; pushed or shaken (the
 * accelerometer), they are jolted.
 */
const LANES: { cards: Poster[]; seconds: number; scale: number; top: string; depth: number }[] = [
  {
    top: '0%',
    seconds: 150,
    scale: 0.86,
    depth: 0.5,
    cards: [
      { w: 9.5, bg: '#ffd9cf', ink: '#6b1a0a', icon: 'utensils', title: 'Lunch', sub: '₹250 · Food & Dining', drop: 0.5 },
      { w: 11, bg: '#1b2a47', ink: '#e6efff', icon: 'bars', title: 'Budget', sub: '₹18,600 left', art: 'budget', drop: 2.5 },
      { w: 9, bg: '#d4f1d8', ink: '#0f3d1d', icon: 'cart', title: 'Groceries', sub: '₹1,240', drop: 0 },
      { w: 10, bg: '#13331f', ink: '#c9f7d6', icon: 'arrowDown', title: 'Received', sub: '+₹85,000 salary', drop: 3 },
    ],
  },
  {
    top: '31%',
    seconds: 105,
    scale: 1,
    depth: 1,
    cards: [
      { w: 11, bg: '#dbe9ff', ink: '#0d2a55', icon: 'spark', title: 'Today', sub: '₹900 · 2 expenses', art: 'water', drop: 0 },
      { w: 9, bg: '#fff0c2', ink: '#5a4100', icon: 'receipt', title: 'Electricity', sub: '₹960 · due Friday', drop: 2 },
      { w: 10, bg: '#f1e1ff', ink: '#3c1066', icon: 'flag', title: 'Trip to Goa', sub: '68% saved', art: 'ring', drop: 0.5 },
      { w: 9.5, bg: '#d6e6ff', ink: '#0d2a55', icon: 'car', title: 'Ride home', sub: '₹180 · Transport', drop: 2.5 },
    ],
  },
  {
    top: '60%',
    seconds: 78,
    scale: 1.08,
    depth: 1.8,
    cards: [
      { w: 10.5, bg: '#102f38', ink: '#c9f1ff', icon: 'check', title: '11 quiet days', sub: 'Well done.', art: 'dots', drop: 0 },
      { w: 9, bg: '#ffe0ec', ink: '#6a0f33', icon: 'bag', title: 'Shopping', sub: '₹2,100', drop: 2 },
      { w: 10, bg: '#e3f7e7', ink: '#124222', icon: 'repeat', title: 'Subscription', sub: '₹649 · monthly', drop: 0.5 },
      { w: 9.5, bg: '#ffe6c7', ink: '#5a2c00', icon: 'emi', title: 'EMI', sub: '₹4,500 · on the 5th', drop: 2.5 },
    ],
  },
]

/** The sequence is drawn this many times in a row, so a lane is never bare while it drifts a whole sequence along (it moves 1/COPIES). */
const COPIES = 4

function Art({ kind }: { kind: NonNullable<Poster['art']> }) {
  if (kind === 'budget') {
    return (
      <span className="block h-2 overflow-hidden rounded-full bg-white/15">
        <span className="block h-full w-[64%] rounded-full" style={{ background: '#5fd68a' }} />
      </span>
    )
  }
  if (kind === 'water') {
    return (
      <svg viewBox="0 0 100 24" className="block h-6 w-full overflow-hidden rounded-full bg-black/10" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 9C8 3 17 15 26 9S43 3 52 9 69 15 78 9 92 3 100 9V24H0Z" fill="#3b82f6" />
      </svg>
    )
  }
  if (kind === 'ring') {
    return (
      <svg viewBox="0 0 36 36" className="size-9" aria-hidden="true">
        <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
        <circle cx="18" cy="18" r="14" fill="none" stroke="#a855f7" strokeWidth="4" strokeLinecap="round" strokeDasharray="88" strokeDashoffset="28" transform="rotate(-90 18 18)" />
      </svg>
    )
  }
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} className="size-2 rounded-full" style={{ background: i < 5 ? '#34d1c9' : 'rgb(255 255 255 / 0.25)' }} />
      ))}
    </span>
  )
}

function PosterCard({ p, index }: { p: Poster; index: number }) {
  return (
    <div className="shrink-0 pr-5" style={{ paddingTop: `${p.drop}rem` }}>
      <div
        className="intro-card rounded-[1.4rem] p-1.5"
        style={{
          width: `${p.w}rem`,
          '--b': `${6 + (index % 4)}s`,
          '--bd': `${-index * 1.3}s`,
          // A pane of glass in the theme's own surface, so the frame is white on a light page and dark on a dark one.
          background: 'color-mix(in oklab, var(--surface) 62%, transparent)',
          boxShadow: '0 14px 30px rgb(20 20 10 / 0.14), inset 0 0 0 1px var(--ring)',
          backdropFilter: 'blur(4px)',
        } as CSSProperties}
      >
        <div className="flex min-h-[7.5rem] flex-col justify-between gap-3 rounded-[1.05rem] p-3" style={{ background: p.bg, color: p.ink }}>
          <span className="flex size-8 items-center justify-center rounded-full bg-black/10">
            <Icon name={p.icon} size={17} />
          </span>
          {p.art && <Art kind={p.art} />}
          <span>
            <span className="block text-[0.9375rem] font-semibold leading-tight">{p.title}</span>
            <span className="block text-xs opacity-70">{p.sub}</span>
          </span>
        </div>
      </div>
    </div>
  )
}

/** The cards flowing from the right to the left in three lanes at three paces, each card bobbing a little. */
function Cards() {
  const field = useRef<HTMLDivElement>(null)
  // Reads the phone and writes --tx, --ty and --jx on the field; each lane moves by them, in proportion to its depth (--k).
  useSway(field, { idle: false })
  return (
    <div ref={field} aria-hidden="true" className="intro-field pointer-events-none absolute inset-x-0 top-0 h-[56%] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_78%,transparent)]">
      {LANES.map((lane, li) => (
        // The wrapper brings the lane in from the right, and sets its size; the lane inside it flows.
        <div key={li} className="intro-enter absolute left-0 origin-top-left" style={{ top: lane.top, scale: String(lane.scale), '--e': `${li * 160}ms`, '--k': lane.depth } as CSSProperties}>
          <div className="intro-lane flex w-max" data-flow="left" style={{ '--t': `${lane.seconds}s`, '--o': String(-li * 0.17) } as CSSProperties}>
            {Array.from({ length: COPIES }, (_, c) => lane.cards.map((p, i) => <PosterCard key={`${c}-${i}`} p={p} index={li * 4 + i} />))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The mark of the app, as its icon is: a ring cut into the colours of the categories, with a bright dot at the middle, on a dark tile.
 * It is the same picture as the launcher icon, so the app opens on what was tapped.
 */
export function AppMark({ size = 44 }: { size?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className="intro-mark block shrink-0 drop-shadow-[0_6px_14px_rgb(0_0_0/0.25)]" aria-hidden="true" data-mark>
      <defs>
        <radialGradient id={`${id}-bg`} cx="0.3" cy="0.22" r="0.95">
          <stop offset="0" stopColor="#2a2925" />
          <stop offset="0.55" stopColor="#151514" />
          <stop offset="1" stopColor="#0d0d0d" />
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#${id}-bg)`} />
      <g transform="translate(5 5)">
        <circle cx="256" cy="256" r="112" fill="none" stroke="#3987e5" strokeWidth="80" strokeDasharray="258.41 445.30" strokeDashoffset="-4.5" transform="rotate(-90 256 256)" />
        <circle cx="256" cy="256" r="112" fill="none" stroke="#199e70" strokeWidth="80" strokeDasharray="159.89 543.82" strokeDashoffset="-271.91" transform="rotate(-90 256 256)" />
        <circle cx="256" cy="256" r="112" fill="none" stroke="#c98500" strokeWidth="80" strokeDasharray="103.59 600.12" strokeDashoffset="-440.8" transform="rotate(-90 256 256)" />
        <circle cx="256" cy="256" r="112" fill="none" stroke="#d95926" strokeWidth="80" strokeDasharray="145.82 557.9" strokeDashoffset="-553.4" transform="translate(-19.12 -23.12) rotate(-90 256 256)" />
        <circle cx="256" cy="256" r="34" fill="#f0efec" />
      </g>
    </svg>
  )
}

const THEMES: { id: ThemePref; label: string; icon: IconName }[] = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'monitor' },
]

/** Light, dark or whatever the phone is set to, at the top of the first screen, and the page changes as it is chosen. */
function ThemePicker({ value, onChange }: { value: ThemePref; onChange: (t: ThemePref) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex -translate-x-1/2 gap-0.5 rounded-full p-1"
      style={{ background: 'color-mix(in oklab, var(--surface) 82%, transparent)', boxShadow: '0 6px 18px rgb(0 0 0 / 0.12), inset 0 0 0 1px var(--ring)', backdropFilter: 'blur(10px)' }}
    >
      {THEMES.map((th) => {
        const on = value === th.id
        return (
          <button
            key={th.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(th.id)}
            className={`flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors motion-reduce:transition-none ${on ? 'bg-btn text-btn-ink' : 'text-ink-2'}`}
          >
            <Icon name={th.icon} size={16} />
            {th.label}
          </button>
        )
      })}
    </div>
  )
}

/** The second line of the headline, in the blue and green of the ring. */
const ACCENT = 'linear-gradient(100deg, var(--s1) 0%, var(--s3) 100%)'

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

/**
 * What a new person sees first, before the three questions: a full screen of little cards flowing from the right to the left, the app's mark,
 * a headline, and a round button with an arrow; then one ask, to turn notifications on (the phone's own prompt comes when they press the
 * button, never before, since iPhones only show it after a tap). Turning them on sets up the evening reminder to log the day and the budget
 * alerts. Skipping asks for nothing. Either way it is over for good, and the questions follow. Where notifications cannot be asked for (blocked
 * already, or a browser with none) the second screen is left out. It is set in the app's own theme, light unless the person has chosen otherwise,
 * so the button is the theme's button and the page is the theme's page; and the first screen lets them choose that theme right there.
 */
export function Intro({ open, onDone, theme, onTheme }: { open: boolean; onDone: () => void; theme?: ThemePref; onTheme?: (t: ThemePref) => void }) {
  const [step, setStep] = useState<'hello' | 'notify'>('hello')
  const [busy, setBusy] = useState(false)
  const titleId = useId()
  const primary = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) primary.current?.focus()
  }, [open, step])

  async function next() {
    // Only a phone that has not been asked yet is asked: otherwise there is nothing to turn on here.
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
      <>
        <Cards />
        {theme !== undefined && onTheme && <ThemePicker value={theme} onChange={onTheme} />}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center">
          <span className="intro-rise flex items-center gap-2.5">
            <AppMark size={40} />
            <span className="text-lg font-semibold tracking-tight text-ink-2">Expense Tracker</span>
          </span>
          <h2 id={titleId} className="type-display intro-rise mt-5 text-[clamp(2.5rem,2rem+3vw,3.25rem)] text-balance" style={{ lineHeight: 1.04 }}>
            Know where{' '}
            <br />
            <span style={{ background: ACCENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>your money goes.</span>
          </h2>
          <p className="intro-rise mt-4 max-w-[19rem] text-lg leading-snug text-ink-2 text-pretty" style={{ animationDelay: '0.32s' }}>
            Type it the way you would say it, like “450 lunch at Cafe”. It all stays private on your phone.
          </p>
          <button
            ref={primary}
            type="button"
            onClick={() => void next()}
            aria-label="Continue"
            className="intro-go intro-rise relative mt-8 flex size-[4.25rem] items-center justify-center rounded-full bg-btn text-btn-ink shadow-[0_10px_26px_rgb(0_0_0/0.22)] active:scale-95"
            style={{ animationDelay: '0.45s' }}
          >
            <Icon name="arrowRight" size={28} weight={2} />
          </button>
        </div>
      </>
    ),
    notify: (
      <div className="flex min-h-dvh flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex justify-end">
          <button type="button" onClick={onDone} className="min-h-11 rounded-full px-3 text-lg font-medium text-ink">
            Skip
          </button>
        </div>
        <div className="mt-3 flex flex-col items-center text-center">
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
          className="mt-6 min-h-14 w-full rounded-full bg-btn text-xl font-semibold text-btn-ink active:opacity-80 disabled:opacity-60"
        >
          Turn on notifications
        </button>
      </div>
    ),
  }

  return (
    <Dialog open={open} onClose={onDone} labelledBy={titleId} variant="page">
      <div className="relative min-h-dvh overflow-hidden bg-bg text-ink">{body[step]}</div>
    </Dialog>
  )
}
