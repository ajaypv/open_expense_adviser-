import type { RecurringTag } from '../db/schema'
import type { IconName } from './Icon'
import { categoryIcon, nameIcon } from './categoryIcon'

/** What a regular payment looks like: its kind, unless its name says it is a mobile recharge or an EMI. */
export function paymentIcon(tag: RecurringTag, name: string | undefined, categoryName?: string): IconName {
  if (tag === 'loan') return 'emi'
  const byName = nameIcon(name)
  if (byName) return byName
  switch (tag) {
    case 'autopay':
      return 'autopay'
    case 'subscription':
      return 'repeat'
    case 'bill':
      return 'receipt'
    case 'income':
      return 'arrowDown'
    default:
      return categoryIcon(categoryName)
  }
}
