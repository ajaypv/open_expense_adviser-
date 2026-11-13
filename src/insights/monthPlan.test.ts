import { describe, expect, it } from 'vitest'
import type { Recurring } from '../db/schema'
import { monthPlan } from './monthPlan'
import { upcomingPayments } from './upcoming'

const money = { currency: 'INR', rates: {} }
let id = 0
const rule = (over: Partial<Recurring>): Recurring => ({
  id: ++id, kind: 'expense', amountMinor: 100_000, currency: 'INR', categoryId: 1, merchant: 'Thing', note: '', paymentMethod: '',
  frequency: 'monthly', nextDue: '2026-11-20', active: true, ...over,
})
const tx = (over: Partial<Parameters<typeof monthPlan>[0][number]>) => ({ kind: 'expense' as const, source: 'recurring' as const, date: '2026-11-05', amountMinor: 500_000, ...over })
const today = '2026-11-12'
/** What `upcomingPayments` gives for the rest of the month, the way the page asks for it. */
const rest = (rules: Recurring[]) => upcomingPayments(rules, today, 18, money)

describe('monthPlan: what has gone, what is still to go and what the month comes to', () => {
  it('adds what was already added from regular payments this month', () => {
    const plan = monthPlan([tx({ amountMinor: 500_000 }), tx({ date: '2026-11-10', amountMinor: 250_000 })], [], today)
    expect(plan.paidMinor).toBe(750_000)
    expect(plan.paidCount).toBe(2)
  })

  it('counts only regular payments, only this month and only money out', () => {
    const plan = monthPlan(
      [
        tx({ source: 'manual' }),
        tx({ source: 'chat' }),
        tx({ source: 'import' }),
        tx({ date: '2026-10-31' }),
        tx({ date: '2026-12-01' }),
        tx({ kind: 'transfer' }),
        tx({ kind: 'income', amountMinor: 8_000_000 }),
        tx({ amountMinor: 123_00 }),
      ],
      [],
      today,
    )
    expect(plan.paidMinor).toBe(123_00)
    expect(plan.paidCount).toBe(1)
    // The salary that was added is money received, not spent.
    expect(plan.receivedMinor).toBe(8_000_000)
  })

  it('adds what is due in the rest of the month, and not what falls in the next one', () => {
    const plan = monthPlan([], rest([rule({ amountMinor: 120_000, nextDue: '2026-11-20' }), rule({ amountMinor: 300_000, nextDue: '2026-11-28' }), rule({ amountMinor: 900_000, nextDue: '2026-12-02' })]), today)
    expect(plan.leftMinor).toBe(420_000)
    expect(plan.leftCount).toBe(2)
    expect(plan.nextDate).toBe('2026-11-20')
    expect(plan.lastDate).toBe('2026-11-28')
  })

  it('counts a payment that is late and not yet added as still to go, and says how much of it is late', () => {
    const plan = monthPlan([], rest([rule({ amountMinor: 90_000, nextDue: '2026-11-03' }), rule({ amountMinor: 60_000, nextDue: '2026-11-25' })]), today)
    expect(plan.leftMinor).toBe(150_000)
    expect(plan.lateMinor).toBe(90_000)
    // A late one is to be paid from today.
    expect(plan.nextDate).toBe(today)
  })

  it('counts a payment due today as still to go, and one already added today as gone, never both', () => {
    const due = rule({ amountMinor: 70_000, nextDue: today })
    expect(monthPlan([], rest([due]), today).leftMinor).toBe(70_000)
    // Once it is added, the rule moves on to next month, so it is no longer among the payments due.
    const added = monthPlan([tx({ date: today, amountMinor: 70_000 })], rest([{ ...due, nextDue: '2026-12-12' }]), today)
    expect(added.paidMinor).toBe(70_000)
    expect(added.leftMinor).toBe(0)
  })

  it('makes the total what has gone plus what is to go, and says how much of it has gone', () => {
    const plan = monthPlan([tx({ amountMinor: 600_000 })], rest([rule({ amountMinor: 400_000, nextDue: '2026-11-25' })]), today)
    expect(plan.totalMinor).toBe(1_000_000)
    expect(plan.paidShare).toBeCloseTo(0.6, 5)
  })

  it('counts a weekly payment as many times as it falls in the days left', () => {
    const plan = monthPlan([], rest([rule({ amountMinor: 10_000, frequency: 'weekly', nextDue: '2026-11-14' })]), today)
    // 14th, 21st and 28th.
    expect(plan.leftCount).toBe(3)
    expect(plan.leftMinor).toBe(30_000)
  })

  it('adds what is still to come in, apart from what is to go out', () => {
    const plan = monthPlan([], rest([rule({ kind: 'income', amountMinor: 8_000_000, nextDue: '2026-11-30' }), rule({ amountMinor: 100_000, nextDue: '2026-11-20' })]), today)
    expect(plan.comingMinor).toBe(8_000_000)
    expect(plan.leftMinor).toBe(100_000)
  })

  it('has nothing to say when there is nothing', () => {
    const plan = monthPlan([], [], today)
    expect(plan).toMatchObject({ paidMinor: 0, leftMinor: 0, totalMinor: 0, paidShare: 0, nextDate: null, lastDate: null })
  })
})
