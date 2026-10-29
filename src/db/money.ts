/** Convert a user-entered decimal amount (e.g. 450.5) to integer minor units. */
export function toMinor(amount: number): number {
  // toPrecision(15) strips float noise (1.005 * 100 = 100.49999999999999) before rounding.
  return Math.round(Number((amount * 100).toPrecision(15)))
}

/** Whole amounts drop the decimals (₹450), fractional ones keep two (₹450.50). */
export function formatMoney(amountMinor: number, currency: string): string {
  const whole = amountMinor % 100 === 0
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)
}

/** Compact form for chart labels: ₹2.4K. */
export function formatMoneyCompact(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
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
