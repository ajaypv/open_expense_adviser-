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

describe('a rule applied twice', () => {
  it('adds the occurrence once when Add is tapped twice at the same moment', async () => {
    const { db, addRule, applyRecurring } = await load()
    const id = await addRule()
    const rule = (await db.recurring.get(id))!
    await Promise.all([applyRecurring(rule, '2026-10-28'), applyRecurring(rule, '2026-10-28')])
    expect(await db.transactions.count()).toBe(1)
    expect((await db.recurring.get(id))!.nextDue).toBe('2026-09-01')
  })

  it('adds nothing for an Add all that follows an Add made from the same stale card', async () => {
    const { db, addRule, applyRecurring } = await load()
    const id = await addRule()
    const stale = (await db.recurring.get(id))!
    await applyRecurring(stale, '2026-10-28')
    const second = await applyRecurring(stale, '2026-10-28', true)
    expect(second.ids).toEqual([])
    expect(await db.transactions.count()).toBe(1)
  })

  it('adds nothing for a rule that was switched off after the card was shown', async () => {
    const { db, addRule, applyRecurring, updateRecurring } = await load()
    const id = await addRule()
    const stale = (await db.recurring.get(id))!
    await updateRecurring(id, { active: false })
    expect((await applyRecurring(stale, '2026-10-28')).ids).toEqual([])
    expect(await db.transactions.count()).toBe(0)
  })
})

describe('a monthly rule that starts late in the month', () => {
  it('stays on the 31st, using the 30th or 28th only in the months that are shorter', async () => {
    const { db, addRule, applyRecurring } = await load()
    const id = await addRule({ nextDue: '2026-01-31', anchorDay: 31 })
    for (let i = 0; i < 5; i++) await applyRecurring((await db.recurring.get(id))!, '2026-12-31')
    expect((await db.transactions.toArray()).map((t) => t.date).sort()).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
    expect((await db.recurring.get(id))!.nextDue).toBe('2026-06-30')
  })

  it('stays on the 31st when occurrences are skipped one at a time', async () => {
    const { db, addRule, skipRecurring } = await load()
    const id = await addRule({ nextDue: '2026-01-31', anchorDay: 31 })
    await skipRecurring((await db.recurring.get(id))!)
    expect((await db.recurring.get(id))!.nextDue).toBe('2026-02-28')
    await skipRecurring((await db.recurring.get(id))!)
    expect((await db.recurring.get(id))!.nextDue).toBe('2026-03-31')
  })

  it('remembers the day it was made for, so a rule saved from the 31st is not stuck on the 28th', async () => {
    const { db, addRecurring } = await load()
    const id = await addRecurring({ kind: 'expense', amountMinor: 100, currency: 'INR', categoryId: 1, merchant: 'Gym', note: '', paymentMethod: '', frequency: 'monthly', nextDue: '2026-02-28', anchorDay: 31, active: true })
    expect((await db.recurring.get(id))!.anchorDay).toBe(31)
  })

  it('works out the day from the due date when none was given, as rules made before this did', async () => {
    const { db, addRecurring } = await load()
    const id = await addRecurring({ kind: 'expense', amountMinor: 100, currency: 'INR', categoryId: 1, merchant: 'Gym', note: '', paymentMethod: '', frequency: 'monthly', nextDue: '2026-08-15', active: true })
    expect((await db.recurring.get(id))!.anchorDay).toBe(15)
  })
});
