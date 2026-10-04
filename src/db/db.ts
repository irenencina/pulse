import Dexie, { type EntityTable } from 'dexie'
import type { BudgetCell } from '../domain/budget'
import type { Transaction } from '../domain/transactions'
import type { Category, Settings, Tag } from '../domain/types'

/** Settings live in a single row with this key. */
export const SETTINGS_KEY = 'app'
export type SettingsRow = Settings & { key: typeof SETTINGS_KEY }

/** Everything is stored in the browser's IndexedDB. Nothing leaves the device. */
export class PulseDB extends Dexie {
  categories!: EntityTable<Category, 'id'>
  tags!: EntityTable<Tag, 'id'>
  settings!: EntityTable<SettingsRow, 'key'>
  budgetCells!: EntityTable<BudgetCell, 'id'>
  transactions!: EntityTable<Transaction, 'id'>

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
  }
}

export const db = new PulseDB()
