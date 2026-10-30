import { afterEach, describe, expect, it } from 'vitest'
import { formatMoney, formatMoneyCompact, localDateString, setNumberFormat, setPrivacyMode, toMinor } from './money'

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

describe('formatMoney', () => {
  afterEach(() => {
    setPrivacyMode(false)
    setNumberFormat('auto')
  })

  it('drops decimals for whole amounts and keeps two otherwise', () => {
    setNumberFormat('international')
    expect(formatMoney(45000, 'USD')).toBe('$450')
    expect(formatMoney(45050, 'USD')).toBe('$450.50')
  })

  it('groups digits the Indian way or the international way, as chosen', () => {
    setNumberFormat('indian')
    expect(formatMoney(12_345_600, 'INR')).toBe('₹1,23,456')
    setNumberFormat('international')
    expect(formatMoney(12_345_600, 'INR')).toBe('₹123,456')
  })

  it('hides every amount behind a fixed mask in privacy mode, and restores them after', () => {
    setNumberFormat('international')
    setPrivacyMode(true)
    expect(formatMoney(12_345_600, 'INR')).toBe('₹••••')
    expect(formatMoney(5, 'INR')).toBe('₹••••') // same mask: the length gives nothing away
    expect(formatMoneyCompact(12_345_600, 'INR')).toBe('₹••')
    expect(formatMoney(12_345_600, 'INR')).not.toMatch(/\d/)
    setPrivacyMode(false)
    expect(formatMoney(45000, 'INR')).toBe('₹450')
  })
})
