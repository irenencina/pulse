import { beforeEach, expect, it } from 'vitest'
import { addTransaction, ensureInitialised, getSettings, updateSettings } from './actions'
import { backupFileName, createBackup, parseBackup, restoreBackup } from './backup'
import { PulseDB } from './db'

let n = 0
let db: PulseDB
beforeEach(async () => {
  db = new PulseDB(`backup-${n++}`)
  await ensureInitialised(db)
})

it('saves everything and puts it back', async () => {
  const category = (await db.categories.toArray())[0]!
  await addTransaction({ date: '2026-09-01', block: category.block, categoryId: category.id, cents: 500, details: 'x', tags: '#a' }, db)
  await updateSettings({ lateIncomeDay: 25 }, db)
  await db.pockets.put({ name: 'Bills', categoryIds: [category.id] })
  const text = JSON.stringify(await createBackup(db))

  const other = new PulseDB(`backup-${n++}`)
  await ensureInitialised(other)
  await other.categories.add({ ...category, id: 'stray', name: 'Gone after restore' })
  await restoreBackup(parseBackup(text), other)

  expect(await other.categories.get('stray')).toBeUndefined()
  expect(await other.categories.count()).toBe(await db.categories.count())
  expect(await other.transactions.count()).toBe(1)
  expect(await other.tags.count()).toBe(1)
  expect(await other.pockets.get('Bills')).toEqual({ name: 'Bills', categoryIds: [category.id] })
  expect((await getSettings(other)).lateIncomeDay).toBe(25)
})

it('refuses files that are not a backup', () => {
  expect(() => parseBackup('hello')).toThrow(/not a Pulse backup/)
  expect(() => parseBackup('{"app":"other"}')).toThrow(/not a Pulse backup/)
  expect(() => parseBackup('{"app":"pulse","format":2,"tables":{}}')).toThrow(/newer version/)
  expect(() => parseBackup('{"app":"pulse","format":1,"tables":{"categories":5}}')).toThrow(/damaged/)
})

it('reads backups that miss tables added later', async () => {
  await restoreBackup(parseBackup('{"app":"pulse","format":1,"exportedAt":"","tables":{"categories":[]}}'), db)
  expect(await db.categories.count()).toBe(0)
})

it('names the file after the day', () => {
  expect(backupFileName(new Date(2026, 9, 4))).toBe('pulse-backup-2026-10-04.json')
})
