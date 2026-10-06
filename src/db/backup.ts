import { db as defaultDb, type PulseDB } from './db'

/** The tables a backup holds, in the order they are restored. */
const TABLES = ['settings', 'categories', 'tags', 'budgetCells', 'transactions', 'pockets', 'skippedImports', 'skippedRecurring', 'imports', 'merchantRules', 'labEntries', 'labNotes', 'wishItems', 'wishCategories'] as const
type TableName = (typeof TABLES)[number]

export interface Backup {
  app: 'pulse'
  /** Bumped when the file layout changes, so older files can still be read. */
  format: 1
  exportedAt: string
  tables: Record<TableName, unknown[]>
}

/** Everything Pulse stores, as one object that can be saved to a file. */
export async function createBackup(db: PulseDB = defaultDb): Promise<Backup> {
  return db.transaction('r', TABLES.map((t) => db.table(t)), async () => {
    const tables = {} as Backup['tables']
    for (const name of TABLES) tables[name] = await db.table(name).toArray()
    return { app: 'pulse', format: 1, exportedAt: new Date().toISOString(), tables }
  })
}

/** Reads a backup file's text, or explains why it can't be used. */
export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('This file is not a Pulse backup.')
  }
  const backup = data as Partial<Backup> | null
  if (!backup || backup.app !== 'pulse' || typeof backup.tables !== 'object' || backup.tables === null) {
    throw new Error('This file is not a Pulse backup.')
  }
  if (backup.format !== 1) throw new Error('This backup was made by a newer version of Pulse.')
  for (const name of TABLES) {
    const rows = (backup.tables as Partial<Record<TableName, unknown>>)[name]
    // Tables added after the backup was made are simply empty.
    if (rows !== undefined && !Array.isArray(rows)) throw new Error('This backup file is damaged.')
  }
  return backup as Backup
}

/** Replaces everything stored with the backup's contents. */
export async function restoreBackup(backup: Backup, db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const name of TABLES) {
      const table = db.table(name)
      await table.clear()
      let rows = backup.tables[name] ?? []
      // Backups from before plug-ins: the Playground was always there, so keep it on.
      if (name === 'settings') rows = rows.map((r) => ({ pluginPlayground: true, ...(r as object) }))
      await table.bulkAdd(rows)
    }
  })
}

/** "pulse-backup-2026-10-04.json" */
export function backupFileName(date = new Date()): string {
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return `pulse-backup-${iso}.json`
}
