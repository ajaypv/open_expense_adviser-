import type { useLedger } from '../data/useLedger'

export type TestLedger = ReturnType<typeof useLedger>

/** A complete ledger for screen tests, with only the fields a test cares about overridden. */
export function makeLedger(over: Partial<TestLedger> = {}): TestLedger {
  const accounts = over.accounts ?? [{ id: 1, name: 'Main', openingMinor: null }]
  return {
    loading: false,
    txs: [],
    expenses: [],
    income: [],
    trash: [],
    categories: [],
    expenseCategories: [],
    categoryById: new Map(),
    currency: 'INR',
    rates: {},
    missingRates: [],
    accounts,
    accountById: new Map(accounts.map((a) => [a.id, a])),
    balances: new Map(),
    budgetMinor: null,
    categoryBudgets: new Map(),
    recurring: [],
    goals: [],
    balanceSet: false,
    estimatedBalanceMinor: 0,
    netMinor: 0,
    ...over,
  }
}
