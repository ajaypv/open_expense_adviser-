import { db } from '../db/schema'
import { localDateString } from '../db/money'
import { markBackedUp } from './backupState'
import { backupToJson, shareOrDownload, type BackupData } from './exporters'

/** Everything as stored, each transaction in its own currency. */
export async function snapshot(): Promise<BackupData> {
  const [transactions, categories, budgets, accounts, recurring, goals, currency, rates] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
    db.budgets.toArray(),
    db.accounts.toArray(),
    db.recurring.toArray(),
    db.goals.toArray(),
    db.settings.get('currency'),
    db.settings.get('rates'),
  ])
  return {
    currency: typeof currency?.value === 'string' ? currency.value : 'INR',
    categories,
    transactions,
    budgets,
    accounts,
    recurring,
    goals,
    rates: (rates?.value ?? {}) as Record<string, number>,
  }
}

/**
 * Make a backup and hand it to the share sheet (or download it). The "last backup" date only moves
 * if the file was really saved, not if the user closed the sheet.
 */
export async function backUpNow(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const result = await shareOrDownload(`expenses-backup-${localDateString()}.json`, 'application/json', backupToJson(await snapshot()))
  if (result !== 'cancelled') await markBackedUp()
  return result
}
