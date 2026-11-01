import { describe, expect, it } from 'vitest'
import type { Recurring } from '../db/schema'
import { regularPayments } from './regular'

const today = '2026-10-28' // a Wednesday
const money = { currency: 'INR', rates: {} as Record<string, number> }

let id = 0
const rule = (over: Partial<Recurring> = {}): Recurring => ({
  id: ++id, kind: 'expense', amountMinor: 100_000, currency: 'INR', categoryId: 1, merchant: 'Thing', note: '', paymentMethod: '',
  frequency: 'monthly', nextDue: '2026-11-05', active: true, ...over,
})

const rent = rule({ merchant: 'Rent', amountMinor: 600_000, nextDue: '2026-10-31', tag: 'bill' })
const emi = rule({ merchant: 'Home loan', amountMinor: 1_250_000, nextDue: '2026-11-05', tag: 'loan' })
const maid = rule({ merchant: 'Maid', amountMinor: 20_000, frequency: 'weekly', nextDue: '2026-10-30' })
const salary = rule({ merchant: 'Salary', kind: 'income', amountMinor: 8_000_000, nextDue: '2026-10-30', tag: 'income' })
const gym = rule({ merchant: 'Gym', active: false, nextDue: '2026-10-29' })

const summary = (rules: Recurring[]) => regularPayments(rules, today, money)!

describe('regularPayments: nothing to say', () => {
  it('is null with no rules at all', () => {
    expect(regularPayments([], today, money)).toBeNull()
  })

  it('is null when every rule is switched off', () => {
    expect(regularPayments([gym], today, money)).toBeNull()
  })

  it('is null when the only rules are money coming in, since there is nothing to pay', () => {
    expect(regularPayments([salary], today, money)).toBeNull()
  })
})

describe('regularPayments: what a month and a year of them cost', () => {
  it('turns a weekly payment into its monthly equivalent (52 weeks over 12 months)', () => {
    const s = summary([rent, emi, maid])
    // 6,000 + 12,500 + 200 × 52 / 12 = 19,366.67
    expect(s.monthlyMinor).toBe(1_936_667)
  })

  it('works out the year from the exact amounts, so it is not rounding twice', () => {
    expect(summary([rent, emi, maid]).yearlyMinor).toBe(23_240_000) // 6,000×12 + 12,500×12 + 200×52
  })

  it('keeps money coming in apart from money going out', () => {
    const s = summary([rent, salary])
    expect(s.monthlyMinor).toBe(600_000)
    expect(s.incomeMonthlyMinor).toBe(8_000_000)
  })

  it('leaves out anything switched off', () => {
    expect(summary([rent, gym]).monthlyMinor).toBe(600_000)
  })

  it('splits it by kind of payment, biggest first, calling an untyped one Other', () => {
    expect(summary([rent, emi, maid]).byType.map((t) => [t.tag, t.label, t.monthlyMinor, t.count])).toEqual([
      ['loan', 'Loan EMI', 1_250_000, 1],
      ['bill', 'Bill', 600_000, 1],
      ['other', 'Other', 86_667, 1],
    ])
  })
})

describe('regularPayments: what is still to pay and when', () => {
  it('adds up what is left to pay this month, counting only what goes out', () => {
    const s = summary([rent, emi, maid, salary])
    // Rent on the 31st and the maid on the 30th; the loan is November's and the salary comes in.
    expect(s.leftThisMonth).toEqual({ outMinor: 620_000, count: 2 })
  })

  it('adds up the next 30 days, with every week of a weekly payment', () => {
    const s = summary([rent, emi, maid, salary])
    // Rent 31 Oct, loan 5 Nov, maid on 30 Oct and 6, 13, 20, 27 Nov (the 27th is day 30).
    expect(s.next30).toEqual({ outMinor: 1_950_000, inMinor: 8_000_000, count: 7 })
  })

  it('names the next payment to go out, not money arriving', () => {
    const s = summary([rent, maid, salary])
    expect(s.next?.rule.merchant).toBe('Maid')
    expect(s.next?.daysLeft).toBe(2)
  })

  it('puts a late payment first, counts it in what is left this month, and says how many are late', () => {
    const late = rule({ merchant: 'Electricity', amountMinor: 100_000, nextDue: '2026-10-25' })
    const s = summary([rent, late])
    expect(s.overdue).toBe(1)
    expect(s.next?.rule.merchant).toBe('Electricity')
    expect(s.leftThisMonth).toEqual({ outMinor: 700_000, count: 2 })
  })

  it('lists at most five, soonest first, with money coming in among them', () => {
    const s = summary([rent, emi, maid, salary])
    expect(s.upcoming).toHaveLength(5)
    const dates = s.upcoming.map((p) => p.date)
    expect([...dates].sort()).toEqual(dates)
    expect(s.upcoming.some((p) => p.kind === 'income')).toBe(true)
  })

  it('has nothing left this month when everything is for next month', () => {
    expect(summary([emi]).leftThisMonth).toEqual({ outMinor: 0, count: 0 })
  })
})

describe('regularPayments: other currencies', () => {
  it('counts a payment in another currency at the rate you set', () => {
    const usd = rule({ currency: 'USD', amountMinor: 1000, nextDue: '2026-11-02' })
    const s = regularPayments([usd], today, { currency: 'INR', rates: { USD: 83 } })!
    expect(s.monthlyMinor).toBe(83_000)
    expect(s.unconverted).toEqual([])
  })

  it('counts it at face value, and says so, when no rate is set', () => {
    const eur = rule({ currency: 'EUR', amountMinor: 1000, nextDue: '2026-11-02' })
    const s = summary([eur])
    expect(s.monthlyMinor).toBe(1000)
    expect(s.unconverted).toEqual(['EUR'])
  })
})
