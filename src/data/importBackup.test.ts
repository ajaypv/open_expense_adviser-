import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(async () => {
  await Dexie.delete('expense-tracker')
  vi.resetModules()
})

async function load() {
  const [{ db }, imp, exp, repo] = await Promise.all([
    import('../db/schema'),
    import('./importBackup'),
    import('./exporters'),
    import('../db/repo'),
  ])
  await db.open()
  return { db, ...imp, ...exp, ...repo }
}

const tx = (over: Record<string, unknown> = {}) => ({
  kind: 'expense', amountMinor: 45000, currency: 'INR', categoryId: 1, merchant: 'Swiggy', note: '',
  date: '2026-10-05', paymentMethod: '', source: 'manual', createdAt: 1000, ...over,
})

const backupText = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 2, currency: 'INR',
    categories: [{ id: 1, name: 'Food & Dining', color: 'var(--s1)' }, { id: 2, name: 'Pets', color: 'var(--s2)' }],
    transactions: [tx(), tx({ merchant: 'Vet', categoryId: 2, createdAt: 2000, amountMinor: 90000 })],
    budgets: [], accounts: [], recurring: [], rates: {},
    ...over,
  })

describe('parseBackup', () => {
  it('rejects text that is not JSON, in plain words', async () => {
    const { parseBackup } = await load()
    const r = parseBackup('hello')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/isn.t a backup/)
  })

  it('rejects a file with the wrong shape and says where', async () => {
    const { parseBackup } = await load()
    const r = parseBackup(JSON.stringify({ version: 2, transactions: [{ amountMinor: -5, date: 'tomorrow' }] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/transactions/)
  })

  it('refuses a backup from a newer version of the app', async () => {
    const { parseBackup } = await load()
    const r = parseBackup(backupText({ version: 9 }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/newer version/)
  })

  it('fills in sensible defaults for old, sparse files', async () => {
    const { parseBackup } = await load()
    const r = parseBackup(JSON.stringify({ version: 1, transactions: [{ amountMinor: 100, date: '2026-01-02' }] }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.backup.transactions[0]).toMatchObject({ kind: 'expense', merchant: '', currency: 'INR' })
  })
})

describe('importBackup', () => {
  it('adds transactions, creating categories that are missing and matching the rest by name', async () => {
    const { db, parseBackup, importBackup } = await load()
    const parsed = parseBackup(backupText())
    if (!parsed.ok) throw new Error(parsed.error)
    const result = await importBackup(parsed.backup, 'merge')
    expect(result).toEqual({ added: 2, skipped: 0 })

    const cats = await db.categories.toArray()
    expect(cats.filter((c) => c.name === 'Food & Dining')).toHaveLength(1) // matched, not duplicated
    const pets = cats.find((c) => c.name === 'Pets')!
    const txs = await db.transactions.toArray()
    expect(txs.find((t) => t.merchant === 'Vet')!.categoryId).toBe(pets.id)
    expect(txs.every((t) => t.source === 'import')).toBe(true)
  })

  it('restoring the same file twice adds nothing the second time', async () => {
    const { db, parseBackup, importBackup } = await load()
    const parsed = parseBackup(backupText())
    if (!parsed.ok) throw new Error(parsed.error)
    await importBackup(parsed.backup, 'merge')
    expect(await importBackup(parsed.backup, 'merge')).toEqual({ added: 0, skipped: 2 })
    expect(await db.transactions.count()).toBe(2)
  })

  it('previews how many transactions are new', async () => {
    const { parseBackup, importBackup, summarizeImport } = await load()
    const parsed = parseBackup(backupText())
    if (!parsed.ok) throw new Error(parsed.error)
    expect(await summarizeImport(parsed.backup)).toEqual({ total: 2, newCount: 2 })
    await importBackup(parsed.backup, 'merge')
    expect(await summarizeImport(parsed.backup)).toEqual({ total: 2, newCount: 0 })
  })

  it('replace clears existing transactions first, so the app matches the file', async () => {
    const { db, parseBackup, importBackup, addTransaction } = await load()
    await addTransaction({ kind: 'expense', amountMinor: 100, currency: 'INR', categoryId: 1, merchant: 'Old', note: '', date: '2026-01-01', paymentMethod: '', source: 'manual' })
    const parsed = parseBackup(backupText())
    if (!parsed.ok) throw new Error(parsed.error)
    await importBackup(parsed.backup, 'replace')
    expect((await db.transactions.toArray()).map((t) => t.merchant).sort()).toEqual(['Swiggy', 'Vet'])
  })

  it('merge keeps what is already here', async () => {
    const { db, parseBackup, importBackup, addTransaction } = await load()
    await addTransaction({ kind: 'expense', amountMinor: 100, currency: 'INR', categoryId: 1, merchant: 'Old', note: '', date: '2026-01-01', paymentMethod: '', source: 'manual' })
    const parsed = parseBackup(backupText())
    if (!parsed.ok) throw new Error(parsed.error)
    await importBackup(parsed.backup, 'merge')
    expect(await db.transactions.count()).toBe(3)
  })

  it('carries a version 1 file’s single balance onto the first account', async () => {
    const { db, parseBackup, importBackup } = await load()
    const parsed = parseBackup(backupText({ version: 1, openingBalanceMinor: 500_000 }))
    if (!parsed.ok) throw new Error(parsed.error)
    await importBackup(parsed.backup, 'merge')
    expect((await db.accounts.toArray())[0].openingMinor).toBe(500_000)
  })

  it('matches accounts by name, keeps transfers pointing at the right ones, and never overwrites a set balance when merging', async () => {
    const { db, parseBackup, importBackup, setAccountOpening } = await load()
    const main = (await db.accounts.toArray())[0]
    await setAccountOpening(main.id, 100)
    const parsed = parseBackup(
      backupText({
        accounts: [
          { id: 7, name: 'Main', openingMinor: 999 },
          { id: 8, name: 'Cash', openingMinor: 5000 },
        ],
        transactions: [tx({ kind: 'transfer', merchant: '', accountId: 7, toAccountId: 8, amountMinor: 20000 })],
      }),
    )
    if (!parsed.ok) throw new Error(parsed.error)
    await importBackup(parsed.backup, 'merge')

    const accounts = await db.accounts.toArray()
    expect(accounts).toHaveLength(2)
    const cash = accounts.find((a) => a.name === 'Cash')!
    expect(accounts.find((a) => a.name === 'Main')!.openingMinor).toBe(100) // merge keeps the user's balance
    const [t] = await db.transactions.toArray()
    expect(t).toMatchObject({ kind: 'transfer', accountId: main.id, toAccountId: cash.id })
  })

  it('restores budgets, recurring rules and exchange rates without duplicating them', async () => {
    const { db, parseBackup, importBackup } = await load()
    const parsed = parseBackup(
      backupText({
        budgets: [{ categoryId: null, monthlyLimitMinor: 5_000_000, currency: 'INR' }, { categoryId: 1, monthlyLimitMinor: 800_000, currency: 'INR' }],
        recurring: [{ kind: 'expense', amountMinor: 1_800_000, merchant: 'Rent', frequency: 'monthly', nextDue: '2026-11-01', categoryId: 1 }],
        rates: { USD: 83.2 },
      }),
    )
    if (!parsed.ok) throw new Error(parsed.error)
    await importBackup(parsed.backup, 'merge')
    await importBackup(parsed.backup, 'merge')
    expect(await db.budgets.count()).toBe(2)
    expect(await db.recurring.count()).toBe(1)
    expect((await db.settings.get('rates'))?.value).toEqual({ USD: 83.2 })
  })

  it('round-trips: a backup made by the app restores to the same data', async () => {
    const { db, backupToJson, parseBackup, importBackup, addTransaction } = await load()
    await addTransaction({ kind: 'income', amountMinor: 8_000_000, currency: 'INR', categoryId: 1, merchant: 'Employer', note: 'Oct', date: '2026-10-01', paymentMethod: 'Online', source: 'chat', location: { lat: 1, lon: 2, accuracyM: 3 } })
    const text = backupToJson({
      currency: 'INR', categories: await db.categories.toArray(), transactions: await db.transactions.toArray(),
      budgets: await db.budgets.toArray(), accounts: await db.accounts.toArray(), recurring: await db.recurring.toArray(), goals: [], rates: {},
    })
    await Dexie.delete('expense-tracker')
    vi.resetModules()
    const fresh = await load()
    const parsed = fresh.parseBackup(text)
    if (!parsed.ok) throw new Error(parsed.error)
    await fresh.importBackup(parsed.backup, 'merge')
    expect(await fresh.db.transactions.toArray()).toMatchObject([
      { kind: 'income', merchant: 'Employer', note: 'Oct', paymentMethod: 'Online', amountMinor: 8_000_000, location: { lat: 1, lon: 2 } },
    ])
    void parseBackup
    void importBackup
  })

  it('leaves trashed transactions out of a backup', async () => {
    const { db, backupToJson, deleteTransaction, addTransaction } = await load()
    const keep = await addTransaction({ kind: 'expense', amountMinor: 100, currency: 'INR', categoryId: 1, merchant: 'Keep', note: '', date: '2026-10-01', paymentMethod: '', source: 'manual' })
    const gone = await addTransaction({ kind: 'expense', amountMinor: 100, currency: 'INR', categoryId: 1, merchant: 'Gone', note: '', date: '2026-10-01', paymentMethod: '', source: 'manual' })
    await deleteTransaction(gone)
    const text = backupToJson({ currency: 'INR', categories: [], transactions: await db.transactions.toArray(), budgets: [], accounts: [], recurring: [], goals: [], rates: {} })
    expect(JSON.parse(text).transactions.map((t: { id: number }) => t.id)).toEqual([keep])
  })
})

describe('goals in a backup', () => {
  const goal = (over: Record<string, unknown> = {}) => ({ name: 'New phone', targetMinor: 6_000_000, savedMinor: 1_500_000, dueDate: '2027-01-15', createdAt: 5, ...over })

  it('still restores a file made before goals existed', async () => {
    const { db, parseBackup, importBackup } = await load()
    const parsed = parseBackup(backupText()) // no "goals" key at all
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.backup.goals).toEqual([])
    await importBackup(parsed.backup, 'merge')
    expect(await db.goals.count()).toBe(0)
  })

  it('writes goals into a backup and restores them with what was saved', async () => {
    const { db, backupToJson, parseBackup, importBackup, addGoal } = await load()
    await addGoal({ name: 'New phone', targetMinor: 6_000_000, savedMinor: 1_500_000, dueDate: '2027-01-15' })
    const text = backupToJson({
      currency: 'INR', categories: [], transactions: [], budgets: [], accounts: [], recurring: [], rates: {}, goals: await db.goals.toArray(),
    })
    expect(JSON.parse(text).goals).toMatchObject([{ name: 'New phone', targetMinor: 6_000_000, savedMinor: 1_500_000, dueDate: '2027-01-15' }])

    await Dexie.delete('expense-tracker')
    vi.resetModules()
    const fresh = await load()
    const parsed = fresh.parseBackup(text)
    if (!parsed.ok) throw new Error(parsed.error)
    await fresh.importBackup(parsed.backup, 'merge')
    expect(await fresh.db.goals.toArray()).toMatchObject([{ name: 'New phone', targetMinor: 6_000_000, savedMinor: 1_500_000, dueDate: '2027-01-15' }])
    void parseBackup
    void importBackup
  })

  it('does not add a goal twice when the same backup is restored again', async () => {
    const { db, parseBackup, importBackup } = await load()
    const parsed = parseBackup(backupText({ goals: [goal(), goal({ name: 'Trip', targetMinor: 2_000_000, savedMinor: 0, dueDate: undefined })] }))
    if (!parsed.ok) throw new Error(parsed.error)
    await importBackup(parsed.backup, 'merge')
    await importBackup(parsed.backup, 'merge')
    expect((await db.goals.toArray()).map((g) => g.name).sort()).toEqual(['New phone', 'Trip'])
  })

  it('keeps the goals already here on a merge, and matches a goal by name and cost', async () => {
    const { db, parseBackup, importBackup, addGoal } = await load()
    await addGoal({ name: 'new PHONE', targetMinor: 6_000_000, savedMinor: 3_000_000 })
    const parsed = parseBackup(backupText({ goals: [goal()] }))
    if (!parsed.ok) throw new Error(parsed.error)
    await importBackup(parsed.backup, 'merge')
    expect(await db.goals.toArray()).toMatchObject([{ name: 'new PHONE', savedMinor: 3_000_000 }]) // what you have wins
  })

  it('replaces goals when asked to replace everything', async () => {
    const { db, parseBackup, importBackup, addGoal } = await load()
    await addGoal({ name: 'Old goal', targetMinor: 100_000 })
    const parsed = parseBackup(backupText({ goals: [goal()] }))
    if (!parsed.ok) throw new Error(parsed.error)
    await importBackup(parsed.backup, 'replace')
    expect((await db.goals.toArray()).map((g) => g.name)).toEqual(['New phone'])
  })

  it('rejects a goal with no cost', async () => {
    const { parseBackup } = await load()
    const r = parseBackup(backupText({ goals: [goal({ targetMinor: 0 })] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/goals/)
  })
})
