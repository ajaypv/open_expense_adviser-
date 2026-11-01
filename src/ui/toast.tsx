import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export interface ToastOptions {
  message: string
  actionLabel?: string
  onAction?: () => void
  /** A second button, shown before the first (such as "Change" beside "Undo"). */
  secondaryLabel?: string
  onSecondary?: () => void
  /** How long it stays, in milliseconds, when the usual time is too short to read what it asks. */
  holdMs?: number
  /** What the message is about, drawn in the pop-up. A tick when none is given. */
  icon?: IconName
  /** The colour that goes with it, such as a category's own colour. */
  color?: string
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => {})

export const useToast = () => useContext(ToastContext)

/** A message that only tells you something. Brief: it has done its job once it has been seen. */
const VISIBLE_MS = 3000
/** With an Undo it stays a little longer, in case it is needed. */
const VISIBLE_WITH_ACTION_MS = 4500
/** How long it lingers after a finger, pointer or keyboard focus leaves it. */
const LINGER_MS = 2000
/** The time it takes to shrink away. */
const EXIT_MS = 220

const exitMs = () => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : EXIT_MS)

/**
 * The pop-up that confirms what just happened. It drops in from the top of the screen like an island, starting as
 * just its icon and opening out to show the words, with the icon popping in; and it shrinks away when its time is up.
 * It waits while it is being read or used. With reduced motion it simply appears and disappears.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const hideIn = useCallback((ms: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setLeaving(true)
      timer.current = window.setTimeout(() => {
        setToast(null)
        setLeaving(false)
      }, exitMs())
    }, ms)
  }, [])

  const stay = useCallback(() => {
    window.clearTimeout(timer.current)
    setLeaving(false)
  }, [])

  const show = useCallback(
    (options: ToastOptions) => {
      setLeaving(false)
      setToast({ ...options, id: Date.now() })
      hideIn(options.holdMs ?? (options.actionLabel ? VISIBLE_WITH_ACTION_MS : VISIBLE_MS))
    },
    [hideIn],
  )

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <ToastContext value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex justify-center px-4"
      >
        {toast && (
          <div
            key={toast.id}
            // It waits while it is being read or used, and goes a moment after the person lets go.
            onPointerEnter={stay}
            onPointerLeave={() => hideIn(LINGER_MS)}
            onFocus={stay}
            onBlur={() => hideIn(LINGER_MS)}
            className={`toast island pointer-events-auto${leaving ? ' island-leave' : ''}`}
          >
            <span
              aria-hidden="true"
              data-icon={toast.icon ?? 'check'}
              className="island-icon"
              style={toast.color ? ({ '--c': toast.color } as CSSProperties) : undefined}
            >
              <Icon name={toast.icon ?? 'check'} size={20} />
            </span>
            <span className="island-text min-w-0 py-1 leading-snug">{toast.message}</span>
            {toast.secondaryLabel && (
              <button
                type="button"
                onClick={() => {
                  toast.onSecondary?.()
                  window.clearTimeout(timer.current)
                  setToast(null)
                  setLeaving(false)
                }}
                className="island-text min-h-11 shrink-0 rounded-full px-3 font-semibold underline underline-offset-2"
              >
                {toast.secondaryLabel}
              </button>
            )}
            {toast.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.()
                  window.clearTimeout(timer.current)
                  setToast(null)
                  setLeaving(false)
                }}
                className="island-text min-h-11 shrink-0 rounded-full px-3 font-semibold underline underline-offset-2"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext>
  )
}
