import Dexie, { type EntityTable } from 'dexie'
import { DEFAULT_CATEGORIES, INCOME_CATEGORY } from './defaultCategories'

/** Where a transaction was added. Coordinates are rounded to 4 decimals (about 11 m). */
export interface Place {
  lat: number
  lon: number
  /** Accuracy radius reported by the device, in metres. */
  accuracyM: number
}

/** Amounts are stored as integer minor units (e.g. paise/cents) to avoid float drift. */
export interface Transaction {
  id: number
  /**
   * 'expense' is money sent; 'income' is money received; 'transfer' moves money between two of the
   * user's own accounts and counts as neither. The amount is always positive.
   */
  kind: 'expense' | 'income' | 'transfer'
  amountMinor: number
  currency: string
  categoryId: number
  merchant: string
  note: string
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  paymentMethod: string
  source: 'manual' | 'chat' | 'import' | 'recurring'
  createdAt: number
  /** Only set when the user turned location recording on; never sent anywhere. */
  location?: Place
  /** Which account it belongs to (the source of a transfer). Missing means the first account. */
  accountId?: number
  /** The receiving account of a transfer. */
  toAccountId?: number
  /** Set when moved to the trash. Trashed rows stay for 30 days, then are purged. */
  deletedAt?: number
}

/** A place money is kept: cash, a bank account, a card. */
export interface Account {
  id: number
  name: string
  /** What it held before any logged transaction. null until the user says. */
  openingMinor: number | null
  archived?: boolean
}

/** A transaction that repeats, such as rent or a subscription. */
/** What a regular payment is, so a loan EMI and a UPI AutoPay can be told apart and summed up. */
export type RecurringTag = 'loan' | 'autopay' | 'subscription' | 'bill' | 'income' | 'other'

export interface Recurring {
  id: number
  kind: 'expense' | 'income'
  amountMinor: number
  currency: string
  categoryId: number
  merchant: string
  note: string
  paymentMethod: string
  accountId?: number
  frequency: 'weekly' | 'monthly'
  /** Date (YYYY-MM-DD) the next occurrence is due. */
  nextDue: string
  /**
   * The day of the month a monthly rule keeps to. A rule for the 31st moves to the 28th in February but
   * comes back to the 31st in March; without this it would stay on the 28th for good. Rules made before
   * this existed take the day from their due date.
   */
  anchorDay?: number
  /** The kind of payment. Rules made before this existed have none. */
  tag?: RecurringTag
  active: boolean
}

/**
 * Something the user is saving for: a purchase or an event. The saved amount is tracked here by hand
 * and is separate from transactions, so setting money aside never changes a balance or a total.
 */
export interface Goal {
  id: number
  name: string
  /** What it costs, in the main currency. */
  targetMinor: number
  /** Set aside so far. */
  savedMinor: number
  /** Optional date (YYYY-MM-DD) to have it by. */
  dueDate?: string
  createdAt: number
}

export interface Category {
  id: number
  name: string
  color: string
}

export interface Budget {
  id: number
  /** null = overall monthly budget. */
  categoryId: number | null
  monthlyLimitMinor: number
  currency: string
}

export interface Setting {
  key: string
  value: unknown
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export const db = new Dexie('expense-tracker') as Dexie & {
  transactions: EntityTable<Transaction, 'id'>
  categories: EntityTable<Category, 'id'>
  budgets: EntityTable<Budget, 'id'>
  settings: EntityTable<Setting, 'key'>
  chat: EntityTable<ChatMessage, 'id'>
  accounts: EntityTable<Account, 'id'>
  recurring: EntityTable<Recurring, 'id'>
  goals: EntityTable<Goal, 'id'>
}

db.version(1).stores({
  transactions: '++id, date, categoryId, merchant, createdAt',
  categories: '++id, &name',
  budgets: '++id, categoryId',
  settings: 'key',
  chat: '++id, createdAt',
})

// v2: categories are capped at the 8-hue palette plus a gray "Other", with theme-aware colors.
// Existing v1 databases are migrated in place so no transaction loses its category.
db.version(2)
  .stores({})
  .upgrade(async (tx) => {
    const cats = tx.table('categories')
    const txns = tx.table('transactions')
    await cats.where('name').equals('Rent').modify({ name: 'Rent & Housing' })
    await cats.where('name').equals('Entertainment').modify({ name: 'Entertainment & Travel' })
    const travel = await cats.where('name').equals('Travel').first()
    const fun = await cats.where('name').equals('Entertainment & Travel').first()
    if (travel && fun) {
      await txns.where('categoryId').equals(travel.id).modify({ categoryId: fun.id })
      await cats.delete(travel.id)
    }
    for (const c of DEFAULT_CATEGORIES) {
      await cats.where('name').equals(c.name).modify({ color: c.color })
    }
  })

// v3: money received. Every existing transaction is an expense, and the "Income" category is added.
db.version(3)
  .stores({})
  .upgrade(async (tx) => {
    await tx
      .table('transactions')
      .toCollection()
      .modify((t: { kind?: string }) => {
        if (!t.kind) t.kind = 'expense'
      })
    const cats = tx.table('categories')
    if (!(await cats.where('name').equals(INCOME_CATEGORY).first())) {
      await cats.add({ name: INCOME_CATEGORY, color: 'var(--ink-2)' })
    }
  })

// v4: accounts, recurring transactions, trash and transfers. The old single "opening balance"
// becomes the opening balance of a first account, so no existing estimate changes.
db.version(4)
  .stores({ accounts: '++id', recurring: '++id, nextDue' })
  .upgrade(async (tx) => {
    const settings = tx.table('settings')
    const opening = (await settings.get('openingBalance'))?.value
    await tx.table('accounts').add({ name: 'Main', openingMinor: typeof opening === 'number' ? opening : null })
    await settings.delete('openingBalance')
  })

// v5: goals. A new table only, so nothing existing needs migrating.
db.version(5).stores({ goals: '++id' })

db.on('populate', (tx) => {
  void tx.table('categories').bulkAdd(DEFAULT_CATEGORIES.map((c) => ({ ...c })))
  void tx.table('accounts').add({ name: 'Main', openingMinor: null })
})
