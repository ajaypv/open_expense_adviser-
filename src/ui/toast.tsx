import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export interface ToastOptions {
  message: string
  actionLabel?: string
  onAction?: () => void
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => {})

export const useToast = () => useContext(ToastContext)

const VISIBLE_MS = 6000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((options: ToastOptions) => {
    window.clearTimeout(timer.current)
    setToast({ ...options, id: Date.now() })
    timer.current = window.setTimeout(() => setToast(null), VISIBLE_MS)
  }, [])

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
            className="toast pointer-events-auto flex max-w-md items-center gap-4 rounded-2xl bg-btn py-2.5 pl-4 pr-2 text-btn-ink shadow-lg"
          >
            <span className="text-[0.9375rem]">{toast.message}</span>
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
