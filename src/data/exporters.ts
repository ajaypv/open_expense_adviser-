import type { Account, Budget, Category, Goal, Recurring, Transaction } from '../db/schema'

/**
 * One CSV cell. Quotes values with commas, quotes or newlines, and neutralises spreadsheet
 * formulas (a leading = + - @ would otherwise run when the file is opened in Excel or Sheets).
 */
export function csvCell(value: string | number): string {
  let s = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

type Row = Transaction & { originalMinor?: number; originalCurrency?: string }

/**
 * Transactions as a spreadsheet. Each row shows what was actually paid, in the currency it was
 * paid in, even when the app converts it for its totals.
 */
export function transactionsToCsv(
  txs: Row[],
  categoryById: Map<number, Category>,
  accountById: Map<number, Account> = new Map(),
): string {
  const header = [
    'date', 'type', 'amount', 'currency', 'category', 'merchant', 'note', 'payment_method', 'source',
    'latitude', 'longitude', 'account', 'to_account',
  ]
  const typeOf = (t: Transaction) => (t.kind === 'income' ? 'received' : t.kind === 'transfer' ? 'transfer' : 'sent')
  const rows = [...txs]
    .filter((t) => t.deletedAt === undefined)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))
    .map((t) =>
      [
        t.date,
        typeOf(t),
        ((t.originalMinor ?? t.amountMinor) / 100).toFixed(2),
        t.originalCurrency ?? t.currency,
        categoryById.get(t.categoryId)?.name ?? '',
        t.merchant,
        t.note,
        t.paymentMethod,
        t.source,
        t.location?.lat ?? '',
        t.location?.lon ?? '',
        t.accountId !== undefined ? (accountById.get(t.accountId)?.name ?? '') : '',
        t.toAccountId !== undefined ? (accountById.get(t.toAccountId)?.name ?? '') : '',
      ]
        .map(csvCell)
        .join(','),
    )
  return [header.join(','), ...rows].join('\n')
}

/** Version 2 of the backup file. Version 1 files (before accounts) can still be restored. */
export const BACKUP_VERSION = 2

export interface BackupData {
  currency: string
  categories: Category[]
  /** Raw rows as stored (each in its own currency); trashed rows are left out. */
  transactions: Transaction[]
  budgets: Budget[]
  accounts: Account[]
  recurring: Recurring[]
  goals: Goal[]
  rates: Record<string, number>
}

export function backupToJson(data: BackupData): string {
  return JSON.stringify(
    {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      ...data,
      transactions: data.transactions.filter((t) => t.deletedAt === undefined),
    },
    null,
    2,
  )
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

/**
 * Offer a file through the phone's share sheet (Save to Files, Drive, WhatsApp, email…) where the
 * browser supports sharing files, otherwise download it. Returns how it was handled; "cancelled"
 * means the user closed the sheet, so nothing was saved.
 */
export async function shareOrDownload(
  filename: string,
  mime: string,
  content: string,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([content], filename, { type: mime })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // Any other failure: fall through to a plain download so the backup is never lost.
    }
  }
  downloadFile(filename, mime, content)
  return 'downloaded'
}
