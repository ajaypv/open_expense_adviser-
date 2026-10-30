/** Currencies with two decimal places only; amounts are stored as hundredths. */
export const CURRENCIES = [
  'INR', 'USD', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'SGD',
  'CHF', 'NZD', 'HKD', 'CNY', 'SEK', 'NOK', 'DKK', 'ZAR', 'SAR', 'QAR', 'THB', 'MYR', 'PHP', 'BDT', 'LKR', 'NPR',
]

let names: Intl.DisplayNames | undefined

/** "US Dollar" for "USD"; the code itself when the device has no name for it. */
function currencyName(code: string): string | undefined {
  try {
    names ??= new Intl.DisplayNames(undefined, { type: 'currency' })
    const name = names.of(code)
    return name && name !== code ? name : undefined
  } catch {
    return undefined
  }
}

/** Currencies as choices for a picker: the code, with its name beneath. */
export const currencyOptions = (codes: string[]) =>
  codes.map((code) => {
    const detail = currencyName(code)
    return { value: code, label: code, ...(detail ? { detail } : {}) }
  })
