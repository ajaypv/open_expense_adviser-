import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db, type Account, type Budget, type Category, type Goal, type Recurring, type Transaction } from '../db/schema'
import { buildLedger, type Rates } from './buildLedger'

export type { LedgerTx, Rates } from './buildLedger'

const NO_ROWS: Transaction[] = []
const NO_CATS: Category[] = []
const NO_ACCOUNTS: Account[] = []
const NO_BUDGETS: Budget[] = []
const NO_RULES: Recurring[] = []
const NO_GOALS: Goal[] = []
const NO_RATES: Rates = {}

/** Live view of everything the screens need. Personal-scale data, so one full read is fine. */
export function useLedger() {
  const rows = useLiveQuery(() => db.transactions.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const currencyRow = useLiveQuery(() => db.settings.get('currency'), [])
  const budgets = useLiveQuery(() => db.budgets.toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const recurring = useLiveQuery(() => db.recurring.toArray(), [])
  const ratesRow = useLiveQuery(() => db.settings.get('rates'), [])
  const goals = useLiveQuery(() => db.goals.toArray(), [])

  // One memoized object: it keeps the same identity until the data actually changes, so screens
  // wrapped in memo() skip re-rendering when something unrelated (a sheet, a tab) changes.
  return useMemo(
    () => ({
      loading: rows === undefined || categories === undefined || accounts === undefined,
      // Goals are saved by hand and don't come from transactions, so they bypass the ledger build.
      goals: goals ?? NO_GOALS,
      ...buildLedger({
        transactions: rows ?? NO_ROWS,
        categories: categories ?? NO_CATS,
        accounts: accounts ?? NO_ACCOUNTS,
        budgets: budgets ?? NO_BUDGETS,
        recurring: recurring ?? NO_RULES,
        currency: typeof currencyRow?.value === 'string' ? currencyRow.value : 'INR',
        rates: ratesRow && typeof ratesRow.value === 'object' && ratesRow.value ? (ratesRow.value as Rates) : NO_RATES,
      }),
    }),
    [rows, categories, currencyRow, budgets, accounts, recurring, ratesRow, goals],
  )
}
