import { Icon } from './Icon'

/**
 * The way into the AI insights page, at the top of Insights: a summary of the month, how to save, and where it is
 * heading. A button that says what is behind it, in the colour the app keeps for information.
 */
export function AiEntry({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" className="mt-3 flex min-h-12 w-full items-center gap-2.5 rounded-2xl bg-surface px-3 py-2 text-left shadow-[0_0_0_1px_var(--ring)] active:bg-surface-2">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'color-mix(in oklab, var(--s1) 16%, var(--surface))', color: 'var(--s1)' }}>
        <Icon name="spark" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-semibold leading-tight">AI insights</span>
        <span className="block truncate text-xs text-ink-2">Your month, savings and outlook</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-ink-2">
        <Icon name="chevRight" size={18} />
      </span>
    </button>
  )
}
