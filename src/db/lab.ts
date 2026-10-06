import { combineEntries, labEntryId, localToday, periodStartOf, periodsWithDay, weekStartOf, type LabEntry, type LabNote, type LabPeriod } from '../domain/lab'
import type { Settings } from '../domain/types'
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
  await db.transaction('rw', db.labNotes, async () => {
    const current = await db.labNotes.get(week)
    if (clean) await db.labNotes.put({ ...current, week, text: clean })
    else await db.labNotes.delete(week)
  })
}

/**
 * Stretches a note over `span` weeks from its own (`weeks` are the shown weeks, in order).
 * Notes of the weeks it now covers are joined into it, so their text isn't lost.
 */
export async function setLabNoteSpan(week: string, span: number, weeks: string[], db: PulseDB = defaultDb): Promise<void> {
  await setLabNoteRange(week, week, span, weeks, db)
}

/**
 * Moves a note to start in week `from` and cover `span` weeks, e.g. after dragging its left or
 * right edge. Notes of the other weeks it now covers are joined into it.
 */
export async function setLabNoteRange(week: string, from: string, span: number, weeks: string[], db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.labNotes, async () => {
    const note = await db.labNotes.get(week)
    if (!note) return
    const start = weeks.indexOf(from)
    if (start < 0) return
    const covered = weeks.slice(start, start + Math.max(1, span)).filter((w) => w !== week)
    const swallowed = (await db.labNotes.bulkGet(covered)).filter((n): n is NonNullable<typeof n> => !!n)
    const text = [note.text, ...swallowed.map((n) => n.text)].join(' · ')
    await db.labNotes.bulkDelete([week, ...swallowed.map((n) => n.week)])
    const { span: _, ...rest } = note
    await db.labNotes.put(span > 1 ? { ...rest, week: from, text, span } : { ...rest, week: from, text })
  })
}

/** Puts usual payments into the columns that hold their day of the month, added to what is there. */
export async function addLabPayments(
  payments: Array<{ categoryId: string; cents: number; day: number }>,
  periods: LabPeriod[],
  db: PulseDB = defaultDb,
): Promise<number> {
  let count = 0
  await db.transaction('rw', db.labEntries, async () => {
    for (const p of payments) {
      for (const week of periodsWithDay(periods, p.day)) {
        const id = labEntryId(p.categoryId, week)
        const current = await db.labEntries.get(id)
        const value = current ? combineEntries(current, { cents: p.cents }) : { cents: p.cents }
        await db.labEntries.put({ id, categoryId: p.categoryId, week, cents: value.cents, ...(value.formula ? { formula: value.formula } : {}) })
        count++
      }
    }
  })
  return count
}

/** Clears every pretend amount and note. */
export async function clearLab(db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.labEntries, db.labNotes, async () => {
    await db.labEntries.clear()
    await db.labNotes.clear()
  })
}

/**
 * Changes how the playground's columns are laid out: the day weeks start on, what one column
 * covers, or the first week. Every pretend amount and note moves to the new column that holds
 * its old column's first day; amounts landing in the same cell are added up, notes joined.
 */
export async function updateLabLayout(
  patch: Partial<Pick<Settings, 'labWeekStart' | 'labColumns' | 'labFirstWeek'>>,
  db: PulseDB = defaultDb,
): Promise<void> {
  await db.transaction('rw', [db.labEntries, db.labNotes, db.settings], async () => {
    const settings = { ...(await getSettings(db)), ...patch }
    const firstWeek = settings.labFirstWeek && weekStartOf(settings.labFirstWeek, settings.labWeekStart)
    const anchor = firstWeek ?? weekStartOf(localToday(), settings.labWeekStart)
    const move = (week: string) => periodStartOf(week, settings.labColumns, settings.labWeekStart, anchor)
    const entries = new Map<string, LabEntry>()
    for (const e of await db.labEntries.toArray()) {
      const week = move(e.week)
      const id = labEntryId(e.categoryId, week)
      const there = entries.get(id)
      const value = there ? combineEntries(there, e) : { cents: e.cents, formula: e.formula }
      entries.set(id, { id, categoryId: e.categoryId, week, cents: value.cents, ...(value.formula ? { formula: value.formula } : {}) })
    }
    const notes = new Map<string, LabNote>()
    for (const n of await db.labNotes.toArray()) {
      const week = move(n.week)
      const there = notes.get(week)
      notes.set(week, there ? { ...there, text: `${there.text} · ${n.text}` } : { ...n, week })
    }
    await db.labEntries.clear()
    await db.labNotes.clear()
    await db.labEntries.bulkPut([...entries.values()])
    await db.labNotes.bulkPut([...notes.values()])
    // Keep about the same stretch of time on screen: twice the columns for workweek + weekend, half for two weeks.
    const before = await getSettings(db)
    const span = { split: 3.5, week: 7, fortnight: 14 }
    const labWeeks = Math.max(1, Math.round((before.labWeeks * span[before.labColumns]) / span[settings.labColumns]))
    await updateSettings({ ...patch, labFirstWeek: firstWeek, labWeeks }, db)
  })
}

/** Changes the day weeks start on (see updateLabLayout). */
export const setLabWeekStart = (day: number, db: PulseDB = defaultDb) => updateLabLayout({ labWeekStart: day }, db)

/** Sets or clears several pretend amounts at once (a paste, a fill or a move). */
export async function setLabEntries(
  writes: Array<{ categoryId: string; week: string; value: { cents: number; formula?: string } | null }>,
  db: PulseDB = defaultDb,
): Promise<void> {
  await db.transaction('rw', db.labEntries, async () => {
    const id = (w: (typeof writes)[number]) => labEntryId(w.categoryId, w.week)
    await db.labEntries.bulkDelete(writes.filter((w) => w.value === null).map(id))
    await db.labEntries.bulkPut(
      writes.flatMap((w) =>
        w.value === null
          ? []
          : [{ id: id(w), categoryId: w.categoryId, week: w.week, cents: w.value.cents, ...(w.value.formula ? { formula: w.value.formula } : {}) }],
      ),
    )
  })
}
