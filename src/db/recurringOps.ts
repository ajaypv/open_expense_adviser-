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

/** The day of the month the rule keeps to, even after a short month has moved its due date earlier. */
const anchorOf = (rule: Recurring) => rule.anchorDay ?? parseLocalDate(rule.nextDue).getDate()

/**
 * Add the transactions a rule has come due for and move it on. `all` adds every occurrence missed
 * so far; otherwise only the oldest one, so someone catching up can go one at a time.
 *
 * The rule is read again inside the transaction: the one passed in may be a stale card, and a second tap,
 * "Add all" after "Add", or another open tab must not add the same occurrence twice.
 */
export async function applyRecurring(rule: Recurring, today: string, all = false): Promise<Applied> {
  const ids = await db.transaction('rw', db.transactions, db.recurring, async () => {
    const fresh = await db.recurring.get(rule.id)
    if (!fresh || !fresh.active || fresh.nextDue !== rule.nextDue) return []
    const due = occurrencesDue(fresh, today)
    const dates = all ? due : due.slice(0, 1)
    if (dates.length === 0) return []

    const now = Date.now()
    const created = (await db.transactions.bulkAdd(
      dates.map((d, i) => toTransaction(fresh, d, now + i)) as Transaction[],
      { allKeys: true },
    )) as number[]
    await db.recurring.update(rule.id, { nextDue: nextDueAfter(dates[dates.length - 1], fresh.frequency, anchorOf(fresh)) })
    return created
  })
  if (ids.length === 0) return NONE

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
  const next = nextDueAfter(rule.nextDue, rule.frequency, anchorOf(rule))
  await db.recurring.update(rule.id, { nextDue: next })
  return async () => {
    await db.recurring.update(rule.id, { nextDue: rule.nextDue })
  }
}
