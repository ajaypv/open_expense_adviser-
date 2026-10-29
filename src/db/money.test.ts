import { describe, expect, it } from 'vitest'
import { localDateString, toMinor } from './money'

describe('toMinor', () => {
  it('converts decimals to integer minor units without float drift', () => {
    expect(toMinor(450)).toBe(45000)
    expect(toMinor(0.1 + 0.2)).toBe(30)
    expect(toMinor(19.99)).toBe(1999)
    expect(toMinor(1.005)).toBe(101)
  })
})

describe('localDateString', () => {
  it('uses local calendar fields, zero-padded', () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(localDateString(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31')
  })
})
