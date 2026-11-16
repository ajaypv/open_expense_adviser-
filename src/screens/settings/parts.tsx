import type { ReactNode } from 'react'
import type { useLedger } from '../../data/useLedger'
import { Icon, type IconName } from '../../ui/Icon'

export type Ledger = ReturnType<typeof useLedger>

export { CURRENCIES } from '../../db/currencies'

export const card = 'rounded-3xl bg-surface shadow-[0_0_0_1px_var(--ring)]'
export const field = 'min-h-12 w-full rounded-xl bg-surface-2 shadow-[inset_0_0_0_1px_var(--edge)] px-3.5 focus-visible:outline-offset-0'
export const saveButton = 'min-h-12 shrink-0 rounded-full bg-btn px-5 font-semibold text-btn-ink'
export const secondaryButton = 'min-h-12 rounded-full bg-surface-2 px-5 font-medium disabled:opacity-50'
export const dangerLink = 'mt-1 min-h-11 rounded-full font-medium text-critical'

/** The title of a card inside a group ("Exchange rates", "Add a credit card"): one weight everywhere. */
export const cardTitle = 'font-semibold'

/** A round soft icon, as on the other pages. */
export function IconCircle({ icon, size = 40, onTile }: { icon: IconName; size?: number; /** On a soft tile, the circle is the lighter surface so it still shows. */ onTile?: boolean }) {
  return (
    <span aria-hidden="true" data-icon={icon} className={`flex shrink-0 items-center justify-center rounded-full text-ink ${onTile ? "bg-surface" : "bg-surface-2"}`} style={{ width: size, height: size }}>
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </span>
  )
}

/** The longer explanation of a group, folded away under a small "How this works" so the page opens on the settings, not a paragraph. */
export function HowItWorks({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <details className={`group ${className}`}>
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-sm font-medium text-ink-2 [&::-webkit-details-marker]:hidden">
        How this works
        <span aria-hidden="true" className="transition-transform group-open:rotate-90 motion-reduce:transition-none">
          <Icon name="chevRight" size={14} />
        </span>
      </summary>
      <div className="mt-1 space-y-2 text-sm text-ink-2">{children}</div>
    </details>
  )
}

/** A titled group: heading outside the card, content inside. */
export function Group({
  id,
  title,
  hint,
  more,
  status,
  children,
}: {
  id: string
  title: string
  hint?: string
  /** What is too long for the one line under the title; shown when "How this works" is opened. */
  more?: ReactNode
  status?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <h3 id={id} className="type-title">
          {title}
        </h3>
        {status}
      </div>
      {hint && <p className="mb-3 px-1 text-sm text-ink-2">{hint}</p>}
      {more && <HowItWorks className="-mt-1 mb-3 px-1">{more}</HowItWorks>}
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
  labelHidden,
  icon,
  onChange,
}: {
  label: string
  detail?: string
  checked: boolean
  disabled?: boolean
  describedBy?: string
  /** Only the switch is drawn; its name is still there for a screen reader. For a row that already says what it is. */
  labelHidden?: boolean
  /** A round icon before the name. */
  icon?: IconName
  onChange: (on: boolean) => void
}) {
  return (
    <label className={`flex min-h-12 cursor-pointer items-center justify-between gap-4 ${labelHidden ? 'min-h-11 w-auto' : ''}`}>
      {icon && <IconCircle icon={icon} size={36} />}
      <span className={labelHidden ? 'sr-only' : 'min-w-0 flex-1'}>
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
