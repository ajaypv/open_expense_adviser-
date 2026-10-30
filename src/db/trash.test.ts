import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(async () => {
  await Dexie.delete('expense-tracker')
  vi.resetModules()
})

async function load() {
  const [{ db }, repo] = await Promise.all([import('./schema'), import('./repo')])
  await db.open()
  const add = (merchant: string, over: Record<string, unknown> = {}) =>
    repo.addTransaction({
      kind: 'expense', amountMinor: 45000, currency: 'INR', categoryId: 1, merchant, note: '', date: '2026-10-05',
      paymentMethod: '', source: 'manual', ...over,
    })
  return { db, add, ...repo }
}

describe('trash', () => {
  it('moves a deleted transaction to the trash instead of removing it', async () => {
    const { db, add, deleteTransaction } = await load()
    const id = await add('Swiggy')
    const removed = await deleteTransaction(id)
    expect(removed?.merchant).toBe('Swiggy')
    expect((await db.transactions.get(id))?.deletedAt).toBeTypeOf('number')
  })

  it('brings a transaction back, as itself, with Undo or Restore', async () => {
    const { db, add, deleteTransaction, restoreTransaction } = await load()
    const id = await add('Swiggy')
    const removed = (await deleteTransaction(id))!
    await restoreTransaction(removed)
    const back = await db.transactions.get(id)
    expect(back).toMatchObject({ id, merchant: 'Swiggy' })
    expect(back!.deletedAt).toBeUndefined()
  })

  it('restores a row that is already marked as trashed', async () => {
    const { db, add, deleteTransaction, restoreTransaction } = await load()
    const id = await add('Swiggy')
    await deleteTransaction(id)
    await restoreTransaction((await db.transactions.get(id))!)
    expect((await db.transactions.get(id))!.deletedAt).toBeUndefined()
  })

  it('deletes and restores several at once', async () => {
    const { db, add, deleteTransactions, restoreTransactions } = await load()
    const ids = [await add('A'), await add('B'), await add('C')]
    const rows = await deleteTransactions(ids.slice(0, 2))
    expect(rows.map((r) => r.merchant)).toEqual(['A', 'B'])
    expect((await db.transactions.filter((t) => t.deletedAt !== undefined).count())).toBe(2)
    await restoreTransactions(rows)
    expect((await db.transactions.filter((t) => t.deletedAt !== undefined).count())).toBe(0)
  })

  it('removes expired items from the trash and keeps recent ones', async () => {
    const { db, add, deleteTransaction, purgeExpiredTrash } = await load()
    const old = await add('Old')
    const recent = await add('Recent')
    await deleteTransaction(old)
    await deleteTransaction(recent)
    const day = 86_400_000
    await db.transactions.update(old, { deletedAt: Date.now() - 31 * day })
    await db.transactions.update(recent, { deletedAt: Date.now() - 5 * day })
    expect(await purgeExpiredTrash()).toBe(1)
    expect(await db.transactions.get(old)).toBeUndefined()
    expect(await db.transactions.get(recent)).toBeDefined()
  })

  it('empties the trash without touching live transactions', async () => {
    const { db, add, deleteTransaction, emptyTrash } = await load()
    const keep = await add('Keep')
    await deleteTransaction(await add('Gone'))
    expect(await emptyTrash()).toBe(1)
    expect(await db.transactions.toArray()).toMatchObject([{ id: keep }])
  })
})

describe('bulk edits', () => {
  it('moves several transactions to another category', async () => {
    const { db, add, recategorizeTransactions } = await load()
    const a = await add('A')
    const b = await add('B')
    const c = await add('C')
    await recategorizeTransactions([a, b], 3)
    expect((await db.transactions.bulkGet([a, b, c])).map((t) => t!.categoryId)).toEqual([3, 3, 1])
  })

  it('duplicates a transaction onto today, without its location or trash mark', async () => {
    const { db, add, duplicateTransaction } = await load()
    const id = await add('Swiggy', { date: '2026-01-02', location: { lat: 1, lon: 2, accuracyM: 3 }, paymentMethod: 'Online' })
    const copyId = await duplicateTransaction((await db.transactions.get(id))!)
    const copy = (await db.transactions.get(copyId))!
    expect(copy.id).not.toBe(id)
    expect(copy).toMatchObject({ merchant: 'Swiggy', amountMinor: 45000, paymentMethod: 'Online', source: 'manual' })
    expect(copy.date).not.toBe('2026-01-02')
    expect(copy.location).toBeUndefined()
  })
})

