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
  return { db, ...repo }
}

describe('goals', () => {
  it('saves a goal with what it costs and, optionally, a date and what is already set aside', async () => {
    const { db, addGoal } = await load()
    const id = await addGoal({ name: '  New phone ', targetMinor: 6_000_000, savedMinor: 500_000, dueDate: '2027-01-15' })
    expect(await db.goals.get(id)).toMatchObject({ id, name: 'New phone', targetMinor: 6_000_000, savedMinor: 500_000, dueDate: '2027-01-15' })
    expect((await db.goals.get(id))!.createdAt).toBeTypeOf('number')
  })

  it('starts at nothing saved and with no date unless told otherwise', async () => {
    const { db, addGoal } = await load()
    const id = await addGoal({ name: 'Goa trip', targetMinor: 2_500_000 })
    const saved = (await db.goals.get(id))!
    expect(saved.savedMinor).toBe(0)
    expect(saved.dueDate).toBeUndefined()
  })

  it('refuses a goal with no name, no cost, or a date that is not a date', async () => {
    const { db, addGoal } = await load()
    await expect(addGoal({ name: '   ', targetMinor: 100 })).rejects.toThrow('Give the goal a name')
    await expect(addGoal({ name: 'X', targetMinor: 0 })).rejects.toThrow('Amount must be a positive number')
    await expect(addGoal({ name: 'X', targetMinor: 10.5 })).rejects.toThrow('Amount must be a positive number')
    await expect(addGoal({ name: 'X', targetMinor: 100, savedMinor: -5 })).rejects.toThrow('Saved amount can’t be negative')
    await expect(addGoal({ name: 'X', targetMinor: 100, dueDate: 'next friday' })).rejects.toThrow('Pick a valid date')
    expect(await db.goals.count()).toBe(0)
  })

  it('changes a goal, and can clear its date', async () => {
    const { db, addGoal, updateGoal } = await load()
    const id = await addGoal({ name: 'Trip', targetMinor: 100_000, dueDate: '2027-01-15' })
    await updateGoal(id, { name: ' Goa trip ', targetMinor: 250_000, dueDate: undefined })
    const g = (await db.goals.get(id))!
    expect(g.name).toBe('Goa trip')
    expect(g.targetMinor).toBe(250_000)
    expect(g.dueDate).toBeUndefined()
  })

  it('adds money to a goal and takes it out again, never going below zero', async () => {
    const { db, addGoal, addToGoal } = await load()
    const id = await addGoal({ name: 'Trip', targetMinor: 100_000, savedMinor: 20_000 })
    expect(await addToGoal(id, 30_000)).toEqual({ before: 20_000, after: 50_000 })
    expect((await db.goals.get(id))!.savedMinor).toBe(50_000)
    expect(await addToGoal(id, -80_000)).toEqual({ before: 50_000, after: 0 })
    expect((await db.goals.get(id))!.savedMinor).toBe(0)
  })

  it('lets a goal be saved past its target', async () => {
    const { addGoal, addToGoal } = await load()
    const id = await addGoal({ name: 'Gift', targetMinor: 10_000 })
    expect(await addToGoal(id, 15_000)).toEqual({ before: 0, after: 15_000 })
  })

  it('does nothing for a goal that is gone, or an amount that is not whole', async () => {
    const { addGoal, addToGoal } = await load()
    expect(await addToGoal(999, 100)).toBeNull()
    const id = await addGoal({ name: 'Trip', targetMinor: 100_000 })
    await expect(addToGoal(id, 0)).rejects.toThrow('Enter an amount above 0')
    await expect(addToGoal(id, 12.5)).rejects.toThrow('Enter an amount above 0')
  })

  it('deletes a goal and brings it back, as itself, with Undo', async () => {
    const { db, addGoal, deleteGoal, restoreGoal } = await load()
    const id = await addGoal({ name: 'Trip', targetMinor: 100_000, savedMinor: 40_000 })
    const removed = (await deleteGoal(id))!
    expect(removed).toMatchObject({ id, name: 'Trip', savedMinor: 40_000 })
    expect(await db.goals.count()).toBe(0)
    await restoreGoal(removed)
    expect(await db.goals.get(id)).toMatchObject({ id, name: 'Trip', savedMinor: 40_000 })
  })
})

describe('database v4 -> v5 migration (goals)', () => {
  it('adds the goals table without touching existing data', async () => {
    const v4 = new Dexie('expense-tracker')
    v4.version(4).stores({
      transactions: '++id, date, categoryId, merchant, createdAt',
      categories: '++id, &name',
      budgets: '++id, categoryId',
      settings: 'key',
      chat: '++id, createdAt',
      accounts: '++id',
      recurring: '++id, nextDue',
    })
    await v4.open()
    await v4.table('accounts').add({ name: 'Main', openingMinor: 99_000 })
    await v4.table('categories').add({ name: 'Other', color: 'var(--other)' })
    await v4.table('transactions').add({
      kind: 'expense', amountMinor: 450, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '', date: '2026-10-01',
      paymentMethod: '', source: 'manual', createdAt: 1,
    })
    v4.close()

    const { db } = await import('./schema')
    await db.open()
    expect(await db.goals.count()).toBe(0)
    expect(await db.transactions.toArray()).toMatchObject([{ merchant: 'Cafe', amountMinor: 450 }])
    expect(await db.accounts.toArray()).toMatchObject([{ name: 'Main', openingMinor: 99_000 }])
  })
})
