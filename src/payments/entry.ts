import { INCOME_CATEGORY } from '../db/defaultCategories'
import { localDateString, MAX_AMOUNT_MINOR } from '../db/money'
import { guessCategoryName, type ParsedExpense } from '../ingest/localParser'
import { appName } from './apps'
import type { PendingPayment } from './native'

/**
 * A payment from a pop-up as the entry the app adds for text typed in the chat bar, so that it is saved the same way: the
 * category guessed from the name (and the one you chose for that name before beats the guess, where it is added), the day it
 * was paid, and a note of which app it came from. Null when the amount is not one that can be added.
 */
export function paymentEntry(payment: PendingPayment): ParsedExpense | null {
  if (!Number.isInteger(payment.amountMinor) || payment.amountMinor <= 0 || payment.amountMinor > MAX_AMOUNT_MINOR) return null
  const named = payment.merchant.trim()
  const kind = payment.income ? 'income' : 'expense'
  return {
    kind,
    amountMinor: payment.amountMinor,
    merchant: named || (payment.income ? 'Money received' : 'Payment'),
    categoryName: payment.income ? INCOME_CATEGORY : guessCategoryName(named),
    date: localDateString(new Date(payment.at)),
    paymentMethod: 'Online',
    note: `via ${appName(payment.package)}`,
  }
}
