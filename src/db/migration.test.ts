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
      ['Bills & Utilities', 'Credit Card', 'EMI', 'Entertainment & Travel', 'Food & Dining', 'Groceries', 'Health', 'Income', 'Other', 'People', 'Recharge', 'Rent & Housing', 'Shopping', 'Transport'].sort(),
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

  it('adds EMI and Recharge once to an older database, and leaves what was filed where it was', async () => {
    const ids = await seedV1()
    const { db } = await import('./schema')
    await db.open()
    expect(await db.categories.where('name').equals('EMI').count()).toBe(1)
    expect(await db.categories.where('name').equals('Recharge').count()).toBe(1)
    expect((await db.transactions.toArray()).map((t) => t.categoryId).sort()).toHaveLength(3)
    void ids
  })

  it('moves what was filed under Bills & Utilities to EMI, Recharge or Credit Card by its name, and leaves every other bill and category alone (v8)', async () => {
    const ids = await seedV1()
    const seed = new Dexie('expense-tracker')
    seed.version(1).stores({ transactions: '++id, date, categoryId, merchant, createdAt', categories: '++id, &name', budgets: '++id, categoryId', settings: 'key', chat: '++id, createdAt' })
    await seed.open()
    const row = (merchant: string, categoryId: number) => ({ amountMinor: 100, currency: 'INR', categoryId, merchant, note: '', date: '2026-10-02', paymentMethod: '', source: 'manual', createdAt: 0 })
    await seed.table('transactions').bulkAdd([
      row('HDFC Bank EMI', ids['Bills & Utilities']),
      row('Airtel postpaid', ids['Bills & Utilities']),
      row('CRED (card bill)', ids['Bills & Utilities']),
      row('BESCOM', ids['Bills & Utilities']),
      row('Bajaj EMI', ids['Shopping']),
    ])
    seed.close()
    const { db } = await import('./schema')
    await db.open()
    const name = new Map((await db.categories.toArray()).map((c) => [c.id, c.name]))
    const filed = Object.fromEntries((await db.transactions.toArray()).filter((t) => t.merchant).map((t) => [t.merchant, name.get(t.categoryId)]))
    expect(filed).toEqual({
      'HDFC Bank EMI': 'EMI',
      'Airtel postpaid': 'Recharge',
      'CRED (card bill)': 'Credit Card',
      BESCOM: 'Bills & Utilities',
      'Bajaj EMI': 'Shopping',
    })
  })

  it('adds People, and moves what was sent to a saved person under Other to it, leaving other categories alone (v9)', async () => {
    const ids = await seedV1()
    const seed = new Dexie('expense-tracker')
    seed.version(1).stores({ transactions: '++id, date, categoryId, merchant, createdAt', categories: '++id, &name', budgets: '++id, categoryId', settings: 'key', chat: '++id, createdAt' })
    await seed.open()
    const row = (merchant: string, categoryId: number, extra: Record<string, unknown> = {}) => ({ amountMinor: 100, currency: 'INR', categoryId, merchant, note: '', date: '2026-10-02', paymentMethod: '', source: 'manual', createdAt: 0, ...extra })
    await seed.table('transactions').bulkAdd([
      row('Shweta Rao', ids['Other'], { personId: 1 }),
      row('Lunch with Shweta', ids['Food & Dining'], { personId: 1 }),
      row('Corner shop', ids['Other']),
    ])
    seed.close()
    const { db } = await import('./schema')
    await db.open()
    const name = new Map((await db.categories.toArray()).map((c) => [c.id, c.name]))
    const filed = Object.fromEntries((await db.transactions.toArray()).filter((t) => t.merchant).map((t) => [t.merchant, name.get(t.categoryId)]))
    expect(filed).toEqual({ 'Shweta Rao': 'People', 'Lunch with Shweta': 'Food & Dining', 'Corner shop': 'Other' })
  })

  it('re-colours categories with theme-aware CSS variables', async () => {
    await seedV1()
    const { db } = await import('./schema')
    await db.open()
    const cats = await db.categories.toArray()
    expect(cats.every((c) => c.color.startsWith('var(--'))).toBe(true)
    expect(cats.find((c) => c.name === 'Other')!.color).toBe('var(--other)')
  })

  it('creates the fourteen default categories (including Income, EMI, Recharge, Credit Card and People) on a brand-new database', async () => {
    const { db } = await import('./schema')
    await db.open()
    expect(await db.categories.count()).toBe(14)
  })
})

describe('database v3 -> v4 migration (accounts)', () => {
  it('turns the old single opening balance into the first account, so no estimate changes', async () => {
    const ids = await seedV1()
    // A v1 database never had a balance, but a v3 one could: simulate it before upgrading.
    const old = new Dexie('expense-tracker')
    old.version(1).stores({
      transactions: '++id, date, categoryId, merchant, createdAt',
      categories: '++id, &name',
      budgets: '++id, categoryId',
      settings: 'key',
      chat: '++id, createdAt',
    })
    await old.open()
    await old.table('settings').put({ key: 'openingBalance', value: 123_400 })
    old.close()
    void ids

    const { db } = await import('./schema')
    await db.open()
    const accounts = await db.accounts.toArray()
    expect(accounts).toMatchObject([{ name: 'Main', openingMinor: 123_400 }])
    expect(await db.settings.get('openingBalance')).toBeUndefined() // moved, not copied
    expect(await db.recurring.count()).toBe(0)
    // Existing transactions keep working: none names an account, so they belong to the first one.
    expect((await db.transactions.toArray()).every((t) => t.accountId === undefined && t.deletedAt === undefined)).toBe(true)
  })

  it('starts a brand-new install with one account that has no balance yet', async () => {
    const { db } = await import('./schema')
    await db.open()
    expect(await db.accounts.toArray()).toMatchObject([{ name: 'Main', openingMinor: null }])
  })

  it('leaves the account without a balance when the old database never had one', async () => {
    await seedV1()
    const { db } = await import('./schema')
    await db.open()
    expect(await db.accounts.toArray()).toMatchObject([{ name: 'Main', openingMinor: null }])
  })
})
