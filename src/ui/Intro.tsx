import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { currentPermission, requestNotificationPermission, schedulePeriodicReminder } from '../reminders/notify'
import { setReminderPrefs } from '../reminders/store'
import { Dialog } from './Dialog'
import { Icon, type IconName } from './Icon'

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

/** What the app does, as little posters: the first thing a new person sees is cards drifting by, each a small picture of a thing they can do. */
const LANES: { cards: Poster[]; seconds: number; reverse: boolean; top: string }[] = [
  {
    top: '0%',
    seconds: 90,
    reverse: false,
    cards: [
      { w: 9.5, bg: '#ffd9cf', ink: '#6b1a0a', icon: 'utensils', title: 'Lunch', sub: '₹250 · Food & Dining', drop: 0.5 },
      { w: 11, bg: '#1b2a47', ink: '#e6efff', icon: 'bars', title: 'Budget', sub: '₹18,600 left', art: 'budget', drop: 2.5 },
      { w: 9, bg: '#d4f1d8', ink: '#0f3d1d', icon: 'cart', title: 'Groceries', sub: '₹1,240', drop: 0 },
      { w: 10, bg: '#13331f', ink: '#c9f7d6', icon: 'arrowDown', title: 'Received', sub: '+₹85,000 salary', drop: 3 },
    ],
  },
  {
    top: '27%',
    seconds: 110,
    reverse: true,
    cards: [
      { w: 11, bg: '#dbe9ff', ink: '#0d2a55', icon: 'spark', title: 'Today', sub: '₹900 · 2 expenses', art: 'water', drop: 0 },
      { w: 9, bg: '#fff0c2', ink: '#5a4100', icon: 'receipt', title: 'Electricity', sub: '₹960 · due Friday', drop: 2 },
      { w: 10, bg: '#f1e1ff', ink: '#3c1066', icon: 'flag', title: 'Trip to Goa', sub: '68% saved', art: 'ring', drop: 0.5 },
      { w: 9.5, bg: '#d6e6ff', ink: '#0d2a55', icon: 'car', title: 'Ride home', sub: '₹180 · Transport', drop: 2.5 },
    ],
  },
  {
    top: '53%',
    seconds: 100,
    reverse: false,
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
        className="intro-card rounded-[1.4rem] bg-white/10 p-1.5 shadow-[0_10px_30px_rgb(0_0_0/0.45),inset_0_0_0_1px_rgb(255_255_255/0.16)] backdrop-blur-sm"
        style={{ width: `${p.w}rem`, '--b': `${6 + (index % 4)}s`, '--bd': `${-index * 1.3}s` } as CSSProperties}
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

/** The cards drifting by in three lanes, two one way and one the other, each at its own pace, each card bobbing a little. */
function Cards() {
  return (
    <div aria-hidden="true" className="intro-field pointer-events-none absolute inset-x-0 top-0 h-[54%] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_80%,transparent)]">
      {LANES.map((lane, li) => (
        <div key={li} className="absolute left-0" style={{ top: lane.top }}>
          <div className="intro-lane flex w-max" data-reverse={lane.reverse} style={{ '--t': `${lane.seconds}s` } as CSSProperties}>
            {Array.from({ length: COPIES }, (_, c) => lane.cards.map((p, i) => <PosterCard key={`${c}-${i}`} p={p} index={li * 4 + i} />))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** The mark: a small rounded square with a spark, in the colours of the headline. */
function Mark() {
  return (
    <span className="flex size-8 items-center justify-center rounded-xl text-white" style={{ background: 'linear-gradient(135deg,#d946ef,#fb923c)' }}>
      <Icon name="spark" size={17} />
    </span>
  )
}

const GRADIENT = 'linear-gradient(135deg,#e24fd0 0%,#f4577a 45%,#f7a23b 100%)'

function Notification({ title, body, time, icon }: { title: string; body: string; time: string; icon: IconName }) {
  return (
    <div className="flex items-center gap-3 bg-[#2a2a2c] px-4 py-3 first:rounded-t-[1.6rem] last:rounded-b-[1.6rem]">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-black">
        <Icon name={icon} size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-white/70">{`Expense Tracker · ${time}`}</span>
        <span className="block truncate font-medium text-white">{title}</span>
        <span className="block truncate text-sm text-white/60">{body}</span>
      </span>
    </div>
  )
}

/**
 * What a new person sees first, before the three questions: a full screen of little cards drifting past, a headline, and a round button; then
 * one ask, to turn notifications on (the phone's own prompt comes when they press the button, never before, since iPhones only show it
 * after a tap). Turning them on sets up the evening reminder to log the day and the budget alerts. Skipping asks for nothing. Either way
 * it is over for good, and the questions follow. Where notifications cannot be asked for (blocked already, or a browser with none)
 * the second screen is left out.
 */
export function Intro({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [step, setStep] = useState<'hello' | 'notify'>('hello')
  const [busy, setBusy] = useState(false)
  const titleId = useId()
  const primary = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) primary.current?.focus()
  }, [open, step])

  async function next() {
    // Only a phone that has not been asked yet is asked: otherwise there is nothing to turn on here.
    const permission = await currentPermission()
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
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center">
          <span className="flex items-center gap-2 text-white/60">
            <Mark />
            <span className="text-lg font-medium tracking-tight">Expense Tracker</span>
          </span>
          <h2 id={titleId} className="intro-rise mt-5 text-[2.6rem] font-semibold leading-[1.05] tracking-tight">
            Simple spending
            <br />
            <span style={{ background: GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>starts here</span>
          </h2>
          <p className="mt-3 max-w-xs text-white/60">Type what you spend, as you would say it. Everything stays on your phone.</p>
          <button
            ref={primary}
            type="button"
            onClick={() => void next()}
            aria-label="Continue"
            className="mt-8 flex size-[4.25rem] items-center justify-center rounded-full text-white shadow-[0_8px_30px_rgb(244_87_122/0.4)] active:scale-95"
            style={{ background: GRADIENT }}
          >
            <span className="rotate-90">
              <Icon name="arrowUp" size={28} weight={2} />
            </span>
          </button>
        </div>
      </>
    ),
    notify: (
      <div className="flex min-h-dvh flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex justify-end">
          <button type="button" onClick={onDone} className="min-h-11 rounded-full px-3 text-lg font-medium text-white">
            Skip
          </button>
        </div>
        <div className="mt-3 flex flex-col items-center text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-white/10 text-white">
            <Icon name="bell" size={30} />
          </span>
          <h2 id={titleId} className="intro-rise mt-5 text-3xl font-semibold tracking-tight">
            Get Notified
          </h2>
          <p className="mt-3 max-w-xs text-lg text-white/70">A nudge each evening to log your day, and a heads-up when you near your budget.</p>
        </div>

        <div className="intro-rise mt-auto overflow-hidden rounded-[1.6rem]" aria-hidden="true">
          <Notification icon="send" time="9:00 pm" title="Log today’s spending" body="Nothing added today yet. It only takes a few seconds." />
          <div className="h-0.5 bg-black" />
          <Notification icon="warn" time="2d" title="Close to your budget" body="You’ve used 80% of your overall budget this month." />
          <div className="h-0.5 bg-black" />
          <Notification icon="check" time="1w" title="Over budget" body="You’ve gone over your Food & Dining budget this month." />
        </div>

        <button
          ref={primary}
          type="button"
          onClick={() => void turnOn()}
          disabled={busy}
          className="mt-6 min-h-14 w-full rounded-full bg-white text-xl font-medium text-black active:opacity-80 disabled:opacity-60"
        >
          Turn on notifications
        </button>
      </div>
    ),
  }

  return (
    <Dialog open={open} onClose={onDone} labelledBy={titleId} variant="page">
      <div className="relative min-h-dvh overflow-hidden bg-[#0a0a0b] text-white">{body[step]}</div>
    </Dialog>
  )
}
