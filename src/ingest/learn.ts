import type { Transaction } from '../db/schema'

/**
 * The category you usually file a merchant under, learned from your own history. The input bar
 * guesses from keywords; once you have corrected a merchant, your choice wins from then on.
 * Returns null when the merchant has not been seen before.
 */
export function learnedCategoryId(merchant: string, txs: Transaction[]): number | null {
  const name = merchant.trim().toLowerCase()
  if (!name) return null

  const counts = new Map<number, { n: number; last: string; created: number }>()
  for (const t of txs) {
    if (t.kind !== 'expense' || t.merchant.trim().toLowerCase() !== name) continue
    const c = counts.get(t.categoryId) ?? { n: 0, last: '', created: 0 }
    c.n++
    if (t.date > c.last || (t.date === c.last && t.createdAt > c.created)) {
      c.last = t.date
      c.created = t.createdAt
    }
    counts.set(t.categoryId, c)
  }

  let best: number | null = null
  let top: { n: number; last: string; created: number } | null = null
  for (const [id, c] of counts) {
    // Most used wins; on a tie, the one used most recently.
    if (!top || c.n > top.n || (c.n === top.n && (c.last > top.last || (c.last === top.last && c.created > top.created)))) {
      best = id
      top = c
    }
  }
  return best
}
