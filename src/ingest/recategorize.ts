import type { Transaction } from '../db/schema'

const key = (merchant: string) => merchant.trim().toLowerCase()

/**
 * After you give an entry a new category, the other entries with the same name that are still under another
 * one, which the app can offer to move too. Only the exact name counts (not a word in it): moving many
 * entries at once should never be a guess. Spending and income stay apart; trashed entries and transfers
 * are left alone.
 */
export function earlierEntriesToMove(
  edited: Pick<Transaction, 'id' | 'merchant' | 'kind' | 'categoryId'>,
  txs: Transaction[],
): number[] {
  const name = key(edited.merchant)
  if (!name || edited.kind === 'transfer') return []
  return txs
    .filter((t) => t.id !== edited.id && t.kind === edited.kind && t.deletedAt === undefined && t.categoryId !== edited.categoryId && key(t.merchant) === name)
    .map((t) => t.id)
}