describe('accounts', () => {
  it('starts with one account, and a new database has no opening balance yet', async () => {
    const { db } = await load()
    expect(await db.accounts.toArray()).toMatchObject([{ name: 'Main', openingMinor: null }])
  })

  it('adds, renames, archives and deletes accounts, but never an account in use or the last one', async () => {
    const { db, add, addAccount, renameAccount, setAccountArchived, deleteAccount } = await load()
    const cash = await addAccount('  Cash  ', 5000)
    expect((await db.accounts.get(cash))).toMatchObject({ name: 'Cash', openingMinor: 5000 })
    await renameAccount(cash, 'Wallet')
    await setAccountArchived(cash, true)
    expect(await db.accounts.get(cash)).toMatchObject({ name: 'Wallet', archived: true })
    await expect(addAccount('   ')).rejects.toThrow(/name/)

    await add('Coffee', { accountId: cash })
    expect(await deleteAccount(cash)).toBe(false) // has a transaction
    await db.transactions.clear()
    expect(await deleteAccount(cash)).toBe(true)
    const main = (await db.accounts.toArray())[0]
    expect(await deleteAccount(main.id)).toBe(false) // the last one stays
  })
})

describe('category budgets and rates', () => {
  it('sets, updates and removes a per-category limit, separate from the overall budget', async () => {
    const { db, setCategoryBudget, setOverallBudget } = await load()
    await setOverallBudget(5_000_000)
    await setCategoryBudget(1, 800_000)
    await setCategoryBudget(1, 900_000)
    await setCategoryBudget(2, 100_000)
    const byCategory = (await db.budgets.toArray()).sort((x, y) => (x.categoryId ?? -1) - (y.categoryId ?? -1))
    expect(byCategory.map((x) => [x.categoryId, x.monthlyLimitMinor])).toEqual([
      [null, 5_000_000], [1, 900_000], [2, 100_000],
    ])
    await setCategoryBudget(1, null)
    expect(await db.budgets.count()).toBe(2)
    await expect(setCategoryBudget(1, 0)).rejects.toThrow()
  })

  it('stores exchange rates and rejects nonsense', async () => {
    const { db, setRate } = await load()
    await setRate('USD', 83.2)
    await setRate('EUR', 90)
    await setRate('USD', null)
    expect((await db.settings.get('rates'))?.value).toEqual({ EUR: 90 })
    await expect(setRate('USD', -1)).rejects.toThrow()
    await expect(setRate('USD', Number.NaN)).rejects.toThrow()
  })
})

describe('deleting several at once', () => {
  it('leaves what is already in the trash alone, and does not hand it back for Undo to restore', async () => {
    const { db, add, deleteTransaction, deleteTransactions } = await load()
    const old = await add('Old')
    const fresh = await add('Fresh')
    await deleteTransaction(old)
    const stamped = (await db.transactions.get(old))!.deletedAt
    const removed = await deleteTransactions([old, fresh])
    expect(removed.map((t) => t.merchant)).toEqual(['Fresh'])
    expect((await db.transactions.get(old))!.deletedAt).toBe(stamped)
  })

  it('ignores an id that is not there', async () => {
    const { add, deleteTransactions } = await load()
    const id = await add('Here')
    expect((await deleteTransactions([id, 9999])).map((t) => t.merchant)).toEqual(['Here'])
  })
})

describe('purgeTransactions', () => {
  it('removes the transactions outright, as when undoing something that was only just added', async () => {
    const { db, add, purgeTransactions } = await load()
    const a = await add('A')
    const b = await add('B')
    await add('C')
    await purgeTransactions([a, b])
    expect((await db.transactions.toArray()).map((t) => t.merchant)).toEqual(['C'])
  })
})
