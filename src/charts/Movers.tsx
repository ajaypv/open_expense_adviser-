import { formatMoney } from '../db/money'
import type { Category } from '../db/schema'
import type { CategoryChange } from '../insights/aggregates'
import { Icon } from '../ui/Icon'

interface Props {
  changes: CategoryChange[]
  categoryById: Map<number, Category>
  currency: string
  previousLabel: string
}

/**
 * Diverging bars around a neutral midpoint: red extends right for spending that went up, blue
 * extends left for spending that went down. The direction is also stated in words with an icon,
 * so the colors never carry the meaning alone.
 */
export function Movers({ changes, categoryById, currency, previousLabel }: Props) {
  const maxAbs = Math.max(...changes.map((c) => Math.abs(c.deltaMinor)), 1)

  return (
    <ul className="divide-y divide-line">
      {changes.map((c) => {
        const cat = categoryById.get(c.categoryId)
        const up = c.deltaMinor > 0
        const width = `${(Math.abs(c.deltaMinor) / maxAbs) * 50}%`
        return (
          <li key={c.categoryId} className="py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: cat?.color ?? 'var(--other)' }} />
                <span className="truncate">{cat?.name ?? 'Uncategorised'}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums">
                <Icon name={up ? 'arrowUp' : 'arrowDown'} size={16} />
                {up ? 'Up' : 'Down'} {formatMoney(Math.abs(c.deltaMinor), currency)}
              </span>
            </div>
            <p className="mt-0.5 pl-[1.125rem] text-sm text-ink-2">
              {formatMoney(c.currentMinor, currency)} now, {formatMoney(c.previousMinor, currency)} in {previousLabel}
            </p>
            <div className="relative mt-2 h-2" aria-hidden="true">
              <div className="absolute inset-y-[-2px] left-1/2 w-px bg-axis" />
              <div
                className={`absolute inset-y-0 ${up ? 'left-1/2 rounded-r-[4px]' : 'right-1/2 rounded-l-[4px]'}`}
                style={{ width, background: up ? 'var(--s8)' : 'var(--s1)' }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
