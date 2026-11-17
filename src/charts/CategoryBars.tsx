import { useState } from 'react'
import { formatMoney } from '../db/money'
import type { Category } from '../db/schema'
import type { CategoryTotal } from '../insights/aggregates'
import { categoryIcon } from '../ui/categoryIcon'
import { Icon } from '../ui/Icon'
import { BarList, type BarRow } from './BarList'

interface Props {
  totals: CategoryTotal[]
  categoryById: Map<number, Category>
  currency: string
  /** Show this many categories and fold the rest into "Everything else". */
  limit?: number
  /** A category that is always listed by name, even when it is not among the biggest, so it is never hidden in "Everything else". */
  pin?: string
  onPick?: (categoryId: number) => void
}

/** Spend by category with each bar in the category's own color (color follows the entity). */
export function CategoryBars({ totals, categoryById, currency, limit, pin, onPick }: Props) {
  const [restOpen, setRestOpen] = useState(false)
  const grand = totals.reduce((a, t) => a + t.totalMinor, 0)
  if (grand === 0) return null

  const nameOf = (t: CategoryTotal) => t.name ?? categoryById.get(t.categoryId)?.name
  let shown = limit ? totals.slice(0, limit) : totals
  let rest = limit ? totals.slice(limit) : []
  // The pinned category, when it is further down, is listed in its own place by size and taken out of "Everything else".
  const pinned = pin ? rest.find((t) => nameOf(t) === pin) : undefined
  if (pinned) {
    rest = rest.filter((t) => t !== pinned)
    const at = shown.findIndex((t) => t.totalMinor < pinned.totalMinor)
    shown = at < 0 ? [...shown, pinned] : [...shown.slice(0, at), pinned, ...shown.slice(at)]
  }
  const restTotal = rest.reduce((a, t) => a + t.totalMinor, 0)
  const share = (minor: number) => `${Math.round((minor / grand) * 100)}%`

  const rows: BarRow[] = shown.map((t) => {
    const cat = categoryById.get(t.categoryId)
    return {
      key: t.key ?? String(t.categoryId),
      label: t.name ?? cat?.name ?? 'No category',
      color: t.color ?? cat?.color ?? 'var(--other)',
      valueMinor: t.totalMinor,
      detail: share(t.totalMinor),
      icon: categoryIcon(t.name ?? cat?.name),
      onPick: onPick ? () => onPick(t.categoryId) : undefined,
    }
  })
  if (restTotal > 0) {
    rows.push({
      key: 'rest',
      label: 'Everything else',
      color: 'var(--other)',
      valueMinor: restTotal,
      detail: share(restTotal),
      // A tap opens the list of what is in it, since it is not one category and has no expenses of its own to open.
      onPick: () => setRestOpen((o) => !o),
      action: restOpen ? 'Hide what is in it' : 'Show what is in it',
      expanded: restOpen,
    })
  }

  const inRest = rest.map((t) => {
    const cat = categoryById.get(t.categoryId)
    const name = t.name ?? cat?.name ?? 'No category'
    return { key: t.key ?? String(t.categoryId), categoryId: t.categoryId, name, color: t.color ?? cat?.color ?? 'var(--other)', icon: t.icon ?? categoryIcon(name), minor: t.totalMinor }
  })

  return (
    <>
      <BarList rows={rows} currency={currency} />
      {/* Everything that is in "Everything else", each with its icon, amount and share, opening its expenses like the rest. */}
      {restOpen && inRest.length > 0 && (
        <ul aria-label="Everything else, by category" className="mb-2 mt-1 divide-y divide-line rounded-2xl bg-surface-2 px-3">
          {inRest.map((p) => {
            const content = (
              <>
                <span
                  aria-hidden="true"
                  data-icon={p.icon}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `color-mix(in oklab, ${p.color} 26%, var(--surface))` }}
                >
                  <Icon name={p.icon} size={18} />
                </span>
                <span className="min-w-0 flex-1 truncate text-left font-medium">{p.name}</span>
                <span className="num shrink-0">{formatMoney(p.minor, currency)}</span>
                <span className="w-12 shrink-0 text-right text-sm tabular-nums text-ink-2">{share(p.minor)}</span>
              </>
            )
            return (
              <li key={p.key}>
                {onPick ? (
                  <button type="button" onClick={() => onPick(p.categoryId)} aria-label={`${p.name}, ${formatMoney(p.minor, currency)}, ${share(p.minor)}. Show these expenses`} className="flex min-h-12 w-full items-center gap-3 py-2 active:opacity-70">
                    {content}
                  </button>
                ) : (
                  <p aria-label={`${p.name}, ${formatMoney(p.minor, currency)}, ${share(p.minor)}`} className="flex min-h-12 w-full items-center gap-3 py-2">
                    {content}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
