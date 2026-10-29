import { useState, type ReactNode } from 'react'
import { Icon } from '../ui/Icon'

/**
 * "Show table" toggle under a chart. A native <details>, so the open state is announced and the
 * keyboard works for free; the table itself is only built once opened, which keeps long charts light.
 */
export function TableDisclosure({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group mt-3">
      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-full bg-surface-2 py-2 pl-4 pr-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Show as table</span>
        <span className="hidden group-open:inline">Hide table</span>
        <span className="transition-transform group-open:rotate-180 motion-reduce:transition-none">
          <Icon name="chevDown" size={18} />
        </span>
      </summary>
      {open && <div className="mt-2">{children}</div>}
    </details>
  )
}
