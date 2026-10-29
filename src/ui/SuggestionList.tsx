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
}

/** One-tap regulars: merchant, usual amount, and why it is suggested now. */
export function SuggestionList({ items, categoryById, currency, onPick, tone }: Props) {
  const fill = tone === 'page' ? 'bg-surface shadow-[0_0_0_1px_var(--ring)]' : 'bg-surface-2'
  return (
    <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 py-0.5">
      {items.map((s) => {
        const amount = `${s.kind === 'income' ? '+' : ''}${formatMoney(s.amountMinor, currency)}`
        return (
          <li key={s.key} className="shrink-0">
            <button
              type="button"
              onClick={() => onPick(s)}
              aria-label={`${s.merchant}, ${amount}. ${s.reason}. Fill in the form`}
              className={`flex min-h-14 max-w-60 flex-col items-start justify-center rounded-2xl px-3.5 py-2 text-left ${fill}`}
            >
              <span className="flex w-full items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: categoryById.get(s.categoryId)?.color ?? 'var(--other)' }}
                />
                <span className="truncate font-medium">{s.merchant}</span>
                <span className="shrink-0 tabular-nums">{amount}</span>
              </span>
              <span className="text-sm text-ink-2">{s.reason}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
