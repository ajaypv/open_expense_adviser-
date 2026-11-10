import { describe, expect, it } from 'vitest'
import { guessCategoryName } from '../ingest/localParser'
import { paymentEntry } from './entry'
import type { PendingPayment } from './native'

const at = new Date(2026, 10, 9, 14, 5).getTime() // 9 November 2026
const payment = (over: Partial<PendingPayment> = {}): PendingPayment => ({ id: 1, state: 'add', amountMinor: 25000, merchant: 'Swiggy', income: false, package: 'com.phonepe.app', at, ...over })

describe('paymentEntry', () => {
  it('is an expense for what was paid, on the day it was paid, by UPI, with the app it came from noted', () => {
    expect(paymentEntry(payment())).toEqual({
      kind: 'expense',
      amountMinor: 25000,
      merchant: 'Swiggy',
      categoryName: guessCategoryName('Swiggy'),
      date: '2026-11-09',
      paymentMethod: 'Online',
      note: 'via PhonePe',
    })
  })

  it('guesses the category from the name, as typing it would', () => {
    expect(paymentEntry(payment({ merchant: 'Swiggy' }))!.categoryName).toBe(guessCategoryName('Swiggy'))
    expect(paymentEntry(payment({ merchant: 'Uber' }))!.categoryName).toBe(guessCategoryName('Uber'))
    expect(guessCategoryName('Swiggy')).not.toBe('Other')
  })

  it('is income for money that came in, whatever the name', () => {
    const entry = paymentEntry(payment({ income: true, merchant: 'Ravi', package: 'com.google.android.apps.nbu.paisa.user' }))!
    expect(entry).toMatchObject({ kind: 'income', categoryName: 'Income', merchant: 'Ravi', note: 'via Google Pay' })
  })

  it('has a word for a payment that named no one', () => {
    expect(paymentEntry(payment({ merchant: '' }))!.merchant).toBe('Payment')
    expect(paymentEntry(payment({ merchant: '   ' }))!.merchant).toBe('Payment')
    expect(paymentEntry(payment({ merchant: '', income: true }))!.merchant).toBe('Money received')
  })

  it('uses the day of the payment, not the day it was added', () => {
    expect(paymentEntry(payment({ at: new Date(2026, 9, 31, 23, 59).getTime() }))!.date).toBe('2026-10-31')
  })

  it('says a payment app when it does not know the one it came from', () => {
    expect(paymentEntry(payment({ package: 'com.example.unknown' }))!.note).toBe('via a payment app')
  })

  it.each([0, -100, 1.5, Number.NaN, 1e15])('is nothing for an amount that cannot be added (%s)', (amountMinor) => {
    expect(paymentEntry(payment({ amountMinor }))).toBeNull()
  })
})
