import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { placesIn } from './places'

const categories = new Map<number, Category>([
  [1, { id: 1, name: 'Food & Dining', color: 'var(--s1)' }],
  [2, { id: 2, name: 'Transport', color: 'var(--s3)' }],
])

let id = 0
const tx = (merchant: string, rupees: number, lat: number | null, lon = 77.5946, extra: Partial<Transaction> = {}): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId: 1, merchant, note: '',
  date: '2026-10-12', paymentMethod: '', source: 'manual', createdAt: id,
  ...(lat === null ? {} : { location: { lat, lon, accuracyM: 20 } }),
  ...extra,
})
const places = (txs: Transaction[], month = '2026-10') => placesIn(txs, month, categories)

describe('placesIn: where the spending of a month was recorded', () => {
  it('is one spot per place, with how many times and what it came to', () => {
    const found = places([tx('Cafe', 100, 12.9716), tx('Cafe', 150, 12.9716), tx('Uber', 230, 13.2)])
    expect(found).toHaveLength(2)
    const cafe = found.find((p) => p.name === 'Cafe')!
    expect(cafe).toMatchObject({ count: 2, totalMinor: 25000 })
  })

  it('puts fixes a few metres apart on the same spot, and places a street away on their own', () => {
    // Three fixes within about 50 m, and one 400 m north.
    const found = places([tx('Cafe', 10, 12.97161), tx('Cafe', 10, 12.97163), tx('Cafe', 10, 12.97158), tx('Cafe', 10, 12.9752)])
    expect(found.map((p) => p.count).sort()).toEqual([1, 3])
  })

  it('puts the spot in the middle of the fixes it gathered', () => {
    const [p] = places([tx('Cafe', 10, 12.9716, 77.5946), tx('Cafe', 10, 12.9718, 77.5948)])
    expect(p.lat).toBeCloseTo(12.9717, 4)
    expect(p.lon).toBeCloseTo(77.5947, 4)
  })

  it('names a spot by what was bought there most often, and falls back to its category', () => {
    const found = places([tx('Cafe', 10, 12.9716), tx('Cafe', 10, 12.9716), tx('Bakery', 10, 12.9716), tx('', 50, 13.3)])
    expect(found.find((p) => p.count === 3)!.name).toBe('Cafe')
    expect(found.find((p) => p.count === 1)!.name).toBe('Food & Dining')
  })

  it('takes the colour of the category most was spent on there', () => {
    const [p] = places([tx('Uber', 500, 12.9716, 77.5946, { categoryId: 2 }), tx('Tea', 10, 12.9716), tx('Tea', 10, 12.9716)])
    expect(p.color).toBe('var(--s3)')
  })

  it('biggest first', () => {
    const found = places([tx('Small', 10, 12.1), tx('Big', 900, 12.5), tx('Middle', 90, 12.9)])
    expect(found.map((p) => p.name)).toEqual(['Big', 'Middle', 'Small'])
  })

  it('leaves out entries with no location, other months, trashed entries and money that is not spending', () => {
    const found = places([
      tx('No place', 10, null),
      tx('Last month', 10, 12.9, 77.5, { date: '2026-09-30' }),
      tx('Trashed', 10, 12.9, 77.5, { deletedAt: 5 }),
      tx('Income', 10, 12.9, 77.5, { kind: 'income' }),
      tx('Transfer', 10, 12.9, 77.5, { kind: 'transfer' }),
    ])
    expect(found).toEqual([])
  })

  it('gives each spot a stable key', () => {
    const a = places([tx('Cafe', 10, 12.9716)])[0].key
    const b = places([tx('Cafe', 99, 12.9716)])[0].key
    expect(a).toBe(b)
  })

  it('copes with a category that no longer exists', () => {
    const [p] = places([tx('', 10, 12.9716, 77.5946, { categoryId: 99 })])
    expect(p.name).toBe('Spending')
    expect(p.color).toBe('var(--other)')
  })

  it('is empty when nothing was recorded', () => {
    expect(places([])).toEqual([])
  })
})
