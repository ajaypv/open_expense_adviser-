import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { isValidCurrency } from '../db/money'
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
  const budgets = useLiveQuery(() => db.budgets.toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const recurring = useLiveQuery(() => db.recurring.toArray(), [])
  // Both settings in one read: it resolves with a row or undefined, so "not here" can't be mistaken for "not loaded yet".
  const settings = useLiveQuery(() => db.settings.bulkGet(['currency', 'rates']), [])
  const goals = useLiveQuery(() => db.goals.toArray(), [])

  // One memoized object: it keeps the same identity until the data actually changes, so screens
  // wrapped in memo() skip re-rendering when something unrelated (a sheet, a tab) changes.
  return useMemo(
    () => ({
      // Everything the first screen draws has to be here, or amounts would show in the wrong currency and
      // budgets and due cards would pop in after the page had settled.
      loading:
        rows === undefined ||
        categories === undefined ||
        accounts === undefined ||
        budgets === undefined ||
        recurring === undefined ||
        goals === undefined ||
        settings === undefined,
      // Goals are saved by hand and don't come from transactions, so they bypass the ledger build.
      goals: goals ?? NO_GOALS,
      ...buildLedger({
        transactions: rows ?? NO_ROWS,
        categories: categories ?? NO_CATS,
        accounts: accounts ?? NO_ACCOUNTS,
        budgets: budgets ?? NO_BUDGETS,
        recurring: recurring ?? NO_RULES,
        currency: isValidCurrency(settings?.[0]?.value) ? settings[0].value : 'INR',
        rates: settings?.[1] && typeof settings[1].value === 'object' && settings[1].value ? (settings[1].value as Rates) : NO_RATES,
      }),
    }),
    [rows, categories, settings, budgets, accounts, recurring, goals],
  )
}
