import type { Transaction } from '../db/schema'

type Source = Transaction['source']

/** Where an entry came from, in the words shown next to it. */
export const SOURCE_LABELS: Record<Source, string> = {
  manual: 'Added with the form',
  chat: 'Typed in the chat bar',
  import: 'Imported from a file',
  recurring: 'Added from a regular payment',
}

export interface TrailItem {
  tx: Transaction
  /** How it moved the balance: minus for spending, plus for money received. */
  effectMinor: number
}

export interface SourceTotal {
  source: Source
  label: string
  effectMinor: number
  count: number
}

export interface BalanceTrail {
  /** The latest entries that moved the balance, newest entered first. */
  items: TrailItem[]
  /** What each source did to the balance in the recent window, the biggest mover first. */
  recent: SourceTotal[]
}

const DAY_MS = 86_400_000

/**
 * What has been changing the balance: the latest entries, in the order they were entered (not the date they carry,
 * so a forgotten purchase added today for last month shows up at the top), and what each source did over the last
 * few days. Transfers move money between your own accounts and not the total, and trashed entries take no part, so
 * both are left out. Nothing here is a second source of truth: it is the same entries the balance is built from.
 */
export function balanceTrail(txs: Transaction[], nowMs: number, opts: { limit?: number; windowDays?: number } = {}): BalanceTrail {
  const { limit = 10, windowDays = 7 } = opts
  const moving = txs
    .filter((t) => t.kind !== 'transfer' && t.deletedAt === undefined)
    .map((tx): TrailItem => ({ tx, effectMinor: tx.kind === 'income' ? tx.amountMinor : -tx.amountMinor }))
    .sort((a, b) => b.tx.createdAt - a.tx.createdAt)

  const since = nowMs - windowDays * DAY_MS
  const totals = new Map<Source, SourceTotal>()
  for (const item of moving) {
    if (item.tx.createdAt < since) continue
    const cur = totals.get(item.tx.source) ?? { source: item.tx.source, label: SOURCE_LABELS[item.tx.source], effectMinor: 0, count: 0 }
    cur.effectMinor += item.effectMinor
    cur.count++
    totals.set(item.tx.source, cur)
  }

  return {
    items: moving.slice(0, limit),
    recent: [...totals.values()].sort((a, b) => Math.abs(b.effectMinor) - Math.abs(a.effectMinor)),
  }
}
