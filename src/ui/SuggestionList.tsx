import { formatMoney } from '../db/money'
import type { Category } from '../db/schema'
import type { Suggestion } from '../insights/suggestions'

interface Props {
  items: Suggestion[]
  categoryById: Map<number, Category>
  currency: string
  onPick: (s: Suggestion) => void
  /** Chips need a different fill depending on whether they sit on the page or inside the sheet. */
  tone: 'page' | 'sheet'
  /** Spacing that lets the row scroll edge to edge inside a padded parent (-mx-N px-N). */
  className?: string
}

/**
 * One-tap regulars: a category-coloured initial for quick recognition, the merchant and usual
 * amount, and why it is suggested now. Money received carries a + and the green text token.
 */
export function SuggestionList({ items, categoryById, currency, onPick, tone, className = '-mx-5 px-5' }: Props) {
  const fill = tone === 'page' ? 'bg-surface shadow-[0_0_0_1px_var(--ring)]' : 'bg-surface-2'
  return (
    <ul className={`flex snap-x snap-proximity gap-2 overflow-x-auto py-0.5 ${className}`}>
      {items.map((s) => {
        const received = s.kind === 'income'
        const amount = `${received ? '+' : ''}${formatMoney(s.amountMinor, currency)}`
        const color = categoryById.get(s.categoryId)?.color ?? 'var(--other)'
        return (
          <li key={s.key} className="shrink-0 snap-start">
            <button
              type="button"
              onClick={() => onPick(s)}
              aria-label={`${s.merchant}, ${amount}. ${s.reason}. Fill in the form`}
              className={`flex min-h-14 max-w-64 items-center gap-2.5 rounded-2xl py-2 pl-2.5 pr-3.5 text-left transition-transform active:scale-[0.97] motion-reduce:transition-none ${fill}`}
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-[0.9375rem] font-semibold"
                style={{ background: `color-mix(in oklab, ${color} 24%, var(--surface))` }}
              >
                {s.merchant.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="max-w-32 truncate font-medium">{s.merchant}</span>
                  <span className={`shrink-0 text-[0.9375rem] font-semibold tabular-nums ${received ? 'text-good' : ''}`}>
                    {amount}
                  </span>
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
