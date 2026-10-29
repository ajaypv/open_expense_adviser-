import { db, type Transaction } from './schema'

const DEFAULT_CURRENCY = 'INR'

export async function getCurrency(): Promise<string> {
  const row = await db.settings.get('currency')
  return typeof row?.value === 'string' ? row.value : DEFAULT_CURRENCY
}

export async function setCurrency(currency: string): Promise<void> {
  await db.settings.put({ key: 'currency', value: currency })
}

export type NewTransaction = Omit<Transaction, 'id' | 'createdAt'>

function assertValidAmount(amountMinor: number) {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('Amount must be a positive number')
  }
}

export async function addTransaction(input: NewTransaction): Promise<number> {
  assertValidAmount(input.amountMinor)
  return db.transactions.add({ ...input, createdAt: Date.now() } as Transaction)
}

export async function updateTransaction(id: number, patch: Partial<NewTransaction>): Promise<void> {
  if (patch.amountMinor !== undefined) assertValidAmount(patch.amountMinor)
  await db.transactions.update(id, patch)
}

export async function deleteTransaction(id: number): Promise<Transaction | undefined> {
  const existing = await db.transactions.get(id)
  await db.transactions.delete(id)
  return existing
}

/** Put a previously deleted transaction back (same id), used by Undo. */
export async function restoreTransaction(tx: Transaction): Promise<void> {
  await db.transactions.put(tx)
}

/**
 * The balance before any logged transaction. The estimated balance is this plus money received
 * minus money sent. Pass null to clear it.
 */
export async function setOpeningBalance(minor: number | null): Promise<void> {
  if (minor === null) await db.settings.delete('openingBalance')
  else await db.settings.put({ key: 'openingBalance', value: minor })
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
