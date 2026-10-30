import { describe, expect, it } from 'vitest'
import type { Account, Recurring } from '../db/schema'
import { describeWhen, forecast, forecastByAccount, restOfMonth, TAG_LABELS, tagOf, totalsOf, upcomingPayments, type UpcomingPayment } from './upcoming'

const today = '2026-10-30' // a Friday
const money = { currency: 'INR', rates: {} as Record<string, number> }

let id = 0
const rule = (over: Partial<Recurring> = {}): Recurring => ({
  id: ++id, kind: 'expense', amountMinor: 100_000, currency: 'INR', categoryId: 1, merchant: 'Home loan', note: '', paymentMethod: '',
  frequency: 'monthly', nextDue: '2026-11-05', active: true, ...over,
})

const emi = rule({ merchant: 'Home loan', amountMinor: 1_250_000, nextDue: '2026-11-05', tag: 'loan' })
const netflix = rule({ merchant: 'Netflix', amountMinor: 49_900, nextDue: '2026-11-01', tag: 'autopay' })
const salary = rule({ merchant: 'Salary', kind: 'income', amountMinor: 8_000_000, nextDue: '2026-11-01', tag: 'income' })
const weekly = rule({ merchant: 'Maid', amountMinor: 20_000, frequency: 'weekly', nextDue: '2026-11-02' })
const paused = rule({ merchant: 'Gym', active: false, nextDue: '2026-11-03' })
const missed = rule({ merchant: 'Electricity', amountMinor: 100_000, nextDue: '2026-10-28' })

const names = (items: UpcomingPayment[]) => items.map((i) => `${i.date} ${i.rule.merchant}`)

describe('upcomingPayments', () => {
  it('lists what is coming in order of date, and leaves out anything paused', () => {
    const items = upcomingPayments([emi, netflix, salary, paused], today, 30, money)
    expect(names(items)).toEqual(['2026-11-01 Netflix', '2026-11-01 Salary', '2026-11-05 Home loan'])
  })

  it('says how many days away each one is', () => {
    const items = upcomingPayments([emi, netflix], today, 30, money)
    expect(items.map((i) => i.daysLeft)).toEqual([2, 6])
  })

  it('repeats a weekly payment as many times as fit in the window, and a monthly one once', () => {
    const items = upcomingPayments([weekly, emi], today, 30, money)
    expect(names(items)).toEqual(['2026-11-02 Maid', '2026-11-05 Home loan', '2026-11-09 Maid', '2026-11-16 Maid', '2026-11-23 Maid'])
  })

  it('shows a longer look-ahead when asked, including the second monthly payment', () => {
    const items = upcomingPayments([emi], today, 90, money)
    expect(names(items)).toEqual(['2026-11-05 Home loan', '2026-12-05 Home loan', '2027-01-05 Home loan'])
  })

  it('keeps a payment on the 31st on the 31st through short months', () => {
    const r = rule({ merchant: 'Rent', nextDue: '2026-10-31', anchorDay: 31 })
    expect(names(upcomingPayments([r], today, 150, money))).toEqual(['2026-10-31 Rent', '2026-11-30 Rent', '2026-12-31 Rent', '2027-01-31 Rent', '2027-02-28 Rent'])
  })

  it('includes a payment due today, as zero days away', () => {
    const r = rule({ nextDue: today })
    expect(upcomingPayments([r], today, 30, money)[0]).toMatchObject({ daysLeft: 0, overdue: false })
  })

  it('counts a missed payment as overdue, since it has not been added yet, and still looks ahead', () => {
    const items = upcomingPayments([missed], today, 30, money)
    expect(items[0]).toMatchObject({ date: '2026-10-28', daysLeft: -2, overdue: true })
    expect(items[1]).toMatchObject({ date: '2026-11-28', overdue: false })
  })

  it('puts overdue payments first', () => {
    expect(upcomingPayments([emi, missed], today, 30, money)[0].rule.merchant).toBe('Electricity')
  })

  it('works out the amount in the main currency', () => {
    const usd = rule({ merchant: 'Hosting', currency: 'USD', amountMinor: 1000, nextDue: '2026-11-03' })
    const [item] = upcomingPayments([usd], today, 30, { currency: 'INR', rates: { USD: 83 } })
    expect(item).toMatchObject({ amountMinor: 83_000, unconverted: false })
  })

  it('counts an amount at face value, and says so, when no rate is set', () => {
    const usd = rule({ currency: 'USD', amountMinor: 1000, nextDue: '2026-11-03' })
    expect(upcomingPayments([usd], today, 30, money)[0]).toMatchObject({ amountMinor: 1000, unconverted: true })
  })

  it('has nothing to show when nothing repeats', () => {
    expect(upcomingPayments([], today, 30, money)).toEqual([])
  })
})

