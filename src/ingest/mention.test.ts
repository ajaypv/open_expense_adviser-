import { describe, expect, it } from 'vitest'
import type { Person } from '../db/schema'
import { parseMany, parseExpense } from './localParser'
import { extractPerson, mentionAt } from './mention'

const person = (id: number, name: string): Person => ({ id, name, createdAt: id })
const people = [person(1, 'Shweta Rao'), person(2, 'Ankit Verma'), person(3, 'Meera Shetty'), person(4, 'Meera Nair')]
const today = new Date(2026, 10, 6)

describe('extractPerson', () => {
  it('finds a known person after an @ and takes the name out of the line', () => {
    expect(extractPerson('@Shweta Rao 500', people)).toMatchObject({ name: 'Shweta Rao', person: { id: 1 }, rest: '500' })
    expect(extractPerson('500 for lunch @shweta rao', people)).toMatchObject({ name: 'Shweta Rao', rest: '500 for lunch' })
  })

  it('takes the first name when it is only one person’s', () => {
    expect(extractPerson('@shweta 500', people)).toMatchObject({ name: 'Shweta Rao', person: { id: 1 }, rest: '500' })
    expect(extractPerson('@ankit 70', people)?.person?.id).toBe(2)
  })

  it('does not guess between two people who share a first name', () => {
    const m = extractPerson('@meera 100', people)
    expect(m?.person).toBeUndefined()
    expect(m?.name).toBe('Meera')
    expect(extractPerson('@meera nair 100', people)?.person?.id).toBe(4)
  })

  it('takes a new name up to the amount, a day or a little word, in capitals', () => {
    expect(extractPerson('@kavya nair 500', [])).toMatchObject({ name: 'Kavya Nair', rest: '500' })
    expect(extractPerson('@kavya for 500', [])).toMatchObject({ name: 'Kavya', rest: 'for 500' })
    expect(extractPerson('@kavya yesterday 500', [])).toMatchObject({ name: 'Kavya', rest: 'yesterday 500' })
    expect(extractPerson('@a b c d 500', [])?.name).toBe('A B C') // no more than three words
  })

  it('ignores an @ with no name, and an address', () => {
    expect(extractPerson('@ 500', [])).toBeNull()
    expect(extractPerson('mail me@x.com 500', [])).toBeNull()
  })

  it('knows "to" and a person already known, but not "to" and a stranger', () => {
    expect(extractPerson('500 to Shweta', people)).toMatchObject({ name: 'Shweta Rao', rest: '500 to' })
    expect(extractPerson('paid 200 to ankit verma', people)?.person?.id).toBe(2)
    expect(extractPerson('500 to the plumber', people)).toBeNull()
    expect(extractPerson('coffee 120', people)).toBeNull()
  })
})

describe('mentionAt', () => {
  it('finds the name being typed after an @, and where the @ is', () => {
    expect(mentionAt('@shw', 4)).toEqual({ start: 0, query: 'shw' })
    expect(mentionAt('500 to @sh', 10)).toEqual({ start: 7, query: 'sh' })
    expect(mentionAt('@', 1)).toEqual({ start: 0, query: '' })
    expect(mentionAt('@shweta r', 9)).toEqual({ start: 0, query: 'shweta r' })
  })

  it('is not there when the @ is in an address, past the name, or the caret is before it', () => {
    expect(mentionAt('me@x', 4)).toBeNull()
    expect(mentionAt('@shweta 500', 11)).toBeNull()
    expect(mentionAt('@shweta 500', 0)).toBeNull()
    expect(mentionAt('coffee', 6)).toBeNull()
    expect(mentionAt('@a b c d', 8)).toBeNull()
  })
})

describe('parsing a line about a person', () => {
  it('reads "@Shweta Rao 500" as money sent to her, under her name', () => {
    expect(parseExpense('@Shweta Rao 500', today, people)).toMatchObject({
      kind: 'expense', amountMinor: 50_000, merchant: 'Shweta Rao', person: { name: 'Shweta Rao', id: 1 }, categoryName: 'Other',
    })
  })

  it('keeps the rest of the words as a note, and files under what they say', () => {
    const p = parseExpense('@shweta 350 lunch yesterday', today, people)!
    expect(p.person?.id).toBe(1)
    expect(p.note).toBe('lunch')
    expect(p.categoryName).toBe('Food & Dining')
    expect(p.date).toBe('2026-11-05')
  })

  it('takes the amount, the date and how it was paid from the rest of the line', () => {
    expect(parseExpense('sent ₹1,200 to @Kavya by upi 3 days ago', today, people)).toMatchObject({
      amountMinor: 120_000, merchant: 'Kavya', person: { name: 'Kavya' }, paymentMethod: 'Online', date: '2026-11-03',
    })
  })

  it('has no id for a name that is new', () => {
    expect(parseExpense('@kavya 100', today, [])?.person).toEqual({ name: 'Kavya' })
  })

  it('reads "500 to Shweta" as sent to her when she is known', () => {
    expect(parseExpense('500 to shweta', today, people)?.person?.id).toBe(1)
    expect(parseExpense('500 to shweta', today, [])?.person).toBeUndefined()
  })

  it('reads money from someone as received, under their name, not as a payment to them', () => {
    const p = parseExpense('@shweta paid me 500', today, people)!
    expect(p.kind).toBe('income')
    expect(p.merchant).toBe('Shweta Rao')
    expect(p.person).toBeUndefined()
  })

  it('handles several entries, one of them to a person', () => {
    const all = parseMany('coffee 120, @shweta 500', today, people)
    expect(all).toHaveLength(2)
    expect(all[0]).toMatchObject({ merchant: 'Coffee', amountMinor: 12_000 })
    expect(all[0].person).toBeUndefined()
    expect(all[1]).toMatchObject({ merchant: 'Shweta Rao', amountMinor: 50_000, person: { id: 1 } })
  })

  it('finds nothing without an amount, and leaves ordinary lines exactly as they were', () => {
    expect(parseExpense('@shweta', today, people)).toBeNull()
    expect(parseExpense('450 lunch at Cafe', today, people)).toMatchObject({ merchant: 'Lunch Cafe', amountMinor: 45_000 })
    expect(parseExpense('450 lunch at Cafe', today, people)?.person).toBeUndefined()
  })
})
