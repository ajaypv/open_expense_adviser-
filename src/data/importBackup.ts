import { z } from 'zod'
import { isRealDate, isValidCurrency, MAX_AMOUNT_MINOR } from '../db/money'
import { db, type Recurring, type Transaction } from '../db/schema'

const place = z.object({ lat: z.number(), lon: z.number(), accuracyM: z.number() })

// Damaged or hand-edited files are checked here, so nothing in them can break the app once restored.
const currencyCode = z.string().refine(isValidCurrency, 'not a currency code')
const day = z.string().refine(isRealDate, 'not a real date')
const amount = z.number().int().positive().max(MAX_AMOUNT_MINOR)
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|var\(--[\w-]+\))$/

const txSchema = z.object({
  kind: z.enum(['expense', 'income', 'transfer']).default('expense'),
  amountMinor: amount,
  currency: currencyCode.default('INR'),
  categoryId: z.number().int().optional(),
  merchant: z.string().default(''),
  note: z.string().default(''),
  date: day,
  paymentMethod: z.string().default(''),
  createdAt: z.number().optional(),
  location: place.optional(),
  accountId: z.number().int().optional(),
  toAccountId: z.number().int().optional(),
})

const recurringSchema = z.object({
  kind: z.enum(['expense', 'income']),
  amountMinor: amount,
  currency: currencyCode.default('INR'),
  categoryId: z.number().int().optional(),
  merchant: z.string().default(''),
  note: z.string().default(''),
  paymentMethod: z.string().default(''),
  accountId: z.number().int().optional(),
  frequency: z.enum(['weekly', 'monthly']),
  nextDue: day,
  anchorDay: z.number().int().min(1).max(31).optional(),
  active: z.boolean().default(true),
})

const goalSchema = z.object({
  name: z.string().min(1),
  targetMinor: amount,
  savedMinor: z.number().int().min(0).max(MAX_AMOUNT_MINOR).default(0),
  dueDate: day.optional(),
  createdAt: z.number().optional(),
})

const backupSchema = z.object({
  version: z.number().int().min(1),
  currency: currencyCode.optional(),
  categories: z
    .array(
      z.object({
        id: z.number().int(),
        name: z.string().min(1),
        color: z
          .string()
          .default('var(--other)')
          .transform((c) => (SAFE_COLOR.test(c) ? c : 'var(--other)')),
      }),
    )
    .default([]),
  transactions: z.array(txSchema),
  budgets: z
    .array(z.object({ categoryId: z.number().int().nullable(), monthlyLimitMinor: amount, currency: currencyCode.default('INR') }))
    .default([]),
  accounts: z
    .array(z.object({ id: z.number().int(), name: z.string().min(1), openingMinor: z.number().int().nullable().default(null), archived: z.boolean().optional() }))
    .default([]),
  recurring: z.array(recurringSchema).default([]),
  /** Added after version 2 shipped; older files simply have none. */
  goals: z.array(goalSchema).default([]),
  rates: z.record(currencyCode, z.number().positive().max(1_000_000)).default({}),
  /** Version 1 files kept one balance for everything. */
  openingBalanceMinor: z.number().int().nullable().optional(),
})

export type Backup = z.infer<typeof backupSchema>

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string }

/** Read and check a backup file's text. Never throws; says what is wrong in plain words. */
export function parseBackup(text: string): ParseResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file isn’t a backup. It couldn’t be read as JSON.' }
  }
  const result = backupSchema.safeParse(json)
  if (!result.success) {
    const where = result.error.issues[0]?.path.join('.') || 'file'
    return { ok: false, error: `That backup can’t be used. Something is wrong at “${where}”.` }
  }
  if (result.data.version > 2) {
    return { ok: false, error: 'This backup was made by a newer version of the app. Update the app, then try again.' }
  }
  return { ok: true, backup: result.data }
}

/** Two entries are the same transaction when these all match, so restoring twice adds nothing. */
const fingerprint = (t: { createdAt?: number; date: string; kind: string; amountMinor: number; merchant: string }) =>
  `${t.createdAt ?? ''}|${t.date}|${t.kind}|${t.amountMinor}|${t.merchant.trim().toLowerCase()}`

