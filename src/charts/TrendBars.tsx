import { formatMoney } from '../db/money'
import type { Category } from '../db/schema'
import type { CategoryTrend } from '../insights/trends'

/**
 * How each of the biggest categories has moved over recent months: a few tiny columns and, in
 * words, the latest month against the average of the months before it.
 */
export function TrendBars({
  trends,
  categoryById,
  currency,
}: {
  trends: CategoryTrend[]
  categoryById: Map<number, Category>
  currency: string
}) {
  return (
    <ul className="divide-y divide-line">
      {trends.map((t) => {
        const category = categoryById.get(t.categoryId)
        const max = Math.max(...t.months, 1)
        const latest = t.months[t.months.length - 1]
        const change =
          t.changePct === null
            ? 'Nothing earlier to compare with'
            : t.changePct === 0
              ? 'About the same as before'
              : `${Math.abs(t.changePct)}% ${t.changePct > 0 ? 'more' : 'less'} than before`
        return (
          <li key={t.categoryId} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: category?.color ?? 'var(--other)' }} />
                <span className="truncate font-medium">{category?.name ?? 'Other'}</span>
              </p>
              <p className="text-sm text-ink-2">
                {formatMoney(latest, currency)} this month. {change}.
              </p>
            </div>
            <div aria-hidden="true" className="flex h-9 w-20 shrink-0 items-end gap-[3px]">
              {t.months.map((m, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-[2px]"
                  style={{
                    height: m === 0 ? '2px' : `${Math.max((m / max) * 100, 8)}%`,
                    background: m === 0 ? 'var(--axis)' : 'var(--s1)',
                    opacity: i === t.months.length - 1 ? 1 : 0.45,
                  }}
                />
              ))}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
