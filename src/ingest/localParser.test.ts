import { describe, expect, it } from 'vitest'
import { parseExpense } from './localParser'

// Wednesday, 28 Oct 2026
const today = new Date(2026, 9, 28)

describe('parseExpense', () => {
  it('parses a natural sentence with a relative date', () => {
    const r = parseExpense('spent 450 on swiggy yesterday', today)
    expect(r).toMatchObject({
      amountMinor: 45000,
      merchant: 'Swiggy',
      categoryName: 'Food & Dining',
      date: '2026-10-27',
    })
  })

  it('understands k suffix and payment method', () => {
    const r = parseExpense('paid rent 18k by UPI', today)
    expect(r).toMatchObject({
      amountMinor: 1_800_000,
      merchant: 'Rent',
      categoryName: 'Rent & Housing',
      paymentMethod: 'Online',
      date: '2026-10-28',
    })
  })

  it('handles thousands separators, decimals and currency symbols', () => {
    expect(parseExpense('₹1,200 groceries', today)?.amountMinor).toBe(120000)
    expect(parseExpense('paid 99.50 for netflix', today)).toMatchObject({
      amountMinor: 9950,
      categoryName: 'Entertainment & Travel',
    })
  })

  it('does not mistake "N days ago" for the amount', () => {
    const r = parseExpense('3 days ago 80 auto', today)
    expect(r).toMatchObject({ amountMinor: 8000, date: '2026-10-25', categoryName: 'Transport' })
  })

  it('resolves weekdays: "on" includes today, "last" is strictly in the past', () => {
    expect(parseExpense('coffee 120 last monday', today)?.date).toBe('2026-10-26')
    expect(parseExpense('lunch 200 on wednesday', today)?.date).toBe('2026-10-28')
    expect(parseExpense('lunch 200 last wednesday', today)?.date).toBe('2026-10-21')
  })

  it('recognises money received and files it under Income', () => {
    expect(parseExpense('received 5000 from rahul', today)).toMatchObject({
      kind: 'income',
      amountMinor: 500000,
      merchant: 'Rahul',
      categoryName: 'Income',
    })
    expect(parseExpense('salary 80000', today)).toMatchObject({ kind: 'income', merchant: 'Salary', amountMinor: 8_000_000 })
    expect(parseExpense('rahul sent me 1200 yesterday', today)).toMatchObject({ kind: 'income', merchant: 'Rahul', date: '2026-10-27' })
    expect(parseExpense('got paid 1200', today)?.kind).toBe('income')
    expect(parseExpense('refund 500 amazon', today)).toMatchObject({ kind: 'income', merchant: 'Refund Amazon' })
  })

  it('does not mistake outgoing wording for income', () => {
    expect(parseExpense('paid 500 to rahul', today)?.kind).toBe('expense')
    expect(parseExpense('sent 500 to rahul', today)?.kind).toBe('expense')
    expect(parseExpense('credit card 500 netflix', today)).toMatchObject({ kind: 'expense', paymentMethod: 'Card' })
    expect(parseExpense('spent 450 on swiggy yesterday', today)?.kind).toBe('expense')
  })

  it('falls back to Other and returns null without an amount', () => {
    expect(parseExpense('bought a thing 75', today)?.categoryName).toBe('Other')
    expect(parseExpense('hello there', today)).toBeNull()
    expect(parseExpense('', today)).toBeNull()
  })
})
