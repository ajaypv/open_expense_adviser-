import { nextDueAfter, occurrencesDue } from '../insights/recurring'
import { parseLocalDate } from './money'
import { db, type Recurring, type Transaction } from './schema'

export interface Applied {
  /** The transactions that were created. */
  ids: number[]
  /** Takes it all back: deletes those transactions and puts the rule's due date back. */
  undo: () => Promise<void>
}

const NONE: Applied = { ids: [], undo: async () => {} }

const toTransaction = (rule: Recurring, date: string, createdAt: number): Omit<Transaction, 'id'> => ({
  kind: rule.kind,
  amountMinor: rule.amountMinor,
  currency: rule.currency,
  categoryId: rule.categoryId,
  merchant: rule.merchant,
  note: rule.note,
  date,
  paymentMethod: rule.paymentMethod,
  source: 'recurring',
  createdAt,
  ...(rule.accountId !== undefined ? { accountId: rule.accountId } : {}),
})

/**
 * Add the transactions a rule has come due for and move it on. `all` adds every occurrence missed
 * so far; otherwise only the oldest one, so someone catching up can go one at a time.
 */
export async function applyRecurring(rule: Recurring, today: string, all = false): Promise<Applied> {
  const due = occurrencesDue(rule, today)
  const dates = all ? due : due.slice(0, 1)
  if (dates.length === 0) return NONE

  const anchor = parseLocalDate(rule.nextDue).getDate()
  const next = nextDueAfter(dates[dates.length - 1], rule.frequency, anchor)
  const now = Date.now()
  const ids = await db.transaction('rw', db.transactions, db.recurring, async () => {
    const created = (await db.transactions.bulkAdd(
      dates.map((d, i) => toTransaction(rule, d, now + i)) as Transaction[],
      { allKeys: true },
    )) as number[]
    await db.recurring.update(rule.id, { nextDue: next })
    return created
  })

  return {
    ids,
    undo: async () => {
      await db.transaction('rw', db.transactions, db.recurring, async () => {
        await db.transactions.bulkDelete(ids)
        await db.recurring.update(rule.id, { nextDue: rule.nextDue })
      })
    },
  }
}

/** Skip the next occurrence without adding anything. Returns a way to put the date back. */
export async function skipRecurring(rule: Recurring): Promise<() => Promise<void>> {
  const next = nextDueAfter(rule.nextDue, rule.frequency, parseLocalDate(rule.nextDue).getDate())
  await db.recurring.update(rule.id, { nextDue: next })
  return async () => {
    await db.recurring.update(rule.id, { nextDue: rule.nextDue })
  }
}
