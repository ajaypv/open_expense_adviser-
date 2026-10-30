import { INCOME_CATEGORY } from '../db/defaultCategories'
import type { Account, Budget, Category, Recurring, Transaction } from '../db/schema'
import { balancesByAccount } from '../insights/accounts'

/**
 * A transaction as the screens see it. Amounts (and `currency`) are in the main currency so every
 * total adds up. A transaction recorded in another currency also carries what was actually paid,
 * for display and editing.
 */
export type LedgerTx = Transaction & {
  originalMinor?: number
  originalCurrency?: string
  /** No exchange rate is set for originalCurrency yet, so the amount is counted at face value. */
  unconverted?: boolean
}

/** Units of the main currency that one unit of each foreign currency is worth. */
export type Rates = Record<string, number>

export interface RawData {
  transactions: Transaction[]
  categories: Category[]
  accounts: Account[]
  budgets: Budget[]
  recurring: Recurring[]
  currency: string
  rates: Rates
}

const validRate = (r: unknown): r is number => typeof r === 'number' && Number.isFinite(r) && r > 0

/** Everything the screens need, worked out from what is stored. A plain function so it can be tested. */
export function buildLedger(raw: RawData) {
  const { categories, currency, rates, recurring } = raw
  const accounts = raw.accounts.slice().sort((a, b) => a.id - b.id)

  // Deleted rows live in the trash; they take no part in any total.
  const trash = raw.transactions.filter((t) => t.deletedAt !== undefined).sort((a, b) => b.deletedAt! - a.deletedAt!)
  const missing = new Set<string>()
  const txs: LedgerTx[] = raw.transactions
    .filter((t) => t.deletedAt === undefined)
    .map((t) => {
      if (t.currency === currency) return t
      const rate = rates[t.currency]
      if (!validRate(rate)) {
        missing.add(t.currency) // no rate yet: counted at face value until one is set
        return { ...t, currency, originalMinor: t.amountMinor, originalCurrency: t.currency, unconverted: true }
      }
      return { ...t, currency, amountMinor: Math.round(t.amountMinor * rate), originalMinor: t.amountMinor, originalCurrency: t.currency }
    })

  const balances = balancesByAccount(txs, accounts)
  let estimated = 0
  let net = 0
  for (const b of balances.values()) {
    estimated += b.estimatedMinor
    net += b.netMinor
  }

  return {
    txs,
    // Money sent drives every spending chart; money received only feeds the balance and lists.
    // Transfers between your own accounts are neither.
    expenses: txs.filter((t) => t.kind === 'expense'),
    income: txs.filter((t) => t.kind === 'income'),
    trash,
    categories,
    /** Categories you can file an expense under (everything except "Income"). */
    expenseCategories: categories.filter((c) => c.name !== INCOME_CATEGORY),
    categoryById: new Map(categories.map((c) => [c.id, c])),
    /** The main currency: every total and chart is shown in it. */
    currency,
    rates,
    /** Currencies used by a transaction that have no exchange rate yet. */
    missingRates: [...missing].sort(),
    accounts,
    accountById: new Map(accounts.map((a) => [a.id, a])),
    /** Estimated balance per account id. */
    balances,
    budgetMinor: raw.budgets.find((b) => b.categoryId === null)?.monthlyLimitMinor ?? null,
    /** Monthly limit per category id, for categories that have one. */
    categoryBudgets: new Map(
      raw.budgets.filter((b) => b.categoryId !== null).map((b) => [b.categoryId as number, b.monthlyLimitMinor]),
    ),
    recurring,
    /** True once the user has told the app a balance for any account; otherwise the estimate starts from zero. */
    balanceSet: accounts.some((a) => a.openingMinor !== null),
    /** Opening balances + everything received - everything sent, across all accounts. */
    estimatedBalanceMinor: estimated,
    /** Received minus sent over all time, across all accounts. */
    netMinor: net,
  }
}
