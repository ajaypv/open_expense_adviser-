import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/schema'
import { dayTotals, describeRange, matchesSearch, monthRange, NO_FILTERS, presetOf, presetRange } from './filters'
import { newestFirst } from './order'

// Friday, 30 Oct 2026
const today = new Date(2026, 9, 30)

describe('monthRange', () => {
  it('runs from the first day to the last, whatever the length of the month', () => {
    expect(monthRange('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(monthRange('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})

describe('presets', () => {
  it('knows the ranges behind each quick choice', () => {
    expect(presetRange('any', today)).toEqual({ from: '', to: '' })
    expect(presetRange('this-month', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(presetRange('last-month', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(presetRange('last-30', today)).toEqual({ from: '2026-10-01', to: '2026-10-30' }) // today and the 29 days before
  })

  it('crosses the new year for last month', () => {
    expect(presetRange('last-month', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })

  it('says which quick choice the current dates match, if any', () => {
    expect(presetOf(NO_FILTERS, today)).toBe('any')
    expect(presetOf({ ...NO_FILTERS, ...monthRange('2026-10') }, today)).toBe('this-month')
    expect(presetOf({ ...NO_FILTERS, ...monthRange('2026-09') }, today)).toBe('last-month')
    expect(presetOf({ ...NO_FILTERS, from: '2026-10-01', to: '2026-10-30' }, today)).toBe('last-30')
    expect(presetOf({ ...NO_FILTERS, from: '2026-10-05', to: '2026-10-12' }, today)).toBeNull()
    expect(presetOf({ ...NO_FILTERS, from: '2026-10-05' }, today)).toBeNull()
  })
})

describe('describeRange', () => {
  it('names a whole month by its name', () => {
    expect(describeRange('2026-10-01', '2026-10-31', today)).toBe('October 2026')
  })

  it('says Today and Yesterday for a single day, and the date for any other single day', () => {
    expect(describeRange('2026-10-30', '2026-10-30', today)).toBe('Today')
    expect(describeRange('2026-10-29', '2026-10-29', today)).toBe('Yesterday')
    expect(describeRange('2026-10-05', '2026-10-05', today)).toMatch(/^(5 Oct|Oct 5)$/)
  })

  it('says Last 7 days for the week that ends today', () => {
    expect(describeRange('2026-10-24', '2026-10-30', today)).toBe('Last 7 days')
    expect(describeRange('2026-10-24', '2026-10-29', today)).not.toBe('Last 7 days') // ends yesterday: just dates
  })

  it('shows both ends of any other range, and one end when only one is set', () => {
    expect(describeRange('2026-10-05', '2026-10-12', today)).toMatch(/(5 Oct|Oct 5).*(12 Oct|Oct 12)/)
    expect(describeRange('2026-10-05', '', today)).toMatch(/^From (5 Oct|Oct 5)$/)
    expect(describeRange('', '2026-10-12', today)).toMatch(/^Until (12 Oct|Oct 12)$/)
  })
})

describe('matchesSearch', () => {
  const text = 'big basket weekly shop groceries main upi 1250.5'

  it('needs every word, in any order, not the whole phrase in a row', () => {
    expect(matchesSearch(text, 'groceries basket')).toBe(true)
    expect(matchesSearch(text, 'basket   upi')).toBe(true)
    expect(matchesSearch(text, 'basket pizza')).toBe(false)
  })

  it('is not bothered by case or spacing, and an empty search matches everything', () => {
    expect(matchesSearch(text, '  BASKET ')).toBe(true)
    expect(matchesSearch(text, '')).toBe(true)
    expect(matchesSearch(text, '   ')).toBe(true)
  })

  it('finds an amount', () => {
    expect(matchesSearch(text, '1250.5')).toBe(true)
  })
})

describe('dayTotals', () => {
  const t = (date: string, kind: Transaction['kind'], amountMinor: number) => ({ date, kind, amountMinor }) as Transaction

  it('adds up each whole day, spent and received apart, with transfers in neither', () => {
    const totals = dayTotals([t('2026-10-05', 'expense', 100), t('2026-10-05', 'expense', 250), t('2026-10-05', 'income', 900), t('2026-10-05', 'transfer', 5000), t('2026-10-04', 'expense', 70)])
    expect(totals.get('2026-10-05')).toEqual({ spentMinor: 350, receivedMinor: 900 })
    expect(totals.get('2026-10-04')).toEqual({ spentMinor: 70, receivedMinor: 0 })
  })
})

describe('newestFirst with equal times', () => {
  it('puts the later entry first, so a batch typed in one go keeps its order', () => {
    const rows = [
      { id: 1, date: '2026-10-05', createdAt: 100 },
      { id: 2, date: '2026-10-05', createdAt: 100 },
      { id: 3, date: '2026-10-05', createdAt: 100 },
    ] as Transaction[]
    expect([...rows].sort(newestFirst).map((r) => r.id)).toEqual([3, 2, 1])
  })
})
