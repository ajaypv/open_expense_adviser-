import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(async () => {
  await Dexie.delete('expense-tracker')
  vi.resetModules()
})

/** Build a database exactly as the first release created it (schema v1, 10 categories). */
async function seedV1() {
  const v1 = new Dexie('expense-tracker')
  v1.version(1).stores({
    transactions: '++id, date, categoryId, merchant, createdAt',
    categories: '++id, &name',
    budgets: '++id, categoryId',
    settings: 'key',
    chat: '++id, createdAt',
  })
  await v1.open()
  const names = ['Food & Dining', 'Groceries', 'Transport', 'Shopping', 'Bills & Utilities', 'Rent', 'Health', 'Entertainment', 'Travel', 'Other']
  const ids: Record<string, number> = {}
  for (const name of names) ids[name] = (await v1.table('categories').add({ name, color: '#000000' })) as number
  const tx = (categoryId: number, amountMinor: number) => ({
    amountMinor, currency: 'INR', categoryId, merchant: '', note: '', date: '2026-10-01',
    paymentMethod: '', source: 'manual', createdAt: 0,
  })
  await v1.table('transactions').bulkAdd([tx(ids['Travel'], 100), tx(ids['Rent'], 200), tx(ids['Food & Dining'], 300)])
  v1.close()
  return ids
}

describe('database v1 -> v2 migration', () => {
  it('merges Travel into Entertainment & Travel without orphaning any transaction', async () => {
    await seedV1()
    const { db } = await import('./schema')
    await db.open()

    const cats = await db.categories.toArray()
    const names = cats.map((c) => c.name).sort()
    expect(names).toEqual(
      ['Bills & Utilities', 'Entertainment & Travel', 'Food & Dining', 'Groceries', 'Health', 'Income', 'Other', 'Rent & Housing', 'Shopping', 'Transport'].sort(),
    )

    const txs = await db.transactions.toArray()
    expect(txs).toHaveLength(3)
    const ids = new Set(cats.map((c) => c.id))
    expect(txs.every((t) => ids.has(t.categoryId))).toBe(true)

    const fun = cats.find((c) => c.name === 'Entertainment & Travel')!
    expect(txs.find((t) => t.amountMinor === 100)!.categoryId).toBe(fun.id) // was Travel
    const rent = cats.find((c) => c.name === 'Rent & Housing')!
    expect(txs.find((t) => t.amountMinor === 200)!.categoryId).toBe(rent.id)
  })

  it('marks every pre-existing transaction as money sent (v3) and adds the Income category once', async () => {
    await seedV1()
    const { db } = await import('./schema')
    await db.open()
    const txs = await db.transactions.toArray()
    expect(txs).toHaveLength(3)
    expect(txs.every((t) => t.kind === 'expense')).toBe(true)
    expect((await db.categories.where('name').equals('Income').toArray()).length).toBe(1)
  })

  it('re-colours categories with theme-aware CSS variables', async () => {
    await seedV1()
    const { db } = await import('./schema')
    await db.open()
    const cats = await db.categories.toArray()
    expect(cats.every((c) => c.color.startsWith('var(--'))).toBe(true)
    expect(cats.find((c) => c.name === 'Other')!.color).toBe('var(--other)')
  })

  it('creates the ten default categories (including Income) on a brand-new database', async () => {
    const { db } = await import('./schema')
    await db.open()
    expect(await db.categories.count()).toBe(10)
  })
})
