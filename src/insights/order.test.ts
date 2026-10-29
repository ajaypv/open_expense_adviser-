import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { newestFirst, oldestFirst } from './order'

const tx = (date: string, createdAt: number) => ({ date, createdAt }) as Transaction

describe('transaction ordering', () => {
  const rows = [tx('2026-10-05', 2), tx('2026-09-30', 9), tx('2026-10-05', 7), tx('2026-10-28', 1)]

  it('sorts newest date first, then latest added', () => {
    expect([...rows].sort(newestFirst).map((t) => `${t.date}#${t.createdAt}`)).toEqual([
      '2026-10-28#1',
      '2026-10-05#7',
      '2026-10-05#2',
      '2026-09-30#9',
    ])
  })

  it('is the exact reverse for oldest first', () => {
    expect([...rows].sort(oldestFirst)).toEqual([...rows].sort(newestFirst).reverse())
  })
})
