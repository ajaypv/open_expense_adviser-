import type { Budget, Category, Transaction } from '../db/schema'

/**
 * One CSV cell. Quotes values with commas, quotes or newlines, and neutralises spreadsheet
 * formulas (a leading = + - @ would otherwise run when the file is opened in Excel or Sheets).
 */
export function csvCell(value: string | number): string {
  let s = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function transactionsToCsv(txs: Transaction[], categoryById: Map<number, Category>): string {
  const header = ['date', 'type', 'amount', 'currency', 'category', 'merchant', 'note', 'payment_method', 'source', 'latitude', 'longitude']
  const rows = [...txs]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((t) =>
      [
        t.date,
        t.kind === 'income' ? 'received' : 'sent',
        (t.amountMinor / 100).toFixed(2),
        t.currency,
        categoryById.get(t.categoryId)?.name ?? '',
        t.merchant,
        t.note,
        t.paymentMethod,
        t.source,
        t.location?.lat ?? '',
        t.location?.lon ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  return [header.join(','), ...rows].join('\n')
}

export function backupToJson(data: {
  currency: string
  categories: Category[]
  transactions: Transaction[]
  budgets: Budget[]
  /** The balance before any logged transaction, or null if the user never set one. */
  openingBalanceMinor: number | null
}): string {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2)
}

export function downloadFile(filename: string, mime: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
