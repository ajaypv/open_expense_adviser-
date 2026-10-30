/** Convert a user-entered decimal amount (e.g. 450.5) to integer minor units. */
export function toMinor(amount: number): number {
  // toPrecision(15) strips float noise (1.005 * 100 = 100.49999999999999) before rounding.
  return Math.round(Number((amount * 100).toPrecision(15)))
}

/** How numbers are grouped: the device default, lakh/crore style (1,00,000), or thousands (100,000). */
export type NumberFormat = 'auto' | 'indian' | 'international'

const LOCALES: Record<NumberFormat, string | undefined> = { auto: undefined, indian: 'en-IN', international: 'en-US' }

let locale: string | undefined
let privacy = false
// Intl formatters are slow to build, so each distinct one is made once and reused for every call.
const formatters = new Map<string, Intl.NumberFormat>()

export function setNumberFormat(format: NumberFormat): void {
  locale = LOCALES[format]
  formatters.clear()
}

/** While on, every amount is replaced by a fixed mask (₹••••), so a screen can be shown to others. */
export function setPrivacyMode(on: boolean): void {
  privacy = on
}

function formatter(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const cacheKey = `${key}|${JSON.stringify(options)}`
  let f = formatters.get(cacheKey)
  if (!f) formatters.set(cacheKey, (f = new Intl.NumberFormat(locale, options)))
  return f
}

/** The currency symbol on its own, used to build the privacy mask. */
function symbolOf(currency: string): string {
  const parts = formatter('sym', { style: 'currency', currency }).formatToParts(0)
  return parts.find((p) => p.type === 'currency')?.value ?? currency
}

/** Whole amounts drop the decimals (₹450), fractional ones keep two (₹450.50). */
export function formatMoney(amountMinor: number, currency: string): string {
  if (privacy) return `${symbolOf(currency)}••••`
  const whole = amountMinor % 100 === 0
  return formatter('money', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)
}

/** Compact form for chart labels: ₹2.4K. */
export function formatMoneyCompact(amountMinor: number, currency: string): string {
  if (privacy) return `${symbolOf(currency)}••`
  return formatter('compact', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amountMinor / 100)
}

/** Today's date in the user's local timezone as YYYY-MM-DD (not UTC). */
export function localDateString(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parse a YYYY-MM-DD string as a local date (new Date('2026-10-05') would be UTC). */
export function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}
