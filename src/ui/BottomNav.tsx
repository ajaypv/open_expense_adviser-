import { useRef } from 'react'
import type { Goal } from '../db/schema'
import { GoalsButton } from './GoalsButton'
import { Icon, type IconName } from './Icon'

export type Tab = 'home' | 'activity' | 'insights' | 'settings'

/** The tabs of the bottom bar. Goals is the fourth place on it but opens a page over the screen, and Settings is reached from the round button at the top of a screen. */
export const TABS: { id: Exclude<Tab, 'settings'>; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'activity', label: 'Activity', icon: 'list' },
  { id: 'insights', label: 'Insights', icon: 'bars' },
]

/** Every screen, in the order a switch between them slides: Settings is past Insights, to the right. */
export const TAB_ORDER: Tab[] = ['home', 'activity', 'insights', 'settings']

/** What the bar says of a screen, for the title of the page. */
export const TAB_LABELS: Record<Tab, string> = { home: 'Home', activity: 'Activity', insights: 'Insights', settings: 'Settings' }

/** How far a finger must travel along the bar, and how much more sideways than up or down, for it to count as a swipe. */
const SWIPE_MIN = 40
const SWIPE_SLOPE = 1.5

interface Props {
  current: Tab
  onSelect: (tab: Tab) => void
  /** The goals, for what the Goals button says in words. */
  goals: Goal[]
  onOpenGoals: () => void
  /** A swipe along the bar: `left` is the finger going left. The bar does not decide what it means. */
  onSwipe?: (direction: 'left' | 'right') => void
}

export function BottomNav({ current, onSelect, goals, onOpenGoals, onSwipe }: Props) {
  const from = useRef<{ x: number; y: number } | null>(null)
  const swallow = useRef(false)

  return (
    <nav
      aria-label="Main"
      className={`border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] ${onSwipe ? 'touch-pan-y' : ''}`}
      onPointerDown={(e) => {
        if (!onSwipe || e.pointerType === 'mouse') return
        from.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerCancel={() => (from.current = null)}
      onPointerUp={(e) => {
        const start = from.current
        from.current = null
        if (!start || !onSwipe) return
        const dx = e.clientX - start.x
        const dy = e.clientY - start.y
        if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * SWIPE_SLOPE) return
        // The click that follows letting go must not press the tab the finger ended on.
        swallow.current = true
        window.setTimeout(() => (swallow.current = false), 120)
        onSwipe(dx < 0 ? 'left' : 'right')
      }}
      onClickCapture={(e) => {
        if (!swallow.current) return
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.id === current
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onSelect(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-medium short:min-h-11 ${
                  active ? 'text-ink' : 'text-muted'
                }`}
              >
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-full ${
                    active ? 'bg-surface-2' : ''
                  }`}
                >
                  <Icon name={tab.icon} size={21} />
                </span>
                <span className="short:sr-only">{tab.label}</span>
              </button>
            </li>
          )
        })}
        <li>
          <GoalsButton goals={goals} onClick={onOpenGoals} />
        </li>
      </ul>
    </nav>
  )
}
