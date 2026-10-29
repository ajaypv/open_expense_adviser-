import { formatMoney, formatMoneyCompact } from '../db/money'

interface Props {
  /** Total spend per weekday, Monday first. */
  totals: number[]
  currency: string
}

// 2026-10-26 is a Monday, so seven consecutive days from it are Monday..Sunday in order.
const label = (i: number, weekday: 'short' | 'long') =>
  new Intl.DateTimeFormat(undefined, { weekday }).format(new Date(2026, 9, 26 + i))

/**
 * Emphasis chart: the single busiest weekday takes the accent hue and the rest recede.
 * Only that bar carries a value label; every day's amount is in its accessible name.
 */
export function WeekdayBars({ totals, currency }: Props) {
  const max = Math.max(...totals, 1)
  const peak = totals.indexOf(Math.max(...totals))

  return (
    <ul className="mt-3 grid grid-cols-7 gap-1.5">
      {totals.map((v, i) => {
        const isPeak = i === peak && v > 0
        return (
          <li
            key={i}
            aria-label={`${label(i, 'long')}: ${formatMoney(v, currency)}`}
            className="flex flex-col items-center"
          >
            {/* h-28 plot with room above the tallest bar for its label. */}
            <div className="relative flex h-28 w-full items-end justify-center border-b border-axis pt-5">
              {isPeak && (
                <span className="absolute top-0 whitespace-nowrap text-xs font-medium text-ink">
                  {formatMoneyCompact(v, currency)}
                </span>
              )}
              <div
                className="w-full max-w-6 rounded-t-[4px]"
                style={{
                  height: v === 0 ? 0 : `${Math.max((v / max) * 100, 4)}%`,
                  background: isPeak ? 'var(--s1)' : 'var(--axis)',
                }}
              />
            </div>
            <span className={`mt-1.5 text-sm ${isPeak ? 'font-semibold text-ink' : 'text-ink-2'}`}>
              {label(i, 'short')}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
