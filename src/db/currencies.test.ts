import { describe, expect, it } from 'vitest'
import { CURRENCIES, currencyOptions } from './currencies'

describe('CURRENCIES', () => {
  it('lists each currency once, with the main ones first', () => {
    expect(new Set(CURRENCIES).size).toBe(CURRENCIES.length)
    expect(CURRENCIES.slice(0, 4)).toEqual(['INR', 'USD', 'EUR', 'GBP'])
  })

  it('only has currencies with two decimal places, because amounts are stored in hundredths', () => {
    for (const code of CURRENCIES) {
      const digits = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits
      expect(digits, code).toBe(2)
    }
  })
})

describe('currencyOptions', () => {
  it('pairs each code with its name', () => {
    expect(currencyOptions(['USD', 'INR'])).toEqual([
      { value: 'USD', label: 'USD', detail: 'US Dollar' },
      { value: 'INR', label: 'INR', detail: 'Indian Rupee' },
    ])
  })

  it('still lists a code it has no name for', () => {
    expect(currencyOptions(['XXX'])[0]).toMatchObject({ value: 'XXX', label: 'XXX' })
  })
})
