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

  const txs = rows ?? NO_TXS
  // Money sent drives every spending chart; money received only feeds the balance and lists.
  const expenses = useMemo(() => txs.filter((t) => t.kind !== 'income'), [txs])
  const income = useMemo(() => txs.filter((t) => t.kind === 'income'), [txs])

  const categoryById = useMemo(
    () => new Map((categories ?? NO_CATS).map((c) => [c.id, c])),
    [categories],
  )

  const expenseCategories = useMemo(
    () => (categories ?? NO_CATS).filter((c) => c.name !== INCOME_CATEGORY),
    [categories],
  )

  const balanceSet = typeof openingRow?.value === 'number'
  const balance = balanceFrom(txs, balanceSet ? (openingRow.value as number) : 0)

  return {
    loading: rows === undefined || categories === undefined,
    txs,
    expenses,
    income,
    categories: categories ?? NO_CATS,
    /** Categories you can file an expense under (everything except "Income"). */
    expenseCategories,
    categoryById,
    currency: typeof currencyRow?.value === 'string' ? currencyRow.value : 'INR',
    budgetMinor: budgetRow?.monthlyLimitMinor ?? null,
    /** True once the user has told the app their balance; otherwise the estimate starts from zero. */
    balanceSet,
    /** Opening balance + everything received - everything sent, over all time. */
    estimatedBalanceMinor: balance.estimatedMinor,
    /** Received minus sent over all time; used to calibrate the opening balance. */
    netMinor: balance.netMinor,
  }
}
