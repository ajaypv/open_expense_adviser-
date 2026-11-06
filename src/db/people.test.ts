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

const tx = (over: Record<string, unknown> = {}) => ({
  kind: 'expense', amountMinor: 50_000, currency: 'INR', categoryId: 1, merchant: 'Shweta', note: '', date: '2026-11-05',
  paymentMethod: '', source: 'manual', ...over,
}) as never

describe('addPerson', () => {
  it('remembers a person once, whatever the case or spacing of the name', async () => {
    const { db, addPerson } = await load()
    const first = await addPerson('  Shweta   Rao ')
    const again = await addPerson('shweta rao')
    expect(first.name).toBe('Shweta Rao')
    expect(again.id).toBe(first.id)
    expect(await db.people.count()).toBe(1)
  })

  it('keeps a number when there is one, and fills it in later if the person had none', async () => {
    const { db, addPerson } = await load()
    const a = await addPerson('Ankit')
    expect(a.phone).toBeUndefined()
    const b = await addPerson('Ankit', '+91 98765 43210')
    expect(b.phone).toBe('+91 98765 43210')
    expect((await db.people.get(a.id))?.phone).toBe('+91 98765 43210')
    // A number already there is not overwritten.
    await addPerson('Ankit', '999')
    expect((await db.people.get(a.id))?.phone).toBe('+91 98765 43210')
  })

  it('refuses an empty name', async () => {
    const { addPerson } = await load()
    await expect(addPerson('   ')).rejects.toThrow('Enter who it was sent to')
  })
})

describe('addPeople', () => {
  it('adds several and says how many were new', async () => {
    const { addPeople, addPerson } = await load()
    await addPerson('Ankit')
    expect(await addPeople([{ name: 'Ankit' }, { name: 'Asha', phone: '1' }, { name: 'Meera' }, { name: '  ' }])).toBe(2)
    expect(await addPeople([{ name: 'asha' }])).toBe(0)
  })
})

describe('deletePerson', () => {
  it('removes the person and unlinks their payments, which keep the name they were saved with', async () => {
    const { db, addPerson, addTransaction, deletePerson } = await load()
    const p = await addPerson('Shweta')
    const id = await addTransaction(tx({ personId: p.id, delivery: 'sent' }))
    await deletePerson(p.id)
    expect(await db.people.count()).toBe(0)
    const row = await db.transactions.get(id)
    expect(row?.merchant).toBe('Shweta')
    expect(row?.personId).toBeUndefined()
  })
})

describe('setDelivery', () => {
  it('marks a payment received, with when, and can take it back', async () => {
    const { db, addTransaction, setDelivery } = await load()
    const id = await addTransaction(tx({ personId: 1, delivery: 'sent' }))
    await setDelivery(id, 'received')
    const got = await db.transactions.get(id)
    expect(got?.delivery).toBe('received')
    expect(typeof got?.receivedAt).toBe('number')
    await setDelivery(id, 'sent')
    const back = await db.transactions.get(id)
    expect(back?.delivery).toBe('sent')
    expect(back?.receivedAt).toBeUndefined()
  })
})

describe('duplicateTransaction', () => {
  it('copies a payment to a person as not received yet', async () => {
    const { db, addTransaction, duplicateTransaction } = await load()
    const id = await addTransaction(tx({ personId: 7, delivery: 'received', receivedAt: 123 }))
    const copy = await db.transactions.get(await duplicateTransaction((await db.transactions.get(id))!))
    expect(copy).toMatchObject({ personId: 7, delivery: 'sent', merchant: 'Shweta' })
    expect(copy?.receivedAt).toBeUndefined()
  })

  it('leaves an ordinary purchase without any of it', async () => {
    const { db, addTransaction, duplicateTransaction } = await load()
    const id = await addTransaction(tx({ merchant: 'Cafe' }))
    const copy = await db.transactions.get(await duplicateTransaction((await db.transactions.get(id))!))
    expect(copy?.delivery).toBeUndefined()
    expect(copy?.personId).toBeUndefined()
  })
})

describe('the people table', () => {
  it('is added to a database that has none, without touching what is there', async () => {
    const old = new Dexie('expense-tracker')
    old.version(5).stores({
      transactions: '++id, date, categoryId, merchant, createdAt', categories: '++id, &name', budgets: '++id, categoryId',
      settings: 'key', chat: '++id, createdAt', accounts: '++id', recurring: '++id, nextDue', goals: '++id',
    })
    await old.open()
    await old.table('transactions').add({ kind: 'expense', amountMinor: 100, currency: 'INR', categoryId: 1, merchant: 'Cafe', note: '', date: '2026-10-01', paymentMethod: '', source: 'manual', createdAt: 1 })
    old.close()

    const { db } = await load()
    expect(await db.transactions.count()).toBe(1)
    expect(await db.people.count()).toBe(0)
  })
})
