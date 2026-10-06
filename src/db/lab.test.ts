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

it('stretches a note and joins the ones it covers', async () => {
  const { setLabNote, setLabNoteSpan } = await import('./lab')
  const weeks = ['2026-10-05', '2026-10-12', '2026-10-19']
  await setLabNote('2026-10-05', 'Paris', db)
  await setLabNote('2026-10-12', 'museum', db)
  await setLabNoteSpan('2026-10-05', 3, weeks, db)
  expect(await db.labNotes.toArray()).toEqual([{ week: '2026-10-05', text: 'Paris · museum', span: 3 }])
  await setLabNote('2026-10-05', 'Paris trip', db)
  await setLabNoteSpan('2026-10-05', 1, weeks, db)
  expect(await db.labNotes.toArray()).toEqual([{ week: '2026-10-05', text: 'Paris trip' }])
})

it('adds usual payments to the weeks of their day', async () => {
  const { addLabPayments } = await import('./lab')
  await setLabEntry('rent', '2026-10-26', { cents: 1000 }, db)
  const periods = ['2026-09-28', '2026-10-05', '2026-10-26'].map((start) => ({ start, days: 7 }))
  const n = await addLabPayments([{ categoryId: 'rent', cents: 65000, day: 1 }], periods, db)
  expect(n).toBe(2)
  expect(await db.labEntries.get('rent|2026-09-28')).toMatchObject({ cents: 65000 })
  expect(await db.labEntries.get('rent|2026-10-26')).toMatchObject({ cents: 66000, formula: '10+650' })
})

it('moves the start of a note when its left edge is dragged', async () => {
  const { setLabNote, setLabNoteRange } = await import('./lab')
  const weeks = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']
  await setLabNote('2026-10-05', 'exams', db)
  await setLabNote('2026-10-19', 'Paris', db)
  // Paris now also covers the two weeks before it, taking in "exams".
  await setLabNoteRange('2026-10-19', '2026-10-05', 3, weeks, db)
  expect(await db.labNotes.toArray()).toEqual([{ week: '2026-10-05', text: 'Paris · exams', span: 3 }])
  // And back: only the last week.
  await setLabNoteRange('2026-10-05', '2026-10-19', 1, weeks, db)
  expect(await db.labNotes.toArray()).toEqual([{ week: '2026-10-19', text: 'Paris · exams' }])
})

it('moves amounts into the new columns, adding up what lands together', async () => {
  const { ensureInitialised, getSettings, updateSettings } = await import('./actions')
  const { updateLabLayout } = await import('./lab')
  await ensureInitialised(db)
  await updateSettings({ labFirstWeek: '2026-10-05' }, db)
  await setLabEntry('food', '2026-10-05', { cents: 4000 }, db)
  await setLabEntry('food', '2026-10-12', { cents: 3000 }, db)
  await setLabEntry('food', '2026-10-19', { cents: 1000 }, db)
  await updateLabLayout({ labColumns: 'fortnight' }, db)
  expect(await db.labEntries.toArray()).toEqual([
    { id: 'food|2026-10-05', categoryId: 'food', week: '2026-10-05', cents: 7000, formula: '40+30' },
    { id: 'food|2026-10-19', categoryId: 'food', week: '2026-10-19', cents: 1000 },
  ])
  expect(await getSettings(db)).toMatchObject({ labColumns: 'fortnight', labWeeks: 6 })
})
