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
  /** 'expense' is money sent; 'income' is money received. The amount is always positive. */
  kind: 'expense' | 'income'
  amountMinor: number
  currency: string
  categoryId: number
  merchant: string
  note: string
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  paymentMethod: string
  source: 'manual' | 'chat' | 'import'
  createdAt: number
  /** Only set when the user turned location recording on; never sent anywhere. */
  location?: Place
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

db.on('populate', (tx) => {
  void tx.table('categories').bulkAdd(DEFAULT_CATEGORIES.map((c) => ({ ...c })))
})
