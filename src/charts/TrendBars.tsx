import { formatMoney } from '../db/money'
import type { Category } from '../db/schema'
import type { CategoryTrend } from '../insights/trends'

/**
 * How each of the biggest categories has moved over recent months: a few tiny columns and, in
 * words, the latest month against the usual of the months before it.
 */
export function TrendBars({
  trends,
  categoryById,
  currency,
  monthName,
  inProgress = false,
}: {
  trends: CategoryTrend[]
  categoryById: Map<number, Category>
  currency: string
  /** The month in view, named in each line ("in October"). */
  monthName: string
  /** The latest month isn't over, so it is only part of a month and isn't compared. */
  inProgress?: boolean
}) {
  return (
    <div>
      <p className="pt-3 text-sm text-ink-2">Oldest to newest, the last six months.</p>
      <ul className="divide-y divide-line">
        {trends.map((t) => {
          const category = categoryById.get(t.categoryId)
          const max = Math.max(...t.months, 1)
          const latest = t.months[t.months.length - 1]
          const usual = formatMoney(t.averageMinor, currency)
          const sentence =
            t.changePct !== null
              ? `${formatMoney(latest, currency)} in ${monthName}. ${
                  t.changePct === 0 ? `About the same as your usual ${usual}.` : `${Math.abs(t.changePct)}% ${t.changePct > 0 ? 'more' : 'less'} than your usual ${usual}.`
                }`
              : inProgress
                ? `${formatMoney(latest, currency)} so far in ${monthName}.`
                : `${formatMoney(latest, currency)} in ${monthName}. Not enough earlier months to compare yet.`
          return (
            <li key={t.categoryId} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: category?.color ?? 'var(--other)' }} />
                  <span className="truncate font-medium">{category?.name ?? 'Other'}</span>
                </p>
                <p className="text-sm text-ink-2">{sentence}</p>
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
    </div>
  )
}
