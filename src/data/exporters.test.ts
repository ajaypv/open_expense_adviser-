import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '../db/schema'
import { csvCell, transactionsToCsv } from './exporters'

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
    expect(csvCell('plain')).toBe('plain')
  })

  it('defuses spreadsheet formulas in text but leaves numbers alone', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)")
    expect(csvCell('+91 98765')).toBe("'+91 98765")
    expect(csvCell('@cmd')).toBe("'@cmd")
    expect(csvCell(-12.5)).toBe('-12.5')
  })
})

describe('transactionsToCsv', () => {
  const cats = new Map<number, Category>([
    [1, { id: 1, name: 'Food & Dining', color: 'var(--s1)' }],
    [2, { id: 2, name: 'Income', color: 'var(--ink-2)' }],
  ])
  const tx = (id: number, kind: Transaction['kind'], date: string, amount: number, categoryId: number, merchant: string): Transaction => ({
    id, kind, amountMinor: amount, currency: 'INR', categoryId, merchant, note: '', date, paymentMethod: '', source: 'manual', createdAt: id,
  })

  it('labels each row sent or received, keeps amounts positive and sorts by date', () => {
    const csv = transactionsToCsv(
      [tx(2, 'income', '2026-10-05', 500000, 2, 'Employer'), tx(1, 'expense', '2026-10-01', 45050, 1, 'Cafe, Main St')],
      cats,
    ).split('\n')
    expect(csv[0]).toBe('date,type,amount,currency,category,merchant,note,payment_method,source,latitude,longitude')
    expect(csv[1]).toBe('2026-10-01,sent,450.50,INR,Food & Dining,"Cafe, Main St",,,manual,,')
    expect(csv[2]).toBe('2026-10-05,received,5000.00,INR,Income,Employer,,,manual,,')
  })

  it('exports the place a transaction was added, and leaves the columns empty without one', () => {
    const withPlace = { ...tx(1, 'expense', '2026-10-01', 45000, 1, 'Cafe'), location: { lat: 12.9716, lon: 77.5946, accuracyM: 20 } }
    const csv = transactionsToCsv([withPlace, tx(2, 'expense', '2026-10-02', 100, 1, 'Bus')], cats).split('\n')
    expect(csv[1]).toBe('2026-10-01,sent,450.00,INR,Food & Dining,Cafe,,,manual,12.9716,77.5946')
    expect(csv[2]).toMatch(/,manual,,$/)
  })
})
