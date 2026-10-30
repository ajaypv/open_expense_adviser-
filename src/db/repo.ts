import { isValidCurrency, localDateString, MAX_AMOUNT_MINOR, parseLocalDate } from './money'
import { db, type Goal, type Recurring, type Transaction } from './schema'

const DEFAULT_CURRENCY = 'INR'

export async function getCurrency(): Promise<string> {
  const row = await db.settings.get('currency')
  return isValidCurrency(row?.value) ? row.value : DEFAULT_CURRENCY
}

export async function setCurrency(currency: string): Promise<void> {
  await db.settings.put({ key: 'currency', value: currency })
}

export type NewTransaction = Omit<Transaction, 'id' | 'createdAt'>

function assertValidAmount(amountMinor: number) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('Amount must be a positive number')
  }
  if (amountMinor > MAX_AMOUNT_MINOR) throw new Error('That amount is too large. Enter a smaller one.')
}

export async function addTransaction(input: NewTransaction): Promise<number> {
  assertValidAmount(input.amountMinor)
  return db.transactions.add({ ...input, createdAt: Date.now() } as Transaction)
}

export async function updateTransaction(id: number, patch: Partial<NewTransaction>): Promise<void> {
  if (patch.amountMinor !== undefined) assertValidAmount(patch.amountMinor)
  await db.transactions.update(id, patch)
}

/** How long a deleted transaction stays in the trash before it is removed for good. */
export const TRASH_DAYS = 30

/** Move a transaction to the trash. Returns the row as it was, so Undo can put it back. */
export async function deleteTransaction(id: number): Promise<Transaction | undefined> {
  const existing = await db.transactions.get(id)
  if (existing && existing.deletedAt === undefined) await db.transactions.update(id, { deletedAt: Date.now() })
  return existing
}

/**
 * Move several transactions to the trash at once, in one step. Returns the ones that were moved, as they were.
 * Anything already in the trash is left alone (its date is not reset) and is not returned, so Undo can't
 * bring back something that was deleted earlier.
 */
export async function deleteTransactions(ids: number[]): Promise<Transaction[]> {
  return db.transaction('rw', db.transactions, async () => {
    const rows = (await db.transactions.bulkGet(ids)).filter((t): t is Transaction => t !== undefined && t.deletedAt === undefined)
    await db.transactions.where('id').anyOf(rows.map((t) => t.id)).modify({ deletedAt: Date.now() })
    return rows
  })
}

/** Take a transaction out of the trash (or put back one that was just deleted): used by Undo and Restore. */
export async function restoreTransaction(tx: Transaction): Promise<void> {
  const { deletedAt: _trashed, ...rest } = tx
  await db.transactions.put(rest)
}

export async function restoreTransactions(rows: Transaction[]): Promise<void> {
  await db.transactions.bulkPut(rows.map(({ deletedAt: _trashed, ...rest }) => rest))
}

/** Remove one trashed transaction for good. */
export async function purgeTransaction(id: number): Promise<void> {
  await db.transactions.delete(id)
}

/** Remove several transactions outright: for Undo of something that was only just added, so it doesn't fill the trash. */
export async function purgeTransactions(ids: number[]): Promise<void> {
  await db.transactions.bulkDelete(ids)
}

export async function emptyTrash(): Promise<number> {
  const ids = (await db.transactions.filter((t) => t.deletedAt !== undefined).primaryKeys()) as number[]
  await db.transactions.bulkDelete(ids)
  return ids.length
}

/** Remove anything that has been in the trash longer than TRASH_DAYS. */
export async function purgeExpiredTrash(now = Date.now()): Promise<number> {
  const cutoff = now - TRASH_DAYS * 86_400_000
  const ids = (await db.transactions
    .filter((t) => t.deletedAt !== undefined && t.deletedAt < cutoff)
    .primaryKeys()) as number[]
  await db.transactions.bulkDelete(ids)
  return ids.length
}

/** Move several transactions to another category. */
export async function recategorizeTransactions(ids: number[], categoryId: number): Promise<void> {
  await db.transactions.where('id').anyOf(ids).modify({ categoryId })
}

/** A copy dated today, so repeating a regular purchase is one tap. Returns the new id. */
export async function duplicateTransaction(tx: Transaction): Promise<number> {
  const { id: _id, createdAt: _created, deletedAt: _trashed, location: _location, ...fields } = tx
  return addTransaction({ ...fields, date: localDateString(), source: 'manual' })
}

/**
 * What an account held before any logged transaction. Its estimated balance is this plus money
 * received minus money sent. Pass null to clear it.
 */
export async function setAccountOpening(accountId: number, minor: number | null): Promise<void> {
  await db.accounts.update(accountId, { openingMinor: minor })
}

export async function addAccount(name: string, openingMinor: number | null = null): Promise<number> {
  const clean = name.trim()
  if (!clean) throw new Error('Give the account a name')
  return db.accounts.add({ name: clean, openingMinor } as never) as Promise<number>
}

export async function renameAccount(id: number, name: string): Promise<void> {
  const clean = name.trim()
  if (!clean) throw new Error('Give the account a name')
  await db.accounts.update(id, { name: clean })
}

/** Hide an account from pickers while keeping its history and balance. */
export async function setAccountArchived(id: number, archived: boolean): Promise<void> {
  await db.accounts.update(id, { archived })
}

/** Delete an account that has no transactions. Returns false (and deletes nothing) if it is in use. */
export async function deleteAccount(id: number): Promise<boolean> {
  if ((await db.accounts.count()) <= 1) return false // keep at least one
  const used = await db.transactions.filter((t) => t.accountId === id || t.toAccountId === id).count()
  if (used > 0) return false
  await db.accounts.delete(id)
  return true
}

