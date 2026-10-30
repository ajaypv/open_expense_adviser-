import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(async () => {
  await Dexie.delete('expense-tracker')
  vi.resetModules()
})

async function load() {
  const [{ db }, repo, ops] = await Promise.all([import('./schema'), import('./repo'), import('./recurringOps')])
  await db.open()
  const addRule = (over: Record<string, unknown> = {}) =>
    repo.addRecurring({
      kind: 'expense', amountMinor: 1_800_000, currency: 'INR', categoryId: 6, merchant: 'Rent', note: 'Flat',
      paymentMethod: 'Online', frequency: 'monthly', nextDue: '2026-08-01', active: true, ...over,
    } as never)
  return { db, addRule, ...repo, ...ops }
}

describe('applyRecurring', () => {
  it('adds the oldest due occurrence and moves the rule on one month', async () => {
    const { db, addRule, applyRecurring } = await load()
    const id = await addRule()
    const rule = (await db.recurring.get(id))!
    const applied = await applyRecurring(rule, '2026-10-28')
    expect(applied.ids).toHaveLength(1)
    expect(await db.transactions.toArray()).toMatchObject([
      { date: '2026-08-01', merchant: 'Rent', amountMinor: 1_800_000, note: 'Flat', paymentMethod: 'Online', source: 'recurring', kind: 'expense' },
    ])
    expect((await db.recurring.get(id))!.nextDue).toBe('2026-09-01')
  })

  it('adds every missed occurrence when asked, ending on the next future date', async () => {
    const { db, addRule, applyRecurring } = await load()
    const id = await addRule()
    const applied = await applyRecurring((await db.recurring.get(id))!, '2026-10-28', true)
    expect(applied.ids).toHaveLength(3)
    expect((await db.transactions.toArray()).map((t) => t.date).sort()).toEqual(['2026-08-01', '2026-09-01', '2026-10-01'])
    expect((await db.recurring.get(id))!.nextDue).toBe('2026-11-01')
  })

  it('does nothing when the rule is not due yet', async () => {
    const { db, addRule, applyRecurring } = await load()
    const id = await addRule({ nextDue: '2026-11-01' })
    const applied = await applyRecurring((await db.recurring.get(id))!, '2026-10-28')
    expect(applied.ids).toEqual([])
    expect(await db.transactions.count()).toBe(0)
  })

  it('undoes completely: the transactions go and the due date comes back', async () => {
    const { db, addRule, applyRecurring } = await load()
    const id = await addRule()
    const applied = await applyRecurring((await db.recurring.get(id))!, '2026-10-28', true)
    await applied.undo()
    expect(await db.transactions.count()).toBe(0)
    expect((await db.recurring.get(id))!.nextDue).toBe('2026-08-01')
  })

  it('keeps the account on the transactions it creates', async () => {
    const { db, addRule, applyRecurring, addAccount } = await load()
    const cash = await addAccount('Cash')
    const id = await addRule({ accountId: cash })
    await applyRecurring((await db.recurring.get(id))!, '2026-10-28')
    expect((await db.transactions.toArray())[0].accountId).toBe(cash)
  })
})

describe('skipRecurring', () => {
  it('moves the due date on without adding anything, and can be undone', async () => {
    const { db, addRule, skipRecurring } = await load()
    const id = await addRule()
    const undo = await skipRecurring((await db.recurring.get(id))!)
    expect((await db.recurring.get(id))!.nextDue).toBe('2026-09-01')
    expect(await db.transactions.count()).toBe(0)
    await undo()
    expect((await db.recurring.get(id))!.nextDue).toBe('2026-08-01')
  })
})