describe('totals and the rest of the month', () => {
  const items = upcomingPayments([emi, netflix, salary, missed], today, 30, money)

  it('adds up what goes out and what comes in', () => {
    expect(totalsOf(items)).toEqual({ outMinor: 1_250_000 + 49_900 + 100_000 + 100_000, inMinor: 8_000_000, count: 5 })
  })

  it('keeps for the rest of this month only what is still to happen in it, with anything overdue', () => {
    const rest = restOfMonth(items, today)
    expect(names(rest)).toEqual(['2026-10-28 Electricity'])
  })

  it('takes in the days left of an earlier month', () => {
    const early = upcomingPayments([rule({ merchant: 'Gym', nextDue: '2026-11-20' }), rule({ merchant: 'Rent', nextDue: '2026-12-05' })], '2026-11-10', 30, money)
    expect(names(restOfMonth(early, '2026-11-10'))).toEqual(['2026-11-20 Gym'])
  })
})

describe('forecast', () => {
  const pay = (date: string, amountMinor: number, kind: 'expense' | 'income' = 'expense'): UpcomingPayment => ({
    key: `${date}-${amountMinor}`, rule: rule({ kind }), date, daysLeft: 0, amountMinor, kind, unconverted: false, overdue: false,
  })

  it('says the balance covers everything when it never goes below zero', () => {
    const f = forecast(5_000_000, [pay('2026-11-05', 1_250_000), pay('2026-11-10', 20_000)], today)
    expect(f).toMatchObject({ shortfallMinor: 0, firstShortDate: null, endMinor: 3_730_000, lowestMinor: 3_730_000 })
  })

  it('finds the day it runs short, and by how much at the worst', () => {
    const f = forecast(1_000_000, [pay('2026-11-05', 1_250_000), pay('2026-11-20', 300_000)], today)
    expect(f.firstShortDate).toBe('2026-11-05')
    expect(f.lowestMinor).toBe(-550_000)
    expect(f.lowestDate).toBe('2026-11-20')
    expect(f.shortfallMinor).toBe(550_000)
  })

  it('counts money coming in, so a salary can cover what goes out after it', () => {
    const f = forecast(100_000, [pay('2026-11-01', 8_000_000, 'income'), pay('2026-11-05', 1_250_000)], today)
    expect(f.shortfallMinor).toBe(0)
    expect(f.endMinor).toBe(100_000 + 8_000_000 - 1_250_000)
  })

  it('assumes payments leave before money arrives on the same day, to be safe', () => {
    const f = forecast(10_000, [pay('2026-11-01', 50_000), pay('2026-11-01', 100_000, 'income')], today)
    expect(f.lowestMinor).toBe(-40_000)
    expect(f.firstShortDate).toBe('2026-11-01')
  })

  it('counts overdue payments from today', () => {
    const overdue = { ...pay('2026-10-20', 500_000), overdue: true, daysLeft: -10 }
    const f = forecast(300_000, [overdue], today)
    expect(f.firstShortDate).toBe(today)
    expect(f.shortfallMinor).toBe(200_000)
  })

  it('has nothing to say when nothing is coming', () => {
    expect(forecast(123, [], today)).toMatchObject({ endMinor: 123, lowestMinor: 123, shortfallMinor: 0, firstShortDate: null, lowestDate: null })
  })
})

describe('forecastByAccount', () => {
  const accounts: Account[] = [
    { id: 1, name: 'Main', openingMinor: null },
    { id: 2, name: 'HDFC', openingMinor: null },
    { id: 3, name: 'Cash', openingMinor: null },
  ]
  const balances = new Map([[1, { estimatedMinor: 500_000 }], [2, { estimatedMinor: 100_000 }], [3, { estimatedMinor: 0 }]])

  it('checks each account against the payments that leave from it', () => {
    const items = upcomingPayments([rule({ merchant: 'EMI', amountMinor: 300_000, accountId: 2, nextDue: '2026-11-05' }), rule({ merchant: 'Wifi', amountMinor: 50_000, nextDue: '2026-11-06' })], today, 30, money)
    const result = forecastByAccount(items, accounts, balances, today)
    expect(result.map((r) => [r.name, r.forecast.shortfallMinor])).toEqual([
      ['Main', 0], // Wifi has no account, so it comes out of the first account
      ['HDFC', 200_000],
    ])
  })

  it('leaves out accounts nothing is scheduled against', () => {
    const items = upcomingPayments([rule({ accountId: 2, nextDue: '2026-11-05' })], today, 30, money)
    expect(forecastByAccount(items, accounts, balances, today).map((r) => r.name)).toEqual(['HDFC'])
  })

  it('has no accounts to check when there are none', () => {
    expect(forecastByAccount([], accounts, balances, today)).toEqual([])
  })
})

describe('words', () => {
  it('says when in plain words', () => {
    expect(describeWhen(0)).toBe('Today')
    expect(describeWhen(1)).toBe('Tomorrow')
    expect(describeWhen(6)).toBe('In 6 days')
    expect(describeWhen(-1)).toBe('Overdue by 1 day')
    expect(describeWhen(-3)).toBe('Overdue by 3 days')
  })

  it('names each kind of payment, and a sensible default for one made without a type', () => {
    expect(TAG_LABELS.loan).toBe('Loan EMI')
    expect(TAG_LABELS.autopay).toBe('UPI AutoPay')
    expect(tagOf(rule({ kind: 'income' }))).toBe('income')
    expect(tagOf(rule({ kind: 'expense' }))).toBe('other')
    expect(tagOf(rule({ tag: 'loan' }))).toBe('loan')
  })
})