/** Without an entry time two identical lines are two real purchases (two ₹50 teas), so they are counted. */
const looseKey = (t: { date: string; kind: string; amountMinor: number; merchant: string }) =>
  `${t.date}|${t.kind}|${t.amountMinor}|${t.merchant.trim().toLowerCase()}`

interface Plan {
  /** Lines in the file that are not here yet. */
  toAdd: number[]
  /** Trashed rows the file brings back. */
  toRevive: number[]
}

/** Which lines of the file would be added, and which trashed rows they would bring back. */
function plan(rows: Transaction[], lines: Backup['transactions']): Plan {
  const live = rows.filter((r) => r.deletedAt === undefined)
  const liveFingerprints = new Set(live.map(fingerprint))
  const liveCounts = new Map<string, number>()
  for (const r of live) liveCounts.set(looseKey(r), (liveCounts.get(looseKey(r)) ?? 0) + 1)
  const trashed = new Map<string, number[]>()
  for (const r of rows) if (r.deletedAt !== undefined) trashed.set(fingerprint(r), [...(trashed.get(fingerprint(r)) ?? []), r.id])

  const seen = new Set<string>()
  const used = new Map<string, number>()
  const toAdd: number[] = []
  const toRevive: number[] = []
  lines.forEach((t, i) => {
    if (t.createdAt === undefined) {
      const key = looseKey(t)
      const n = (used.get(key) ?? 0) + 1
      used.set(key, n)
      if (n > (liveCounts.get(key) ?? 0)) toAdd.push(i)
      return
    }
    const fp = fingerprint(t)
    if (liveFingerprints.has(fp) || seen.has(fp)) return
    seen.add(fp)
    const dead = trashed.get(fp)
    if (dead?.length) toRevive.push(dead.shift()!)
    else toAdd.push(i)
  })
  return { toAdd, toRevive }
}

export interface ImportSummary {
  total: number
  /** Transactions in the file that are not already here. */
  newCount: number
}

/** What a restore would change, shown to the user before they choose. */
export async function summarizeImport(backup: Backup): Promise<ImportSummary> {
  const { toAdd, toRevive } = plan(await db.transactions.toArray(), backup.transactions)
  return { total: backup.transactions.length, newCount: toAdd.length + toRevive.length }
}

export interface ImportResult {
  added: number
  skipped: number
}

/**
 * Restore from a backup. "merge" adds what is missing and leaves everything else alone; "replace"
 * clears transactions, budgets and recurring rules first, so the app matches the file. Categories
 * and accounts are matched by name and created when missing, never deleted.
 */
