import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export interface ToastOptions {
  message: string
  actionLabel?: string
  onAction?: () => void
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => {})

export const useToast = () => useContext(ToastContext)

/** A message that only tells you something. */
const VISIBLE_MS = 6000
/** A message with an Undo stays longer: it may be the only way back from a mistake. */
const VISIBLE_WITH_ACTION_MS = 9000
/** How long it lingers after a finger, pointer or keyboard focus leaves it. */
const LINGER_MS = 3000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const hideIn = useCallback((ms: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), ms)
  }, [])

  const show = useCallback(
    (options: ToastOptions) => {
      setToast({ ...options, id: Date.now() })
      hideIn(options.actionLabel ? VISIBLE_WITH_ACTION_MS : VISIBLE_MS)
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
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--stack-h,8.5rem)+0.75rem)] z-50 flex justify-center px-4"
      >
        {toast && (
          <div
            key={toast.id}
            // It waits while it is being read or used, and goes a moment after the person lets go.
            onPointerEnter={() => window.clearTimeout(timer.current)}
            onPointerLeave={() => hideIn(LINGER_MS)}
            onFocus={() => window.clearTimeout(timer.current)}
            onBlur={() => hideIn(LINGER_MS)}
            className="toast pointer-events-auto flex max-w-md items-center gap-4 rounded-2xl bg-btn py-2.5 pl-4 pr-2 text-btn-ink shadow-lg"
          >
            <span>{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.()
                  setToast(null)
                }}
                className="min-h-11 rounded-xl px-3 font-semibold underline underline-offset-2"
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
