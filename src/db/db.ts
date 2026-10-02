import Dexie, { type EntityTable } from 'dexie'
import type { Category, Settings, Tag } from '../domain/types'

/** Settings live in a single row with this key. */
export const SETTINGS_KEY = 'app'
export type SettingsRow = Settings & { key: typeof SETTINGS_KEY }

/** Everything is stored in the browser's IndexedDB. Nothing leaves the device. */
export class PulseDB extends Dexie {
  categories!: EntityTable<Category, 'id'>
  tags!: EntityTable<Tag, 'id'>
  settings!: EntityTable<SettingsRow, 'key'>

  constructor(name = 'pulse') {
    super(name)
    this.version(1).stores({
      categories: 'id, block, parentId',
      tags: 'id, &name',
      settings: 'key',
    })
  }
}

export const db = new PulseDB()
