import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { repeatingSpend } from './repeats'

let id = 0
const tx = (merchant: string, date: string, rupees = 100, extra: Partial<Transaction> = {}): Transaction => ({
  id: ++id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId: 1, merchant, note: '',
  date, paymentMethod: '', source: 'manual', createdAt: id, ...extra,
})
/** The same purchase on each of the given days of October 2026. */
const onDays = (merchant: string, days: number[], rupees = 100, month = '2026-10') =>
  days.map((d) => tx(merchant, `${month}-${String(d).padStart(2, '0')}`, rupees))

const today = new Date(2026, 9, 28) // Wed 28 Oct 2026
const rows = (txs: Transaction[], month = '2026-10', limit?: number) => repeatingSpend(txs, month, today, limit)

describe('repeatingSpend: things you pay for again and again in the month', () => {
  it('is every name you paid at least three times, case-insensitively', () => {
    const found = rows([...onDays('BMTC bus fare', [1, 2, 3]), tx('bmtc Bus Fare', '2026-10-04'), ...onDays('Uber', [5, 6])])
    expect(found.map((r) => [r.name, r.count])).toEqual([['BMTC bus fare', 4]])
  })

  it('ranks by how many times, then by what it came to', () => {
    const found = rows([
      ...onDays('Snacks', [1, 2, 3, 4, 5], 50),
      ...onDays('Lunch', [1, 2, 3, 4, 5], 120),
      ...onDays('Bus', [1, 2, 3, 4, 5, 6, 7], 20),
    ])
    expect(found.map((r) => r.name)).toEqual(['Bus', 'Lunch', 'Snacks'])
  })

  it('adds up what it came to this month, and finds the usual amount', () => {
    const [r] = rows([tx('Tea', '2026-10-01', 10), tx('Tea', '2026-10-02', 20), tx('Tea', '2026-10-03', 20), tx('Tea', '2026-10-04', 500)])
    expect(r.totalMinor).toBe(55000)
    expect(r.typicalMinor).toBe(2000) // the middle one, not dragged up by the odd ₹500
  })

  it('says what share of the month it is', () => {
    const found = rows([...onDays('Tea', [1, 2, 3], 100), ...onDays('Rent', [4], 700)])
    expect(found[0].sharePct).toBe(30) // ₹300 of ₹1,000
  })

  it('ignores blank names, other months, trashed rows and anything that is not spending', () => {
    const found = rows([
      ...onDays('', [1, 2, 3]),
      ...onDays('Tea', [1, 2], 10, '2026-09'),
      tx('Tea', '2026-10-01', 10),
      tx('Tea', '2026-10-02', 10, { deletedAt: 5 }),
      tx('Tea', '2026-10-03', 10, { kind: 'income' }),
      tx('Tea', '2026-10-04', 10, { kind: 'transfer' }),
    ])
    expect(found).toEqual([])
  })

  it('keeps to the limit', () => {
    const many = ['A', 'B', 'C', 'D'].flatMap((n) => onDays(n, [1, 2, 3]))
    expect(rows(many, '2026-10', 2)).toHaveLength(2)
  })

  it('is empty when nothing repeats', () => {
    expect(rows([tx('Uber', '2026-10-01'), tx('Cafe', '2026-10-02')])).toEqual([])
    expect(rows([])).toEqual([])
  })
})

describe('repeatingSpend: bills that come once a month', () => {
  const rent = (months: string[]) => months.map((m) => tx('Rent', `${m}-05`, 6000))

  it('includes a name seen in at least three of the last four months, even once this month', () => {
    const found = rows(rent(['2026-07', '2026-09', '2026-10']))
    expect(found.map((r) => [r.name, r.count, r.pattern])).toEqual([['Rent', 1, 'monthly']])
  })

  it('leaves out one seen in only two of them', () => {
    expect(rows(rent(['2026-09', '2026-10']))).toEqual([])
  })

  it('leaves out one that did not happen in the month being looked at', () => {
    expect(rows(rent(['2026-07', '2026-08', '2026-09']))).toEqual([])
  })

  it('counts months back from the one being looked at, not from today', () => {
    expect(rows(rent(['2026-05', '2026-06', '2026-07']), '2026-07').map((r) => r.name)).toEqual(['Rent'])
  })

  it('comes after the things bought many times', () => {
    const found = rows([...rent(['2026-07', '2026-08', '2026-10']), ...onDays('Tea', [1, 2, 3], 10)])
    expect(found.map((r) => r.name)).toEqual(['Tea', 'Rent'])
  })
})

describe('repeatingSpend: how often', () => {
  it('is almost every day when it happened on at least 40% of the days so far', () => {
    // 28 days have gone by in October; 12 different days is 43%.
    const [r] = rows(onDays('Bus', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))
    expect(r.pattern).toBe('daily')
  })

  it('is about every week when the gaps between are a week or so', () => {
    const [r] = rows(onDays('Groceries', [3, 10, 17, 24]))
    expect(r.pattern).toBe('weekly')
  })

  it('is just regular otherwise', () => {
    const [r] = rows(onDays('Coffee', [1, 2, 3]))
    expect(r.pattern).toBe('regular')
  })

  it('counts several on one day as one day', () => {
    // Twelve rows but only four different days: not daily.
    const found = rows(Array.from({ length: 12 }, (_, i) => tx('Tea', `2026-10-${String(1 + (i % 4)).padStart(2, '0')}`)))
    expect(found[0].pattern).not.toBe('daily')
  })

  it('uses the whole month once it is over, not the days up to today', () => {
    // 12 days is 12/31 = 39% of a finished October, but 12/28 = 43% of the month so far.
    const days = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    expect(rows(onDays('Bus', days), '2026-10')[0].pattern).toBe('daily')
    expect(repeatingSpend(onDays('Bus', days), '2026-10', new Date(2026, 10, 15))[0].pattern).toBe('regular')
  })
})
