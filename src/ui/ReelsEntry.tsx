import { useMemo, useState } from 'react'
import type { useLedger } from '../data/useLedger'
import { yearsWithSpending } from '../insights/story'
import { Icon } from './Icon'
import { YearReels } from './YearReels'

/**
 * The way into your year as full-screen tiles you scroll through, like reels: on Insights, beside the AI insights. It says what is behind it,
 * and is not there until there is some spending to tell a story about. It holds the page it opens.
 */
export function ReelsEntry({ ledger, today }: { ledger: ReturnType<typeof useLedger>; today: Date }) {
  const [open, setOpen] = useState(false)
  const years = useMemo(() => yearsWithSpending(ledger.expenses), [ledger.expenses])
  if (years.length === 0) return null
  const year = years.includes(today.getFullYear()) ? today.getFullYear() : years[0]
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="mt-3 flex min-h-12 w-full items-center gap-2.5 rounded-2xl bg-surface px-3 py-2 text-left shadow-[0_0_0_1px_var(--ring)] active:bg-surface-2">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'color-mix(in oklab, var(--s7) 16%, var(--surface))', color: 'var(--s7)' }}>
          <Icon name="play" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-semibold leading-tight">{`Your ${year} in reels`}</span>
          <span className="block truncate text-xs text-ink-2">Scroll through where your money went</span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-ink-2">
          <Icon name="chevRight" size={18} />
        </span>
      </button>
      <YearReels open={open} onClose={() => setOpen(false)} ledger={ledger} today={today} />
    </>
  )
}
