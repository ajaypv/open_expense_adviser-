import { useState } from 'react'
import { Dialog } from './Dialog'
import { Icon } from './Icon'

export interface PickerOption<T extends string | number> {
  value: T
  label: string
  /** A second line under the label, such as a currency's name. */
  detail?: string
}

interface Props<T extends string | number> {
  /** Goes on the button, so a <label htmlFor> can point at it. */
  id: string
  /** The heading of the list that opens. */
  title: string
  value: T | null
  options: PickerOption<T>[]
  onChange: (value: T) => void
  /** Shown on the button when nothing is chosen. */
  placeholder?: string
  disabled?: boolean
  /** Look of the button. The caller sets its size and colours, so it can sit in a form, a pill or a dark bar. */
  className: string
  /** Show each option's detail on the button too, not only in the list. */
  showDetail?: boolean
  /** A search box over the list. On by default once there are more than eight options. */
  searchable?: boolean
}

const SEARCH_FROM = 8

/**
 * A drop-down that opens a bottom sheet instead of the browser's own menu, so it looks like the rest
 * of the app everywhere. Choosing an option closes the sheet.
 */
export function PickerField<T extends string | number>({
  id, title, value, options, onChange, placeholder = '', disabled, className, showDetail, searchable,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find((o) => o.value === value)
  const withSearch = searchable ?? options.length > SEARCH_FROM
  const q = query.trim().toLowerCase()
  const shown = q ? options.filter((o) => `${o.label} ${o.detail ?? ''}`.toLowerCase().includes(q)) : options

  return (
    <>
      <button
        type="button"
        id={id}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => {
          setQuery('')
          setOpen(true)
        }}
        className={`${className} flex items-center justify-between gap-2 text-left disabled:opacity-40`}
      >
        <span className="min-w-0 truncate">
          {selected ? selected.label : placeholder}
          {showDetail && selected?.detail && <span className="ml-2 text-ink-2">{selected.detail}</span>}
        </span>
        <span aria-hidden="true" className="shrink-0 opacity-60">
          <Icon name="chevDown" size={16} />
        </span>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} labelledBy={`${id}-title`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={`${id}-title`} className="min-w-0 text-xl font-semibold">
            {title}
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-2">
            <Icon name="close" />
          </button>
        </div>

        {withSearch && (
          <input
            type="search"
            aria-label={`Search ${title.toLowerCase()}`}
            placeholder="Search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2 min-h-12 w-full rounded-xl bg-surface-2 shadow-[inset_0_0_0_1px_var(--edge)] px-3.5"
          />
        )}

        <div role="radiogroup" aria-label={title} className="-mx-2 max-h-[50dvh] overflow-y-auto overscroll-contain px-2">
          {shown.map((o) => {
            const on = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2 aria-checked:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{o.label}</span>
                  {o.detail && <span className="block text-sm text-ink-2">{o.detail}</span>}
                </span>
                {on && <Icon name="check" size={20} />}
              </button>
            )
          })}
          {shown.length === 0 && <p className="px-3 py-6 text-center text-ink-2">Nothing matches “{query.trim()}”.</p>}
        </div>
      </Dialog>
    </>
  )
}
