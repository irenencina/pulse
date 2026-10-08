import type { UpcomingItem, UpcomingOverride } from '../domain/upcoming'
import { db as defaultDb, type PulseDB } from './db'

export type UpcomingInput = Omit<UpcomingItem, 'id'>

function check(input: UpcomingInput): UpcomingInput {
  const name = input.name.trim()
  if (!name) throw new Error('Give it a name.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Pick the date.')
  if (input.cents !== null && input.cents < 0) throw new Error('The amount can’t be below zero.')
  const out: UpcomingInput = { name, cents: input.cents, date: input.date, repeat: input.repeat, categoryId: input.categoryId }
  if (input.noticeDays && input.repeat !== 'once') out.noticeDays = input.noticeDays
  return out
}

/** Adds something to Upcoming, or saves changes to one you added before. */
export async function saveUpcomingItem(input: UpcomingInput, id?: string, db: PulseDB = defaultDb): Promise<string> {
  const item = { ...check(input), id: id ?? crypto.randomUUID() }
  await db.upcomingItems.put(item)
  return item.id
}

export async function deleteUpcomingItem(id: string, db: PulseDB = defaultDb): Promise<void> {
  await db.upcomingItems.delete(id)
}

/** Hides something Pulse found, or gives it a notice period; an empty change removes the override. */
export async function setUpcomingOverride(sourceKey: string, patch: Omit<UpcomingOverride, 'id'>, db: PulseDB = defaultDb): Promise<void> {
  const current = (await db.upcomingOverrides.get(sourceKey)) ?? { id: sourceKey }
  const next: UpcomingOverride = { ...current, ...patch }
  if (!next.hidden) delete next.hidden
  if (!next.noticeDays) delete next.noticeDays
  if (Object.keys(next).length === 1) await db.upcomingOverrides.delete(sourceKey)
  else await db.upcomingOverrides.put(next)
}
