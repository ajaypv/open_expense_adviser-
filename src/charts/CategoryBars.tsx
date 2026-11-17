import type { Category } from '../db/schema'
import type { CategoryTotal } from '../insights/aggregates'
import { categoryIcon } from '../ui/categoryIcon'
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
    })
  }

  return <BarList rows={rows} currency={currency} />
}
