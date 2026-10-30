import type { Category } from '../db/schema'

interface Props {
  /** This month's spending by category, biggest first. */
  totals: { categoryId: number; totalMinor: number }[]
  totalMinor: number
  categoryById: Map<number, Category>
  monthName: string
  onOpen: () => void
}

/**
 * One true thing about this month, taken from the transactions themselves, and the way to the rest. It states a
 * fact and offers more; it does not pretend to advice it cannot give. Blue is the colour of information.
 */
export function InsightCard({ totals, totalMinor, categoryById, monthName, onOpen }: Props) {
  const top = totals[0]
  if (!top || top.totalMinor <= 0 || totalMinor <= 0) return null
  const name = categoryById.get(top.categoryId)?.name ?? 'One category'
  const percent = Math.round((top.totalMinor / totalMinor) * 100)

  return (
    <section aria-labelledby="insight-h" className="mt-8">
      <div className="rounded-3xl bg-surface-2/60 p-5">
        <h2 id="insight-h" className="text-xl font-bold tracking-tight">
          Understand your spending
        </h2>
        <p className="mt-2 flex items-start gap-2.5 text-ink-2">
          <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full" style={{ background: 'var(--s1)' }} />
          {`${name} is ${percent}% of what you have spent in ${monthName}.`}
        </p>
        <button type="button" onClick={onOpen} className="mt-3 min-h-11 rounded-full bg-btn px-5 font-semibold text-btn-ink">
          See insights
        </button>
      </div>
    </section>
  )
}
