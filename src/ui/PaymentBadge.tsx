import type { RecurringTag } from '../db/schema'
import { Icon } from './Icon'
import { paymentIcon } from './paymentIcon'

/** The round icon beside a regular payment: a receipt for a bill, a phone for a recharge, a calendar for an EMI. Decoration only; the row says the type in words. */
export function PaymentBadge({ tag, name, categoryName, size = 40 }: { tag: RecurringTag; name?: string; categoryName?: string; size?: number }) {
  const icon = paymentIcon(tag, name, categoryName)
  return (
    <span aria-hidden="true" data-icon={icon} className="flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink" style={{ width: size, height: size }}>
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </span>
  )
}
