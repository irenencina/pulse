import { combineEntries, labEntryId, weekStartOf, type LabEntry } from '../domain/lab'
import { getSettings, updateSettings } from './actions'
import { db as defaultDb, type PulseDB } from './db'

/** Sets or (null) clears one pretend amount. */
export async function setLabEntry(
  categoryId: string,
  week: string,
  value: { cents: number; formula?: string } | null,
  db: PulseDB = defaultDb,
): Promise<void> {
  const id = labEntryId(categoryId, week)
  if (value === null) await db.labEntries.delete(id)
  else await db.labEntries.put({ id, categoryId, week, cents: value.cents, ...(value.formula ? { formula: value.formula } : {}) })
}

/**
 * Moves (or copies) a pretend amount to another cell. Dropped on a cell that already holds
 * something, the two are added up, so nothing is lost.
 */
export async function moveLabEntry(
  fromId: string,
  to: { categoryId: string; week: string },
  copy = false,
  db: PulseDB = defaultDb,
): Promise<void> {
  const toId = labEntryId(to.categoryId, to.week)
  if (fromId === toId) return
  await db.transaction('rw', db.labEntries, async () => {
    const source = await db.labEntries.get(fromId)
    if (!source) return
    const target = await db.labEntries.get(toId)
    const value = target ? combineEntries(target, source) : { cents: source.cents, formula: source.formula }
    const entry: LabEntry = { id: toId, ...to, cents: value.cents, ...(value.formula ? { formula: value.formula } : {}) }
    await db.labEntries.put(entry)
    if (!copy) await db.labEntries.delete(fromId)
  })
}

export async function setLabNote(week: string, text: string, db: PulseDB = defaultDb): Promise<void> {
  const clean = text.trim()
  if (clean) await db.labNotes.put({ week, text: clean })
  else await db.labNotes.delete(week)
}

/** Clears every pretend amount and note. */
export async function clearLab(db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.labEntries, db.labNotes, async () => {
    await db.labEntries.clear()
    await db.labNotes.clear()
  })
}

/**
 * Changes the day weeks start on. Every pretend amount and note moves to the new week that
 * holds its old week's first day, so nothing is lost or doubled.
 */
export async function setLabWeekStart(day: number, db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.labEntries, db.labNotes, db.settings], async () => {
    const settings = await getSettings(db)
    if (settings.labWeekStart === day) return
    const entries = await db.labEntries.toArray()
    const notes = await db.labNotes.toArray()
    await db.labEntries.clear()
    await db.labNotes.clear()
    await db.labEntries.bulkPut(
      entries.map((e) => {
        const week = weekStartOf(e.week, day)
        return { ...e, week, id: labEntryId(e.categoryId, week) }
      }),
    )
    await db.labNotes.bulkPut(notes.map((n) => ({ ...n, week: weekStartOf(n.week, day) })))
    await updateSettings({ labWeekStart: day, labFirstWeek: settings.labFirstWeek && weekStartOf(settings.labFirstWeek, day) }, db)
  })
}
