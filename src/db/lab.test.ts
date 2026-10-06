import { beforeEach, expect, it } from 'vitest'
import { PulseDB } from './db'
import { moveLabEntry, setLabEntry } from './lab'

let db: PulseDB
beforeEach(async () => {
  db = new PulseDB(`lab-${Math.random()}`)
  await db.open()
})

it('moves a pretend amount to another week', async () => {
  await setLabEntry('food', '2026-10-05', { cents: 4000 }, db)
  await moveLabEntry('food|2026-10-05', { categoryId: 'food', week: '2026-10-12' }, false, db)
  expect(await db.labEntries.toArray()).toEqual([{ id: 'food|2026-10-12', categoryId: 'food', week: '2026-10-12', cents: 4000 }])
})

it('adds up when dropped on a filled cell, and copies when asked', async () => {
  await setLabEntry('food', '2026-10-05', { cents: 4000 }, db)
  await setLabEntry('food', '2026-10-12', { cents: 3500, formula: '30+5' }, db)
  await moveLabEntry('food|2026-10-05', { categoryId: 'food', week: '2026-10-12' }, true, db)
  expect(await db.labEntries.get('food|2026-10-12')).toMatchObject({ cents: 7500, formula: '30+5+40' })
  expect(await db.labEntries.get('food|2026-10-05')).toBeDefined()
})

it('moves everything along when the week starts on another day', async () => {
  const { ensureInitialised, getSettings, updateSettings } = await import('./actions')
  const { setLabWeekStart, setLabNote } = await import('./lab')
  await ensureInitialised(db)
  await updateSettings({ labFirstWeek: '2026-10-05' }, db)
  await setLabEntry('food', '2026-10-05', { cents: 4000 }, db)
  await setLabNote('2026-10-12', 'Paris', db)
  // Monday 5 October lies in the week from Sunday 4 October.
  await setLabWeekStart(0, db)
  expect((await db.labEntries.toArray()).map((e) => e.id)).toEqual(['food|2026-10-04'])
  expect(await db.labNotes.toArray()).toEqual([{ week: '2026-10-11', text: 'Paris' }])
  expect(await getSettings(db)).toMatchObject({ labWeekStart: 0, labFirstWeek: '2026-10-04' })
})
