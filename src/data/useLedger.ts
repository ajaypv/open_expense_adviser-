import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { INCOME_CATEGORY } from '../db/defaultCategories'
import { db, type Category, type Transaction } from '../db/schema'
import { balanceFrom } from '../insights/aggregates'

const NO_TXS: Transaction[] = []
const NO_CATS: Category[] = []

/** Live view of everything the screens need. Personal-scale data, so one full read is fine. */
export function useLedger() {
  const rows = useLiveQuery(() => db.transactions.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const currencyRow = useLiveQuery(() => db.settings.get('currency'), [])
  const budgetRow = useLiveQuery(() => db.budgets.filter((b) => b.categoryId === null).first(), [])
  const openingRow = useLiveQuery(() => db.settings.get('openingBalance'), [])

  // One memoized object: it keeps the same identity until the data actually changes, so screens
  // wrapped in memo() skip re-rendering when something unrelated (a sheet, a tab) changes.
  return useMemo(() => {
    const txs = rows ?? NO_TXS
    const cats = categories ?? NO_CATS
    const balanceSet = typeof openingRow?.value === 'number'
    const balance = balanceFrom(txs, balanceSet ? (openingRow.value as number) : 0)
    return {
      loading: rows === undefined || categories === undefined,
      txs,
      // Money sent drives every spending chart; money received only feeds the balance and lists.
      expenses: txs.filter((t) => t.kind !== 'income'),
      income: txs.filter((t) => t.kind === 'income'),
      categories: cats,
      /** Categories you can file an expense under (everything except "Income"). */
      expenseCategories: cats.filter((c) => c.name !== INCOME_CATEGORY),
      categoryById: new Map(cats.map((c) => [c.id, c])),
      currency: typeof currencyRow?.value === 'string' ? currencyRow.value : 'INR',
      budgetMinor: budgetRow?.monthlyLimitMinor ?? null,
      /** True once the user has told the app their balance; otherwise the estimate starts from zero. */
      balanceSet,
      /** Opening balance + everything received - everything sent, over all time. */
      estimatedBalanceMinor: balance.estimatedMinor,
      /** Received minus sent over all time; used to calibrate the opening balance. */
      netMinor: balance.netMinor,
    }
  }, [rows, categories, currencyRow, budgetRow, openingRow])
}
