import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { suggest } from './suggestions'

const wednesdayEvening = new Date(2026, 9, 28, 19, 30) // Wed 28 Oct 2026, 7:30pm

let id = 0
/** `hour` is when the entry was logged, which stands in for the time of day it happened. */
const tx = (
  date: string,
  merchant: string,
  amount = 100,
  extra: Partial<Transaction> = {},
  hour = 8,
): Transaction => {
  const [y, m, d] = date.split('-').map(Number)
  return {
    id: ++id,
    kind: 'expense',
    amountMinor: amount * 100,
    currency: 'INR',
    categoryId: 1,
    merchant,
    note: '',
    date,
    paymentMethod: '',
    source: 'manual',
    createdAt: new Date(y, m - 1, d, hour).getTime(),
    ...extra,
  }
}

describe('suggest', () => {
  it('puts merchants that repeat first, then one-offs, and ignores blank merchants', () => {
    const txs = [
      tx('2026-10-03', 'Amazon'), // one-off
      tx('2026-10-01', 'Swiggy'),
      tx('2026-10-05', 'Swiggy'),
      tx('2026-10-02', ''),
      tx('2026-10-04', ''),
    ]
    expect(suggest(txs, wednesdayEvening).map((s) => s.merchant)).toEqual(['Swiggy', 'Amazon'])
  })

  it('still suggests something from a single entry, and says when it was added', () => {
    expect(suggest([tx('2026-10-27', 'Cafe')], wednesdayEvening)).toMatchObject([
      { merchant: 'Cafe', count: 1, reason: 'Last added yesterday' },
    ])
    expect(suggest([tx('2026-10-20', 'Cafe')], wednesdayEvening)[0].reason).toBe('Last added 8 days ago')
    expect(suggest([tx('2026-08-02', 'Cafe')], wednesdayEvening)[0].reason).toMatch(/^Last added /)
  })

  it('merges names case-insensitively and uses the usual amount, category and payment method', () => {
    const txs = [
      tx('2026-10-01', 'Swiggy', 450, { paymentMethod: 'Online' }),
      tx('2026-10-05', 'swiggy', 450, { paymentMethod: 'Online' }),
      tx('2026-10-07', 'Swiggy', 300, { categoryId: 2 }),
    ]
    const [s] = suggest(txs, wednesdayEvening)
    expect(s).toMatchObject({ amountMinor: 45000, categoryId: 1, paymentMethod: 'Online', count: 3 })
  })

  it('ranks a merchant you usually pay on this weekday above one with no pattern', () => {
    const txs = [
      tx('2026-10-05', 'Cafe'), // Mon
      tx('2026-10-06', 'Cafe'), // Tue
      tx('2026-10-09', 'Cafe'), // Fri
      tx('2026-10-07', 'Gym'), // Wed
      tx('2026-10-14', 'Gym'), // Wed
      tx('2026-10-21', 'Gym'), // Wed
    ]
    const out = suggest(txs, wednesdayEvening)
    expect(out[0]).toMatchObject({ merchant: 'Gym', reason: 'Usually on Wednesdays' })
    expect(out[1]).toMatchObject({ merchant: 'Cafe', reason: 'Logged 3 times' })
  })

  it('notices the usual part of the day', () => {
    const txs = [
      tx('2026-10-01', 'Tea', 20, {}, 18),
      tx('2026-10-02', 'Tea', 20, {}, 18),
      tx('2026-10-05', 'Tea', 20, {}, 17),
    ]
    expect(suggest(txs, wednesdayEvening)[0].reason).toBe('Usually in the evening')
    expect(suggest(txs, new Date(2026, 9, 28, 9, 0))[0].reason).toBe('Logged 3 times') // morning: no match
  })

  it('suggests a monthly payment only when its date is near, and says which day', () => {
    const txs = [tx('2026-08-01', 'Rent', 18000), tx('2026-09-01', 'Rent', 18000), tx('2026-10-01', 'Rent', 18000)]
    expect(suggest(txs, new Date(2026, 10, 1, 10, 0))[0]).toMatchObject({
      merchant: 'Rent',
      reason: 'Usually around the 1st',
    })
    // Entries were logged in the morning, so query at night to isolate the date signal.
    expect(suggest(txs, new Date(2026, 10, 15, 22, 0))[0].reason).toBe('Logged 3 times')
  })

  it('ranks anything already logged today last, and says so, instead of hiding it', () => {
    const txs = [
      tx('2026-10-01', 'Swiggy'),
      tx('2026-10-05', 'Swiggy'),
      tx('2026-10-28', 'Swiggy'),
      tx('2026-10-10', 'Uber'),
    ]
    expect(suggest(txs, wednesdayEvening).map((s) => [s.merchant, s.reason])).toEqual([
      ['Uber', 'Last added 18 days ago'],
      ['Swiggy', 'Added earlier today'],
    ])
  })

  it('keeps money sent and money received apart, and can filter by kind', () => {
    const txs = [
      tx('2026-09-01', 'Employer', 80000, { kind: 'income' }),
      tx('2026-10-01', 'Employer', 80000, { kind: 'income' }),
      tx('2026-10-02', 'Employer', 50), // an expense to the same name is kept apart from the income
      tx('2026-10-03', 'Swiggy'),
      tx('2026-10-04', 'Swiggy'),
    ]
    expect(suggest(txs, wednesdayEvening).map((s) => `${s.kind}:${s.merchant}`).sort()).toEqual([
      'expense:Employer',
      'expense:Swiggy',
      'income:Employer',
    ])
    expect(suggest(txs, wednesdayEvening, 4, 'income').map((s) => s.merchant)).toEqual(['Employer'])
  })

  it('returns at most the requested number, with no data giving none', () => {
    const many = 'ABCDEF'.split('').flatMap((m) => [tx('2026-10-01', m), tx('2026-10-02', m)])
    expect(suggest(many, wednesdayEvening, 3)).toHaveLength(3)
    expect(suggest([], wednesdayEvening)).toEqual([])
  })
})