export async function importBackup(backup: Backup, mode: 'merge' | 'replace'): Promise<ImportResult> {
  const tables = [db.transactions, db.categories, db.accounts, db.budgets, db.recurring, db.goals, db.settings]
  return db.transaction('rw', tables, async () => {
    if (mode === 'replace') {
      await db.transactions.clear()
      await db.budgets.clear()
      await db.recurring.clear()
      await db.goals.clear()
    }

    // Categories by name.
    const localCats = await db.categories.toArray()
    const catId = new Map<number, number>()
    for (const c of backup.categories) {
      const found = localCats.find((l) => l.name.toLowerCase() === c.name.toLowerCase())
      if (found) catId.set(c.id, found.id)
      else {
        const id = (await db.categories.add({ name: c.name, color: c.color } as never)) as number
        localCats.push({ id, name: c.name, color: c.color })
        catId.set(c.id, id)
      }
    }
    const other = localCats.find((c) => c.name === 'Other')?.id ?? localCats[0]?.id ?? 0
    const mapCat = (id: number | undefined) => (id === undefined ? other : (catId.get(id) ?? other))

    // Accounts by name. A version 1 file has none: its single opening balance goes to the first account.
    const localAccounts = await db.accounts.toArray()
    const accId = new Map<number, number>()
    for (const a of backup.accounts) {
      const found = localAccounts.find((l) => l.name.toLowerCase() === a.name.toLowerCase())
      if (found) {
        accId.set(a.id, found.id)
        if (a.openingMinor !== null && (mode === 'replace' || found.openingMinor === null)) {
          await db.accounts.update(found.id, { openingMinor: a.openingMinor })
        }
      } else {
        const id = (await db.accounts.add({ name: a.name, openingMinor: a.openingMinor, archived: a.archived } as never)) as number
        localAccounts.push({ id, name: a.name, openingMinor: a.openingMinor, archived: a.archived })
        accId.set(a.id, id)
      }
    }
    if (backup.accounts.length === 0 && backup.openingBalanceMinor != null) {
      const first = localAccounts[0]
      if (first && (mode === 'replace' || first.openingMinor === null)) {
        await db.accounts.update(first.id, { openingMinor: backup.openingBalanceMinor })
      }
    }
    const mapAcc = (id: number | undefined) => (id === undefined ? undefined : accId.get(id))

    // Transactions, skipping any that are already here.
    const { toAdd, toRevive } = plan(await db.transactions.toArray(), backup.transactions)
    const now = Date.now()
    const fresh: Omit<Transaction, 'id'>[] = []
    for (const id of toRevive) await db.transactions.update(id, { deletedAt: undefined })
    const skipped = backup.transactions.length - toAdd.length - toRevive.length
    toAdd.forEach((i) => {
      const t = backup.transactions[i]
      fresh.push({
        kind: t.kind,
        amountMinor: t.amountMinor,
        currency: t.currency,
        categoryId: mapCat(t.categoryId),
        merchant: t.merchant,
        note: t.note,
        date: t.date,
        paymentMethod: t.paymentMethod,
        source: 'import',
        createdAt: t.createdAt ?? now + i,
        ...(t.location ? { location: t.location } : {}),
        ...(mapAcc(t.accountId) !== undefined ? { accountId: mapAcc(t.accountId) } : {}),
        ...(mapAcc(t.toAccountId) !== undefined ? { toAccountId: mapAcc(t.toAccountId) } : {}),
      })
    })
    await db.transactions.bulkAdd(fresh as Transaction[])

    // Budgets: one per category (or overall); keep what is already set.
    const haveBudget = new Set((await db.budgets.toArray()).map((b) => b.categoryId))
    for (const b of backup.budgets) {
      const categoryId = b.categoryId === null ? null : mapCat(b.categoryId)
      if (haveBudget.has(categoryId)) continue
      haveBudget.add(categoryId)
      await db.budgets.add({ categoryId, monthlyLimitMinor: b.monthlyLimitMinor, currency: b.currency } as never)
    }

    // Recurring rules, skipping any that match one already here.
    const key = (r: { merchant: string; amountMinor: number; frequency: string }) => `${r.merchant.toLowerCase()}|${r.amountMinor}|${r.frequency}`
    const haveRules = new Set((await db.recurring.toArray()).map(key))
    for (const r of backup.recurring) {
      if (haveRules.has(key(r))) continue
      haveRules.add(key(r))
      const rule: Omit<Recurring, 'id'> = { ...r, categoryId: mapCat(r.categoryId), accountId: mapAcc(r.accountId) }
      await db.recurring.add(rule as never)
    }

    // Goals, matched by name and cost; the one already here keeps its saved amount.
    const goalKey = (g: { name: string; targetMinor: number }) => `${g.name.trim().toLowerCase()}|${g.targetMinor}`
    const haveGoals = new Set((await db.goals.toArray()).map(goalKey))
    for (const g of backup.goals) {
      if (haveGoals.has(goalKey(g))) continue
      haveGoals.add(goalKey(g))
      await db.goals.add({ name: g.name.trim(), targetMinor: g.targetMinor, savedMinor: g.savedMinor, ...(g.dueDate ? { dueDate: g.dueDate } : {}), createdAt: g.createdAt ?? now } as never)
    }

    // Settings: a replace takes the file's currency and rates; a merge only fills in missing rates.
    if (mode === 'replace' && backup.currency) await db.settings.put({ key: 'currency', value: backup.currency })
    const currentRates = ((await db.settings.get('rates'))?.value ?? {}) as Record<string, number>
    const rates = mode === 'replace' ? { ...backup.rates } : { ...backup.rates, ...currentRates }
    if (Object.keys(rates).length > 0 || mode === 'replace') await db.settings.put({ key: 'rates', value: rates })

    return { added: fresh.length + toRevive.length, skipped }
  })
}
