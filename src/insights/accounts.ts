import type { Account, Transaction } from '../db/schema'

export interface AccountBalance {
  accountId: number
  /** Received minus sent (and transfers in, minus transfers out) since the opening balance. */
  netMinor: number
  /** Opening balance (zero if never set) plus net. */
  estimatedMinor: number
}

/** The account a transaction belongs to when it names none: the first one that isn't archived. */
export function defaultAccountId(accounts: Account[]): number | undefined {
  return (accounts.find((a) => !a.archived) ?? accounts[0])?.id
}

/**
 * Estimated balance of every account. A transfer takes money out of one account and puts it into
 * another, so it changes the split but never the total. Trashed rows must be left out by the caller.
 */
export function balancesByAccount(txs: Transaction[], accounts: Account[]): Map<number, AccountBalance> {
  const fallback = defaultAccountId(accounts)
  const net = new Map<number, number>(accounts.map((a) => [a.id, 0]))
  const add = (id: number | undefined, amount: number) => {
    if (id !== undefined && net.has(id)) net.set(id, net.get(id)! + amount)
  }
  for (const t of txs) {
    const from = t.accountId ?? fallback
    if (t.kind === 'income') add(from, t.amountMinor)
    else if (t.kind === 'expense') add(from, -t.amountMinor)
    else if (t.kind === 'transfer') {
      add(from, -t.amountMinor)
      add(t.toAccountId, t.amountMinor)
    }
  }
  return new Map(
    accounts.map((a) => {
      const n = net.get(a.id) ?? 0
      return [a.id, { accountId: a.id, netMinor: n, estimatedMinor: (a.openingMinor ?? 0) + n }]
    }),
  )
}
