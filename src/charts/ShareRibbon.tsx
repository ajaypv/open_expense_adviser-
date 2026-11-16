import type { CSSProperties } from 'react'
import type { Category } from '../db/schema'
import type { CategoryTotal } from '../insights/aggregates'
import { useSeen } from '../ui/motion'
import { formatShare } from './share'

interface Props {
  totals: CategoryTotal[]
  categoryById: Map<number, Category>
  currency?: string
  /** Show this many categories and fold the rest into one grey "Everything else". */
  limit?: number
  onPick?: (categoryId: number) => void
}

interface Part {
  key: string
  /** Null for the folded "Everything else", which opens nothing. */
  categoryId: number | null
  name: string
  color: string
  minor: number
  share: number
}

/**
 * The whole month as one ribbon, cut into a piece for each category, with its share written below: where the money
 * flowed, as percentages. The pieces slide out from the left when the ribbon comes into view. Colours are the
 * categories' own, and the names and shares sit beside a dot of the same colour rather than on the ribbon, because
 * some of the hues are too light to carry a label. A piece or a name opens that category's expenses.
 */
export function ShareRibbon({ totals, categoryById, limit = 5, onPick }: Props) {
  const [watch, seen] = useSeen()
  const grand = totals.reduce((a, t) => a + t.totalMinor, 0)
  if (grand <= 0) return null

  const parts: Part[] = totals
    .filter((t) => t.totalMinor > 0)
    .slice(0, limit)
    .map((t) => {
      const cat = categoryById.get(t.categoryId)
      return { key: t.key ?? String(t.categoryId), categoryId: t.categoryId, name: t.name ?? cat?.name ?? 'No category', color: t.color ?? cat?.color ?? 'var(--other)', minor: t.totalMinor, share: t.totalMinor / grand }
    })
  const restMinor = totals.filter((t) => t.totalMinor > 0).slice(limit).reduce((a, t) => a + t.totalMinor, 0)
  if (restMinor > 0) parts.push({ key: 'rest', categoryId: null, name: 'Everything else', color: 'var(--other)', minor: restMinor, share: restMinor / grand })

  return (
    <div ref={watch} data-seen={seen} className="when-seen">
      <div role="img" aria-label={`Share of spending: ${parts.map((p) => `${p.name} ${formatShare(p.share)}`).join(', ')}`} className="flex h-4 gap-[3px]">
        {parts.map((p, i) => {
          const style = { flex: `${p.share} 1 0%`, background: p.color, '--d': `${i * 90}ms` } as CSSProperties
          const cls = 'bar-grow block h-full min-w-1.5 first:rounded-l-full last:rounded-r-full rounded-[3px]'
          return p.categoryId !== null && onPick ? (
            <button key={p.key} type="button" tabIndex={-1} aria-hidden="true" data-part={p.key} onClick={() => onPick(p.categoryId!)} className={cls} style={style} />
          ) : (
            <span key={p.key} aria-hidden="true" data-part={p.key} className={cls} style={style} />
          )
        })}
      </div>

      <ul aria-label="Share of spending by category" className="mt-3 grid grid-cols-2 gap-x-4">
        {parts.map((p, i) => {
          const row = { '--d': `${200 + i * 60}ms` } as CSSProperties
          const body = (
            <>
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="min-w-0 flex-1 truncate text-left">{p.name}</span>
              <span className="shrink-0 font-semibold tabular-nums">{formatShare(p.share)}</span>
            </>
          )
          return (
            <li key={p.key} className="row-in" style={row}>
              {p.categoryId !== null && onPick ? (
                <button type="button" onClick={() => onPick(p.categoryId!)} aria-label={`See ${p.name}, ${formatShare(p.share)} of the month`} className="flex min-h-11 w-full items-center gap-2 text-[0.9375rem] active:opacity-70">
                  {body}
                </button>
              ) : (
                <p className="flex min-h-11 items-center gap-2 text-[0.9375rem]">{body}</p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
