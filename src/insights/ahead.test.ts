import { describe, expect, it } from 'vitest'
import type { Recurring } from '../db/schema'
import { planAhead } from './ahead'
import { upcomingPayments } from './upcoming'

const TODAY = '2026-10-28' // Wednesday

let id = 0
const rule = (over: Partial<Recurring>): Recurring => ({
  id: ++id, kind: 'expense', amountMinor: 100_000, currency: 'INR', categoryId: 1, merchant: 'Thing', note: '', paymentMethod: '',
  frequency: 'monthly', nextDue: '2026-11-05', active: true, ...over,
})

const emi = (over: Partial<Recurring> = {}) => rule({ merchant: 'Home loan', amountMinor: 1_250_000, tag: 'loan', nextDue: '2026-11-05', ...over })
const rent = rule({ merchant: 'Rent', amountMinor: 600_000, tag: 'bill', nextDue: '2026-10-31' })
const maid = rule({ merchant: 'Maid', amountMinor: 20_000, frequency: 'weekly', nextDue: '2026-10-30' })
const salary = rule({ merchant: 'Salary', kind: 'income', amountMinor: 8_000_000, tag: 'income', nextDue: '2026-11-01' })

const items = (rules: Recurring[]) => upcomingPayments(rules, TODAY, 30, { currency: 'INR', rates: {} })
const plan = (rules: Recurring[], balance = { set: false, minor: 0 }) => planAhead(items(rules), balance, TODAY)
const kinds = (rules: Recurring[], balance?: { set: boolean; minor: number }) => plan(rules, balance)?.rows.map((r) => r.kind)

describe('planAhead: the rows', () => {
  it('names the next EMI and when it is due', () => {
    const row = plan([emi(), rent, maid])!.rows.find((r) => r.kind === 'emi')!
    expect(row.payment.rule.merchant).toBe('Home loan')
    expect(row.payment.date).toBe('2026-11-05')
    expect(row.payment.daysLeft).toBe(8)
  })

  it('does not list the EMI twice when it is also the biggest payment, and says so', () => {
    const p = plan([emi(), rent, maid, salary])!
    expect(p.rows.map((r) => r.kind)).toEqual(['emi', 'income'])
    expect(p.rows[0].alsoBiggest).toBe(true)
  })

  it('lists the biggest payment on its own when it is not the EMI', () => {
    // A ₹5,000 EMI against ₹6,000 rent.
    const p = plan([emi({ amountMinor: 500_000 }), rent, maid, salary])!
    expect(p.rows.map((r) => r.kind)).toEqual(['emi', 'biggest', 'income'])
    expect(p.rows[1].payment.rule.merchant).toBe('Rent')
    expect(p.rows[0].alsoBiggest).toBe(false)
  })

  it('still points out the biggest payment when nothing is marked as a loan', () => {
    const p = plan([rent, maid])!
    expect(p.rows.map((r) => r.kind)).toEqual(['biggest'])
    expect(p.rows[0].payment.rule.merchant).toBe('Rent')
  })

  it('takes the earlier one when two payments are the same size', () => {
    const a = rule({ merchant: 'Later', amountMinor: 300_000, nextDue: '2026-11-10' })
    const b = rule({ merchant: 'Sooner', amountMinor: 300_000, nextDue: '2026-11-02' })
    expect(plan([a, b])!.rows[0].payment.rule.merchant).toBe('Sooner')
  })

  it('does not call a single payment the biggest', () => {
    expect(kinds([rent])).toEqual([])
  })

  it('shows an EMI that is the only payment going out, without calling it the biggest', () => {
    const p = plan([emi()])!
    expect(p.rows.map((r) => r.kind)).toEqual(['emi'])
    expect(p.rows[0].alsoBiggest).toBe(false)
  })

  it('names when money next comes in', () => {
    const row = plan([rent, maid, salary])!.rows.find((r) => r.kind === 'income')!
    expect(row.payment.rule.merchant).toBe('Salary')
    expect(row.payment.daysLeft).toBe(4)
  })

  it('counts a late payment, which still has to leave', () => {
    const late = rule({ merchant: 'Electricity', amountMinor: 900_000, nextDue: '2026-10-25' })
    const row = plan([late, rent])!.rows.find((r) => r.kind === 'biggest')!
    expect(row.payment.overdue).toBe(true)
  })

  it('has nothing to say with nothing coming up', () => {
    expect(plan([])).toBeNull()
    expect(plan([rule({ active: false })])).toBeNull()
  })
})

describe('planAhead: what to put aside', () => {
  it('says what is due when no balance is set, and about how much a day to keep for it', () => {
    // ₹6,000 rent + ₹12,500 EMI + five ₹200 weekly payments: ₹19,500 over 30 days.
    const { setAside } = plan([emi(), rent, maid])!
    expect(setAside).toEqual({ tone: 'plain', amountMinor: 1_950_000, byDate: null, perDayMinor: 65_000 })
  })

  it('rounds the daily amount up to a whole unit', () => {
    // ₹1,000 over 30 days is ₹33.33 a day: ₹34.
    const { setAside } = plan([rule({ amountMinor: 100_000, nextDue: '2026-11-05' })])!
    expect(setAside!.perDayMinor).toBe(3_400)
  })

  it('says how much more to save when the balance will not cover what is due, and by when', () => {
    // ₹10,000 against rent, the EMI and the weekly payments: goes under on 5 Nov and ends ₹9,500 short.
    const { setAside } = plan([emi(), rent, maid], { set: true, minor: 1_000_000 })!
    expect(setAside).toMatchObject({ tone: 'short', amountMinor: 950_000, byDate: '2026-11-05' })
  })

  it('spreads the shortfall over the days until it goes short', () => {
    // 8 days from the 28th to 5 Nov: ₹9,500 / 8 = ₹1,187.50, up to ₹1,188.
    const { setAside } = plan([emi(), rent, maid], { set: true, minor: 1_000_000 })!
    expect(setAside!.perDayMinor).toBe(118_800)
  })

  it('has nothing to put aside when the balance covers it', () => {
    expect(plan([emi(), rent, maid], { set: true, minor: 5_000_000 })!.setAside).toBeNull()
  })

  it('counts money coming in before the shortfall, so it is not warned about for nothing', () => {
    // ₹10,000, then ₹80,000 salary on 1 Nov, then the EMI: never short.
    expect(plan([emi(), rent, maid, salary], { set: true, minor: 1_000_000 })!.setAside).toBeNull()
  })

  it('has nothing to put aside with only money coming in', () => {
    const p = plan([salary])!
    expect(p.setAside).toBeNull()
    expect(p.rows.map((r) => r.kind)).toEqual(['income'])
  })
})
