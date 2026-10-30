import type { ReactNode } from 'react'
import type { useLedger } from '../../data/useLedger'
import { Icon } from '../../ui/Icon'

export type Ledger = ReturnType<typeof useLedger>

export { CURRENCIES } from '../../db/currencies'

export const card = 'rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]'
export const field = 'min-h-12 w-full rounded-xl bg-surface-2 shadow-[inset_0_0_0_1px_var(--edge)] px-3.5 focus-visible:outline-offset-0'
export const saveButton = 'min-h-12 shrink-0 rounded-full bg-btn px-5 font-semibold text-btn-ink'
export const secondaryButton = 'min-h-12 rounded-full bg-surface-2 px-5 font-medium disabled:opacity-50'
export const dangerLink = 'mt-1 min-h-11 rounded-full font-medium text-critical'

/** A titled group: heading outside the card, content inside. */
export function Group({
  id,
  title,
  hint,
  status,
  children,
}: {
  id: string
  title: string
  hint?: string
  status?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <h3 id={id} className="text-lg font-bold tracking-tight">
          {title}
        </h3>
        {status}
      </div>
      {hint && <p className="-mt-1 mb-3 px-1 text-ink-2">{hint}</p>}
      {children}
    </section>
  )
}

/** State is always words plus an icon, never color alone. */
export function Status({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-2 pr-2.5 text-sm font-medium text-ink-2">
      {on && <Icon name="check" size={14} />}
      {children}
    </span>
  )
}

/**
 * A labelled on/off switch. A real checkbox underneath (role switch), so keyboard and screen
 * readers work; the track is drawn beside it.
 */
export function Switch({
  label,
  detail,
  checked,
  disabled,
  describedBy,
  onChange,
}: {
  label: string
  detail?: string
  checked: boolean
  disabled?: boolean
  describedBy?: string
  onChange: (on: boolean) => void
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {detail && <span className="block text-sm text-ink-2">{detail}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={describedBy}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-7 w-12 shrink-0 rounded-full bg-surface-2 shadow-[inset_0_0_0_1px_var(--edge)] transition-colors after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-ink-2 after:transition-transform peer-checked:bg-btn peer-checked:after:translate-x-5 peer-checked:after:bg-btn-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink peer-disabled:opacity-50 motion-reduce:transition-none motion-reduce:after:transition-none"
      />
    </label>
  )
}

/** A set of choices where exactly one applies, each with a one-line explanation. */
export function RadioList<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string
  label: string
  value: T
  options: { id: T; label: string; detail: string }[]
  onChange: (id: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`${card} divide-y divide-line overflow-hidden`}>
      {options.map((o) => (
        <label
          key={o.id}
          className="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2"
        >
          <input
            type="radio"
            name={name}
            className="peer sr-only"
            checked={value === o.id}
            onChange={() => onChange(o.id)}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{o.label}</span>
            <span className="block text-sm text-ink-2">{o.detail}</span>
          </span>
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-transparent shadow-[inset_0_0_0_1.5px_var(--edge)] peer-checked:bg-btn peer-checked:text-btn-ink peer-checked:shadow-none"
          >
            <Icon name="check" size={16} />
          </span>
        </label>
      ))}
    </div>
  )
}
