import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A bottom sheet built on the native <dialog>: focus is trapped, Escape closes it, and the page
 * behind can't be scrolled. Styled by the `sheet` class in index.css.
 */
export function Dialog({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean
  onClose: () => void
  labelledBy: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={labelledBy}
      // React passes a "close" up to the parent's handler even though the browser doesn't, so a list opened
      // inside another sheet would close the sheet around it. Only react to this dialog's own close.
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onClick={(e) => {
        // Clicks on the backdrop target the dialog itself (its content fills everything else).
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
    >
      <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
    </dialog>
  )
}
