import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { balanceTrail, SOURCE_LABELS } from './balanceTrail'

const DAY = 86_400_000
const now = new Date(2026, 10, 2, 12, 0).getTime() // Mon 2 Nov 2026, noon

let id = 0
const tx = (merchant: string, rupees: number, enteredAgoMs: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId: 1, merchant, note: '',
  date: '2026-11-01', paymentMethod: '', source: 'manual', createdAt: now - enteredAgoMs, ...extra,
})

describe('balanceTrail: the entries that moved the balance', () => {
  it('lists them newest first by when they were entered, not the date they carry', () => {
    const backdated = tx('Forgotten coffee', 50, 1000, { date: '2026-10-01' }) // entered a second ago, dated last month
    const older = tx('Lunch', 120, 3 * DAY)
    const found = balanceTrail([older, backdated], now)
    expect(found.items.map((i) => i.tx.merchant)).toEqual(['Forgotten coffee', 'Lunch'])
  })

  it('says which way each moved it: spending takes away, money received adds', () => {
    const found = balanceTrail([tx('Rent', 6000, 1000), tx('Salary', 80000, 2000, { kind: 'income' })], now)
    expect(found.items.map((i) => i.effectMinor)).toEqual([-600_000, 8_000_000])
  })

  it('leaves out transfers, which move money between your accounts and not the total, and trashed entries', () => {
    const found = balanceTrail([tx('Card bill', 500, 1000, { kind: 'transfer' }), tx('Gone', 70, 2000, { deletedAt: 5 }), tx('Tea', 10, 3000)], now)
    expect(found.items.map((i) => i.tx.merchant)).toEqual(['Tea'])
  })

  it('keeps to the limit', () => {
    const many = Array.from({ length: 25 }, (_, i) => tx(`Entry ${i}`, 10, (i + 1) * 1000))
    expect(balanceTrail(many, now).items).toHaveLength(10)
    expect(balanceTrail(many, now, { limit: 4 }).items).toHaveLength(4)
  })

  it('is empty when nothing has been entered', () => {
    expect(balanceTrail([], now)).toEqual({ items: [], recent: [] })
  })
})

describe('balanceTrail: the last week, by where the entries came from', () => {
  it('adds up what each source did to the balance, with how many entries', () => {
    const found = balanceTrail(
      [
        tx('Rent', 6000, 1000, { source: 'recurring' }),
        tx('EMI', 12500, 2000, { source: 'recurring' }),
        tx('Lunch', 120, 3000, { source: 'chat' }),
        tx('Tea', 10, 4000, { source: 'manual' }),
        tx('Salary', 80000, 5000, { source: 'import', kind: 'income' }),
      ],
      now,
    )
    const by = Object.fromEntries(found.recent.map((r) => [r.source, [r.effectMinor, r.count]]))
    expect(by).toEqual({ recurring: [-1_850_000, 2], chat: [-12_000, 1], manual: [-1000, 1], import: [8_000_000, 1] })
  })

  it('names each source in plain words', () => {
    const [r] = balanceTrail([tx('Rent', 6000, 1000, { source: 'recurring' })], now).recent
    expect(r.label).toBe(SOURCE_LABELS.recurring)
    expect(SOURCE_LABELS.recurring).toBe('Added from a regular payment')
    expect(SOURCE_LABELS.import).toBe('Imported from a file')
  })

  it('counts only what was entered in the last seven days', () => {
    const found = balanceTrail([tx('New', 100, 6 * DAY), tx('Old', 900, 8 * DAY)], now)
    expect(found.recent.map((r) => r.effectMinor)).toEqual([-10_000])
    // The older one is still in the list of latest changes.
    expect(found.items.map((i) => i.tx.merchant)).toEqual(['New', 'Old'])
  })

  it('puts the biggest mover first, and leaves out a source that did nothing', () => {
    const found = balanceTrail([tx('Tea', 10, 1000, { source: 'manual' }), tx('Rent', 6000, 2000, { source: 'recurring' })], now)
    expect(found.recent.map((r) => r.source)).toEqual(['recurring', 'manual'])
  })

  it('can look back a different number of days', () => {
    const found = balanceTrail([tx('Old', 900, 8 * DAY)], now, { windowDays: 30 })
    expect(found.recent).toHaveLength(1)
  })
})
