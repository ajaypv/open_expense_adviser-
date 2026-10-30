import type { Category } from '../db/schema'
import type { CategoryTotal } from '../insights/aggregates'
import { BarList, type BarRow } from './BarList'

interface Props {
  totals: CategoryTotal[]
  categoryById: Map<number, Category>
  currency: string
  /** Show this many categories and fold the rest into "Everything else". */
  limit?: number
  onPick?: (categoryId: number) => void
}

/** Spend by category with each bar in the category's own color (color follows the entity). */
export function CategoryBars({ totals, categoryById, currency, limit, onPick }: Props) {
  const grand = totals.reduce((a, t) => a + t.totalMinor, 0)
  if (grand === 0) return null

  const shown = limit ? totals.slice(0, limit) : totals
  const restTotal = (limit ? totals.slice(limit) : []).reduce((a, t) => a + t.totalMinor, 0)
  const share = (minor: number) => `${Math.round((minor / grand) * 100)}%`

  const rows: BarRow[] = shown.map((t) => {
    const cat = categoryById.get(t.categoryId)
    return {
      key: String(t.categoryId),
      label: cat?.name ?? 'No category',
      color: cat?.color ?? 'var(--other)',
      valueMinor: t.totalMinor,
      detail: share(t.totalMinor),
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
