import { describe, expect, it } from 'vitest'
import { parseMany } from './localParser'

describe('parseMany', () => {
  const today = new Date(2026, 9, 28)

  it('splits entries typed together on commas, semicolons and new lines', () => {
    const rows = parseMany('coffee 120, lunch 340; auto 80\nmetro 30', today)
    expect(rows.map((r) => [r.merchant, r.amountMinor])).toEqual([
      ['Coffee', 12000], ['Lunch', 34000], ['Auto', 8000], ['Metro', 3000],
    ])
  })

  it('keeps a comma inside a number as part of the amount', () => {
    const rows = parseMany('1,200 rent', today)
    expect(rows).toHaveLength(1)
    expect(rows[0].amountMinor).toBe(120000)
    expect(parseMany('rent 18,000', today)).toHaveLength(1)
  })

  it('treats the whole text as one entry if any piece has no amount, so nothing is lost', () => {
    const rows = parseMany('lunch at Joe, the usual place 450', today)
    expect(rows).toHaveLength(1)
    expect(rows[0].amountMinor).toBe(45000)
  })

  it('handles a single entry, a mix of sent and received, and nothing', () => {
    expect(parseMany('450 swiggy', today)).toHaveLength(1)
    const mixed = parseMany('salary 80000, coffee 120', today)
    expect(mixed.map((r) => r.kind)).toEqual(['income', 'expense'])
    expect(parseMany('hello there', today)).toEqual([])
    expect(parseMany('', today)).toEqual([])
  })
})
