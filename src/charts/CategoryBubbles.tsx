import type { CSSProperties } from 'react'
import { formatMoney } from '../db/money'
import type { Category } from '../db/schema'
import type { CategoryTotal } from '../insights/aggregates'
import { categoryIcon } from '../ui/categoryIcon'
import { Icon, type IconName } from '../ui/Icon'
import { useCountWhen, useSeen } from '../ui/motion'
import { packBubbles } from './bubblePack'
import { formatShare } from './share'

interface Props {
  totals: CategoryTotal[]
  categoryById: Map<number, Category>
  currency: string
  /** Show this many categories and fold the rest into one grey "Everything else" bubble. */
  limit?: number
  onPick?: (categoryId: number) => void
}

/** A bubble whose radius (in units where the whole width is 100) is under this has no room for the name. */
const NAME_MIN_R = 11

const percent = formatShare

interface Row {
  key: string
  /** Null for the folded "Everything else" bubble, which opens nothing. */
  categoryId: number | null
  name: string
  color: string
  icon: IconName
  minor: number
}

/** The share, counting up from nothing when its bubble arrives (at once with reduced motion). */
function BubbleShare({ share, play, delayMs }: { share: number; play: boolean; delayMs: number }) {
  return <span className="bubble-share">{percent(useCountWhen(share, play, delayMs))}</span>
}

/**
 * Spend by category as glassy bubbles: the area of each is its share, and a pie wedge inside it shows that share as
 * an angle from the top, with the same arc along the rim. Each has the category's icon, name and share, and a tap
 * opens the category. Colour is the category's own, as everywhere else. A bubble too small for its name keeps its icon
 * and share, and every one carries the full name, share and amount for a screen reader; the list view has the
 * same figures in order for anyone who prefers to read them.
 */
export function CategoryBubbles({ totals, categoryById, currency, limit = 8, onPick }: Props) {
  // They arrive when the person can see them, not when the page was drawn.
  const [watch, seen] = useSeen()
  const grand = totals.reduce((a, t) => a + t.totalMinor, 0)
  if (grand <= 0) return null

  const shown = totals.slice(0, limit)
  const restMinor = totals.slice(limit).reduce((a, t) => a + t.totalMinor, 0)
  const rows: Row[] = shown.map((t) => {
    const cat = categoryById.get(t.categoryId)
    const name = t.name ?? cat?.name ?? 'No category'
    return { key: t.key ?? String(t.categoryId), categoryId: t.categoryId, name, color: t.color ?? cat?.color ?? 'var(--other)', icon: t.icon ?? categoryIcon(name), minor: t.totalMinor }
  })
  if (restMinor > 0) rows.push({ key: 'rest', categoryId: null, name: 'Everything else', color: 'var(--other)', icon: 'tag', minor: restMinor })

  const { bubbles, height } = packBubbles(rows.map((r) => ({ key: r.key, value: r.minor })))
  const place = new Map(bubbles.map((b, rank) => [b.key, { ...b, rank }]))
  // Biggest first, so they arrive in order of size.
  const rankOf = new Map([...bubbles].sort((a, b) => b.r - a.r).map((b, i) => [b.key, i]))

  return (
    // The outer box is as wide as the card and as tall as the packing needs (padding is a share of the width);
    // it is a size container, so the text and icons below are sized from its width and scale with the screen.
    <div
      ref={watch}
      data-seen={seen}
      className="when-seen relative w-full [container-type:inline-size]"
      style={{ paddingBottom: `${height.toFixed(2)}%` }}
    >
      <ul aria-label="Spending by category, bubbles sized by share" className="absolute inset-0 m-0 list-none p-0">
        {rows.map((row) => {
          const b = place.get(row.key)!
          const share = row.minor / grand
          const label = `${row.name}, ${percent(share)}, ${formatMoney(row.minor, currency)}`
          const showName = b.r >= NAME_MIN_R
          const vars = {
            '--c': row.color,
            '--a': `${Math.round(share * 3600) / 10}deg`,
            '--d': `${(rankOf.get(row.key) ?? 0) * 70}ms`,
            '--fs': `${(b.r * 0.15).toFixed(2)}cqw`,
            '--ic': `${(b.r * 0.56).toFixed(2)}cqw`,
          } as CSSProperties
          const body = (
            <span className="bubble" style={vars}>
              <span aria-hidden="true" className="bubble-wedge" />
              <span aria-hidden="true" className="bubble-arc" />
              <span className="bubble-text">
                <span aria-hidden="true" data-icon={row.icon} className="bubble-icon">
                  <Icon name={row.icon} size={24} />
                </span>
                {showName && <span className="bubble-name">{row.name}</span>}
                <BubbleShare share={share} play={seen} delayMs={(rankOf.get(row.key) ?? 0) * 70 + 250} />
              </span>
            </span>
          )
          // A bubble keeps its place in the list across months, so when the packing changes it glides to its new spot
          // and size rather than jumping; one that is new pops in.
          const glide = 'absolute transition-[left,top,width,height] duration-500 ease-out motion-reduce:transition-none'
          const box: CSSProperties = {
            left: `${(b.cx - b.r).toFixed(3)}%`,
            top: `${(((b.cy - b.r) / height) * 100).toFixed(3)}%`,
            width: `${(b.r * 2).toFixed(3)}%`,
            height: `${(((b.r * 2) / height) * 100).toFixed(3)}%`,
          }
          return onPick && row.categoryId !== null ? (
            <li key={row.key} className={glide} style={box}>
              <button
                type="button"
                onClick={() => onPick(row.categoryId!)}
                aria-label={`${label}. Show these expenses`}
                title={formatMoney(row.minor, currency)}
                className="block size-full rounded-full transition-transform active:scale-95 motion-reduce:transition-none"
              >
                {body}
              </button>
            </li>
          ) : (
            <li key={row.key} aria-label={label} title={formatMoney(row.minor, currency)} className={glide} style={box}>
              <span aria-hidden="true" className="block size-full">
                {body}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
