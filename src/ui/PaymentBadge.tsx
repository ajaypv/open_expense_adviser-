import type { RecurringTag } from '../db/schema'
import { BrandMark, brandOf } from './brands'
import { Icon } from './Icon'
import { paymentIcon } from './paymentIcon'

/**
 * The round icon beside a regular payment: the service's own logo for a well-known one (Netflix, Spotify, Jio, Airtel, YouTube and so on),
 * otherwise a receipt for a bill, a phone for a recharge, a calendar for an EMI. Decoration only; the row says the type in words.
 */
export function PaymentBadge({ tag, name, categoryName, size = 40 }: { tag: RecurringTag; name?: string; categoryName?: string; size?: number }) {
  const brand = brandOf(name, tag)
  if (brand) {
    return (
      <span
        aria-hidden="true"
        data-brand={brand.id}
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-full"
        style={{ width: size, height: size, background: brand.bg, boxShadow: brand.light ? 'inset 0 0 0 1px var(--ring)' : undefined }}
      >
        <BrandMark brand={brand} size={Math.round(size * 0.56)} />
      </span>
    )
  }
  const icon = paymentIcon(tag, name, categoryName)
  return (
    <span aria-hidden="true" data-icon={icon} className="flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink" style={{ width: size, height: size }}>
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </span>
  )
}