export async function addRecurring(rule: Omit<Recurring, 'id'>): Promise<number> {
  assertValidAmount(rule.amountMinor)
  const anchorDay = rule.anchorDay ?? parseLocalDate(rule.nextDue).getDate()
  return db.recurring.add({ ...rule, anchorDay } as never) as Promise<number>
}

export async function updateRecurring(id: number, patch: Partial<Omit<Recurring, 'id'>>): Promise<void> {
  if (patch.amountMinor !== undefined) assertValidAmount(patch.amountMinor)
  await db.recurring.update(id, patch)
}

export async function deleteRecurring(id: number): Promise<void> {
  await db.recurring.delete(id)
}

export type NewGoal = { name: string; targetMinor: number; savedMinor?: number; dueDate?: string }

const cleanGoalName = (name: string) => {
  const clean = name.trim()
  if (!clean) throw new Error('Give the goal a name')
  return clean
}

function assertValidSaved(savedMinor: number) {
  if (!Number.isInteger(savedMinor) || savedMinor < 0) throw new Error('Saved amount can’t be negative')
}

function assertValidDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || localDateString(parseLocalDate(date)) !== date) throw new Error('Pick a valid date')
}

export async function addGoal(input: NewGoal): Promise<number> {
  const name = cleanGoalName(input.name)
  assertValidAmount(input.targetMinor)
  const savedMinor = input.savedMinor ?? 0
  assertValidSaved(savedMinor)
  if (input.dueDate !== undefined) assertValidDate(input.dueDate)
  return db.goals.add({
    name,
    targetMinor: input.targetMinor,
    savedMinor,
    ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
    createdAt: Date.now(),
  } as Goal)
}

/** Change a goal. Passing `dueDate: undefined` removes its date. */
export async function updateGoal(id: number, patch: Partial<NewGoal>): Promise<void> {
  const changes: Record<string, unknown> = {}
  if (patch.name !== undefined) changes.name = cleanGoalName(patch.name)
  if (patch.targetMinor !== undefined) {
    assertValidAmount(patch.targetMinor)
    changes.targetMinor = patch.targetMinor
  }
  if (patch.savedMinor !== undefined) {
    assertValidSaved(patch.savedMinor)
    changes.savedMinor = patch.savedMinor
  }
  if ('dueDate' in patch) {
    if (patch.dueDate !== undefined) assertValidDate(patch.dueDate)
    changes.dueDate = patch.dueDate
  }
  await db.goals.update(id, changes)
}

/**
 * Set money aside (positive) or take it back out (negative). Returns what the saved amount was and is,
 * so the caller can offer Undo; null if the goal no longer exists.
 */
export async function addToGoal(id: number, deltaMinor: number): Promise<{ before: number; after: number } | null> {
  if (!Number.isInteger(deltaMinor) || deltaMinor === 0) throw new Error('Enter an amount above 0')
  return db.transaction('rw', db.goals, async () => {
    const goal = await db.goals.get(id)
    if (!goal) return null
    const after = Math.max(0, goal.savedMinor + deltaMinor)
    await db.goals.update(id, { savedMinor: after })
    return { before: goal.savedMinor, after }
  })
}

export async function deleteGoal(id: number): Promise<Goal | undefined> {
  const goal = await db.goals.get(id)
  if (goal) await db.goals.delete(id)
  return goal
}

/** Put a deleted goal back exactly as it was (Undo). */
export async function restoreGoal(goal: Goal): Promise<void> {
  await db.goals.put(goal)
}

/** A monthly limit for one category. Pass null to remove it. */
export async function setCategoryBudget(categoryId: number, monthlyLimitMinor: number | null): Promise<void> {
  const existing = await db.budgets.filter((b) => b.categoryId === categoryId).first()
  if (monthlyLimitMinor === null) {
    if (existing) await db.budgets.delete(existing.id)
    return
  }
  assertValidAmount(monthlyLimitMinor)
  const currency = await getCurrency()
  if (existing) await db.budgets.update(existing.id, { monthlyLimitMinor, currency })
  else await db.budgets.add({ categoryId, monthlyLimitMinor, currency } as never)
}

/** Resolve a category by name (case-insensitive); falls back to "Other". */
export async function categoryIdByName(name: string): Promise<number> {
  const all = await db.categories.toArray()
  const match = all.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())
  const fallback = all.find((c) => c.name === 'Other')
  const found = match ?? fallback
  if (!found) throw new Error('No categories available')
  return found.id
}

/** The overall (not per-category) monthly budget in minor units, or null when unset. */
export async function setOverallBudget(monthlyLimitMinor: number | null): Promise<void> {
  const existing = await db.budgets.filter((b) => b.categoryId === null).first()
  if (monthlyLimitMinor === null) {
    if (existing) await db.budgets.delete(existing.id)
    return
  }
  assertValidAmount(monthlyLimitMinor)
  const currency = await getCurrency()
  if (existing) await db.budgets.update(existing.id, { monthlyLimitMinor, currency })
  else await db.budgets.add({ categoryId: null, monthlyLimitMinor, currency } as never)
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  return (await navigator.storage.persisted()) || navigator.storage.persist()
}

/** What one unit of a foreign currency is worth in the main currency. Pass null to remove it. */
export async function setRate(currency: string, rate: number | null): Promise<void> {
  const current = ((await db.settings.get('rates'))?.value ?? {}) as Record<string, number>
  const next = { ...current }
  if (rate === null) delete next[currency]
  else if (Number.isFinite(rate) && rate > 0) next[currency] = rate
  else throw new Error('A rate must be a number above 0')
  await db.settings.put({ key: 'rates', value: next })
}
