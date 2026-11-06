import { describe, expect, it } from 'vitest'
import type { Person, Transaction } from '../db/schema'
import { matchPeople, pendingTotal, personNamed, personStats } from './people'

const person = (id: number, name: string): Person => ({ id, name, createdAt: id })
const sent = (id: number, personId: number, date: string, rupees: number, delivery: 'sent' | 'received' = 'sent', over: Partial<Transaction> = {}): Transaction => ({
  id, kind: 'expense', amountMinor: rupees * 100, currency: 'INR', categoryId: 1, merchant: 'x', note: '', date, paymentMethod: '', source: 'manual', createdAt: id, personId, delivery, ...over,
})

const people = [person(1, 'Shweta Rao'), person(2, 'Ankit'), person(3, 'Meera Shetty'), person(4, 'Asha')]

describe('matchPeople', () => {
  it('lists names that start with what is typed first, then a word that starts with it, then the rest', () => {
    expect(matchPeople(people, 'sh').map((p) => p.name)).toEqual(['Shweta Rao', 'Meera Shetty', 'Asha'])
    expect(matchPeople(people, 'ra').map((p) => p.name)).toEqual(['Shweta Rao', 'Meera Shetty']) // a later word, then "Meera" has it inside
    expect(matchPeople(people, 'rao').map((p) => p.name)).toEqual(['Shweta Rao'])
    expect(matchPeople(people, 'ett').map((p) => p.name)).toEqual(['Meera Shetty']) // anywhere
  })

  it('ignores case and accents', () => {
    expect(matchPeople([person(1, 'Zoë')], 'ZOE').map((p) => p.name)).toEqual(['Zoë'])
    expect(matchPeople([person(1, 'Shweta')], 'SHW')).toHaveLength(1)
  })

  it('keeps the order given when several fit equally, so the most recent are first', () => {
    expect(matchPeople(people, 'a').map((p) => p.name)).toEqual(['Ankit', 'Asha', 'Shweta Rao', 'Meera Shetty'])
  })

  it('offers the first few as they come when nothing is typed, and nobody when nothing fits', () => {
    expect(matchPeople(people, '', 2).map((p) => p.name)).toEqual(['Shweta Rao', 'Ankit'])
    expect(matchPeople(people, '   ', 2)).toHaveLength(2)
    expect(matchPeople(people, 'zzz')).toEqual([])
  })

  it('stops at the limit', () => {
    expect(matchPeople(people, 'a', 2)).toHaveLength(2)
  })
})

describe('personNamed', () => {
  it('finds the person by exactly their name, whatever the case or spacing', () => {
    expect(personNamed(people, '  shweta   RAO ')?.id).toBe(1)
    expect(personNamed(people, 'Shweta')).toBeUndefined()
    expect(personNamed(people, '')).toBeUndefined()
  })
})

describe('personStats', () => {
  it('adds up what was sent to each person, and what has not been received yet', () => {
    const stats = personStats(people, [
      sent(10, 1, '2026-11-01', 500, 'received'),
      sent(11, 1, '2026-11-04', 300),
      sent(12, 1, '2026-11-05', 200),
      sent(13, 2, '2026-11-02', 1000, 'received'),
    ])
    const shweta = stats.find((s) => s.person.id === 1)!
    expect(shweta).toMatchObject({ sentMinor: 100_000, count: 3, pendingMinor: 50_000, pendingCount: 2, lastDate: '2026-11-05' })
    expect(shweta.pending.map((t) => t.id)).toEqual([12, 11]) // newest first
    expect(stats.find((s) => s.person.id === 2)).toMatchObject({ sentMinor: 100_000, pendingCount: 0 })
  })

  it('puts the person sent to most recently first, then those never sent to by name', () => {
    const stats = personStats(people, [sent(1, 2, '2026-11-01', 10), sent(2, 3, '2026-11-03', 10)])
    expect(stats.map((s) => s.person.name)).toEqual(['Meera Shetty', 'Ankit', 'Asha', 'Shweta Rao'])
  })

  it('counts only money sent that is not in the trash, and ignores payments with no person', () => {
    const stats = personStats(people, [
      sent(1, 1, '2026-11-01', 100),
      sent(2, 1, '2026-11-02', 100, 'sent', { deletedAt: 5 }),
      sent(3, 1, '2026-11-03', 100, 'sent', { kind: 'income' }),
      { ...sent(4, 1, '2026-11-04', 100), personId: undefined },
      sent(5, 99, '2026-11-05', 100), // a person who was removed
    ])
    expect(stats.find((s) => s.person.id === 1)).toMatchObject({ count: 1, sentMinor: 10_000 })
  })

  it('sums what is waiting across everyone', () => {
    const stats = personStats(people, [sent(1, 1, '2026-11-01', 100), sent(2, 2, '2026-11-02', 250), sent(3, 2, '2026-11-03', 50, 'received')])
    expect(pendingTotal(stats)).toEqual({ minor: 35_000, count: 2 })
    expect(pendingTotal([])).toEqual({ minor: 0, count: 0 })
  })
})
