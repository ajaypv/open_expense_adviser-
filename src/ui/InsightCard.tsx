import type { Category } from '../db/schema'
import { categoryIcon } from './categoryIcon'
import { Figures } from './Figures'
import { Icon } from './Icon'

interface Props {
  /** This month's spending by category, biggest first. */
  totals: { categoryId: number; totalMinor: number }[]
  totalMinor: number
  categoryById: Map<number, Category>
  monthName: string
  onOpen: () => void
  /** With this, the card also offers the AI summary of the month. */
  onOpenAi?: () => void
}

/**
 * One true thing about this month, taken from the transactions themselves, and the way to the rest. It states a
 * fact and offers more; it does not pretend to advice it cannot give. Blue is the colour of information.
 */
export function InsightCard({ totals, totalMinor, categoryById, monthName, onOpen, onOpenAi }: Props) {
  const top = totals[0]
  if (!top || top.totalMinor <= 0 || totalMinor <= 0) return null
  const name = categoryById.get(top.categoryId)?.name ?? 'One category'
  const percent = Math.round((top.totalMinor / totalMinor) * 100)

  return (
    <section aria-labelledby="insight-h" className="mt-8">
      <div className="rounded-3xl bg-surface-2/60 p-5">
        <h2 id="insight-h" className="type-title">
          Understand your spending
        </h2>
        <p className="mt-3 flex items-start gap-3 text-[1.0625rem] leading-[1.6] text-ink-2">
          <span aria-hidden="true" data-icon={categoryIcon(categoryById.get(top.categoryId)?.name)} className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface" style={{ color: 'var(--accent)' }}>
            <Icon name={categoryIcon(categoryById.get(top.categoryId)?.name)} size={17} />
          </span>
          <span className="min-w-0">
            <Figures text={`${name} is ${percent}% of what you have spent in ${monthName}.`} figures={[`${percent}%`]} />
          </span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onOpen} className="min-h-11 rounded-full bg-btn px-5 font-semibold text-btn-ink">
            See insights
          </button>
          {onOpenAi && (
            <button type="button" onClick={onOpenAi} aria-haspopup="dialog" className="flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 font-semibold shadow-[0_0_0_1px_var(--ring)]">
              <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
                <Icon name="spark" size={18} />
              </span>
              AI summary
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
