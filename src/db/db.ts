import Dexie, { type EntityTable } from 'dexie'
import type { BudgetCell } from '../domain/budget'
import type { MerchantRule, Pocket, Transaction } from '../domain/transactions'
import type { Category, Settings, Tag } from '../domain/types'

/** Settings live in a single row with this key. */
export const SETTINGS_KEY = 'app'
export type SettingsRow = Settings & { key: typeof SETTINGS_KEY }
export interface SkippedImport {
  importKey: string
  /** merchantKey of the description, so the same merchant starts unticked next time. */
  merchant: string
}

/** One bank statement import, so it can be undone in one go. */
export interface ImportRecord {
  id: string
  fileName: string
  at: number
  count: number
  /** Transactions typed in by hand that this import replaced, put back if it is undone. */
  replaced: Transaction[]
}

/** Everything is stored in the browser's IndexedDB. Nothing leaves the device. */
export class PulseDB extends Dexie {
  categories!: EntityTable<Category, 'id'>
  tags!: EntityTable<Tag, 'id'>
  settings!: EntityTable<SettingsRow, 'key'>
  budgetCells!: EntityTable<BudgetCell, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  pockets!: EntityTable<Pocket, 'name'>
  /** Bank rows left out of an import on purpose, so they aren't offered again. */
  skippedImports!: EntityTable<SkippedImport, 'importKey'>
  /** Expected monthly payments skipped for one month ("<recurring key>|<month>"). */
  skippedRecurring!: EntityTable<{ id: string }, 'id'>
  imports!: EntityTable<ImportRecord, 'id'>
  merchantRules!: EntityTable<MerchantRule, 'merchant'>

  constructor(name = 'pulse') {
    super(name)
    this.version(1).stores({
      categories: 'id, block, parentId',
      tags: 'id, &name',
      settings: 'key',
    })
    this.version(2).stores({
      budgetCells: 'id, categoryId, month',
    })
    this.version(3).stores({
      transactions: 'id, date, categoryId, importKey, *tagIds',
    })
    this.version(4).stores({
      pockets: 'name',
      skippedImports: 'importKey, merchant',
    })
    this.version(5).stores({
      skippedRecurring: 'id',
    })
    this.version(6).stores({
      transactions: 'id, date, categoryId, importKey, *tagIds, importId',
      imports: 'id, at',
      merchantRules: 'merchant',
    })
  }
}

export const db = new PulseDB()
