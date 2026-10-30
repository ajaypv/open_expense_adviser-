import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(async () => {
  await Dexie.delete('expense-tracker')
  vi.resetModules()
})

async function load() {
  const [{ db }, repo, money] = await Promise.all([import('./schema'), import('./repo'), import('./money')])
  await db.open()
  return { db, ...repo, ...money }
}

describe('getCurrency', () => {
  it('is the saved currency', async () => {
    const { db, getCurrency } = await load()
    await db.settings.put({ key: 'currency', value: 'USD' })
    expect(await getCurrency()).toBe('USD')
  })

  it('falls back to rupees when the saved value is not a currency, so no screen can break on it', async () => {
    const { db, getCurrency } = await load()
    for (const bad of ['rupees!', 'rs', '', 42, null]) {
      await db.settings.put({ key: 'currency', value: bad })
      expect(await getCurrency(), String(bad)).toBe('INR')
    }
  })
})

describe('the shared checks', () => {
  it('knows a currency code from something else', async () => {
    const { isValidCurrency } = await load()
    expect(isValidCurrency('INR')).toBe(true)
    expect(isValidCurrency('USD')).toBe(true)
    for (const bad of ['inr', 'IN', 'INRR', 'rupees!', '', 5, null, undefined]) expect(isValidCurrency(bad), String(bad)).toBe(false)
  })

  it('knows a real day from one that does not exist', async () => {
    const { isRealDate } = await load()
    expect(isRealDate('2026-10-30')).toBe(true)
    expect(isRealDate('2028-02-29')).toBe(true)
    for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-1-5', 'tomorrow', '']) expect(isRealDate(bad), bad).toBe(false)
  })
})

describe('the largest amount', () => {
  it('is accepted up to the limit and refused above it', async () => {
    const { addTransaction, MAX_AMOUNT_MINOR } = await load()
    const row = { kind: 'expense' as const, currency: 'INR', categoryId: 1, merchant: '', note: '', date: '2026-10-30', paymentMethod: '', source: 'manual' as const }
    await expect(addTransaction({ ...row, amountMinor: MAX_AMOUNT_MINOR })).resolves.toBeTypeOf('number')
    await expect(addTransaction({ ...row, amountMinor: MAX_AMOUNT_MINOR + 1 })).rejects.toThrow(/too large/)
    await expect(addTransaction({ ...row, amountMinor: 1e22 })).rejects.toThrow()
    await expect(addTransaction({ ...row, amountMinor: 12.5 })).rejects.toThrow()
  })
})
