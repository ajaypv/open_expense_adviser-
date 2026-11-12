import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { formatMoney } from '../db/money'
import type { Category } from '../db/schema'
import type { Suggestion } from '../insights/suggestions'
import { categoryIcon } from './categoryIcon'
import { Icon } from './Icon'
import { useSeen } from './motion'

interface Props {
  items: Suggestion[]
  categoryById: Map<number, Category>
  currency: string
  onPick: (s: Suggestion) => void
  /** Chips need a different fill depending on whether they sit on the page or inside the sheet. */
  tone: 'page' | 'sheet'
  /**
   * chip: one slim line each, for the strip above the chat box and inside the add form, where height is short.
   * tile: a taller card with the category's icon, the amount large and the reason in full, for the Home screen.
   */
  variant?: 'chip' | 'tile'
  /**
   * With this, a tile has its own plus button that adds the suggestion at once, while a tap on the rest of the tile
   * still opens the form to look it over first. Without it the plus is only a picture. Tiles only.
   */
  onQuickAdd?: (s: Suggestion) => void | Promise<void>
  /** Spacing that lets the row scroll edge to edge inside a padded parent (-mx-N px-N, with scroll-px-N to match). */
  className?: string
}

/** How long a tile shows its tick, and is closed to another tap, after being added. */
const TICK_MS = 1400

/**
 * One-tap regulars: the merchant and usual amount, and why it is suggested now. Money received carries a + and the
 * green text token. The default spacing matches the 20px page gutter: the scroll padding is what keeps the first tile
 * clear of the screen's edge when the row settles, since otherwise it snaps to the very edge and its left side is lost.
 */
export function SuggestionList({ items, categoryById, currency, onPick, tone, variant = 'chip', onQuickAdd, className = '-mx-5 scroll-px-5 px-5' }: Props) {
  const [watch, seen] = useSeen()
  const tile = variant === 'tile'
  const fill = tone === 'page' ? 'bg-surface shadow-[0_0_0_1px_var(--ring)]' : 'bg-surface-2'

  // The one just added shows a tick for a moment. It cannot be added again while it is being saved or for that moment
  // after, so a second tap never makes a duplicate. That is kept in a ref, not state: a tap can land after the save
  // but before the screen has redrawn, when anything held in state would still say it was free.
  const [added, setAdded] = useState<string | null>(null)
  const busy = useRef(new Set<string>())
  useEffect(() => {
    if (added === null) return
    const timer = setTimeout(() => setAdded(null), TICK_MS)
    return () => clearTimeout(timer)
  }, [added])

  async function quickAdd(s: Suggestion) {
    if (!onQuickAdd || busy.current.has(s.key)) return
    busy.current.add(s.key)
    try {
      await onQuickAdd(s)
      setAdded(s.key)
      setTimeout(() => busy.current.delete(s.key), TICK_MS)
    } catch {
      // The caller says what went wrong; the tile stays as it was, free to try again.
      busy.current.delete(s.key)
    }
  }

  return (
    <ul
      ref={watch}
      data-seen={tile ? seen : undefined}
      className={`flex snap-x snap-proximity overflow-x-auto py-0.5 ${tile ? 'when-seen gap-3 pb-1' : 'gap-2'} ${className}`}
    >
      {items.map((s, i) => {
        const received = s.kind === 'income'
        const amount = `${received ? '+' : ''}${formatMoney(s.amountMinor, currency)}`
        const cat = categoryById.get(s.categoryId)
        const color = cat?.color ?? 'var(--other)'
        const label = `${s.merchant}, ${amount}. ${s.reason}. Fill in the form`
        const tint = `color-mix(in oklab, ${color} 24%, var(--surface))`

        if (tile) {
          // A transfer is not something to repeat in one tap.
          const direct = onQuickAdd !== undefined && s.kind !== 'transfer'
          const done = added === s.key
          return (
            <li key={s.key} className="row-in relative shrink-0 snap-start" style={{ '--d': `${Math.min(i, 5) * 70}ms` } as CSSProperties}>
              <button
                type="button"
                onClick={() => onPick(s)}
                aria-label={label}
                className={`flex h-full min-h-32 w-[9.5rem] flex-col rounded-3xl p-3.5 text-left transition-transform active:scale-[0.97] motion-reduce:transition-none ${fill}`}
              >
                <span className="flex items-start justify-between">
                  <span aria-hidden="true" data-icon={categoryIcon(cat?.name)} className="flex size-10 items-center justify-center rounded-full" style={{ background: tint }}>
                    <Icon name={categoryIcon(cat?.name)} size={20} />
                  </span>
                  {/* With a quick add, the real plus button below sits over this corner. */}
                  {!direct && (
                    <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                      <Icon name="plus" size={16} />
                    </span>
                  )}
                </span>
                <span className="mt-3 truncate font-medium">{s.merchant}</span>
                <span className={`type-figure text-xl ${received ? 'text-good' : ''}`}>{amount}</span>
                <span className="mt-1 line-clamp-2 text-sm leading-snug text-ink-2">{s.reason}</span>
              </button>
              {direct && (
                <button
                  type="button"
                  data-quick-add
                  data-added={done ? 'true' : undefined}
                  disabled={done}
                  onClick={() => void quickAdd(s)}
                  aria-label={done ? `Added ${s.merchant}` : `Add ${s.merchant}, ${amount} now`}
                  className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-full transition-transform active:scale-90 motion-reduce:transition-none"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-7 items-center justify-center rounded-full transition-colors duration-200 motion-reduce:transition-none ${done ? 'text-white' : 'bg-btn text-btn-ink'}`}
                    style={done ? { background: 'var(--good-text)' } : undefined}
                  >
                    <Icon name={done ? 'check' : 'plus'} size={16} />
                  </span>
                </button>
              )}
            </li>
          )
        }

        return (
          <li key={s.key} className="shrink-0 snap-start">
            <button
              type="button"
              onClick={() => onPick(s)}
              aria-label={label}
              className={`flex min-h-14 max-w-64 items-center gap-2.5 rounded-2xl py-2 pl-2.5 pr-3.5 text-left transition-transform active:scale-[0.97] motion-reduce:transition-none ${fill}`}
            >
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full text-[0.9375rem] font-semibold" style={{ background: tint }}>
                {s.merchant.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="max-w-32 truncate font-medium">{s.merchant}</span>
                  <span className={`shrink-0 text-[0.9375rem] font-semibold tabular-nums ${received ? 'text-good' : ''}`}>{amount}</span>
                </span>
                <span className="block truncate text-sm text-ink-2">{s.reason}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
