import type { UpcomingItem, UpcomingOverride } from '../domain/upcoming'
import { setOwnedStatus } from './wishlist'
import { db as defaultDb, type PulseDB } from './db'

export type UpcomingInput = Omit<UpcomingItem, 'id'>

function check(input: UpcomingInput): UpcomingInput {
  const name = input.name.trim()
  if (!name) throw new Error('Give it a name.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Pick the date.')
  if (input.cents !== null && input.cents < 0) throw new Error('The amount can’t be below zero.')
  const out: UpcomingInput = { name, cents: input.cents, date: input.date, repeat: input.repeat, categoryId: input.categoryId }
  if (input.noticeDays && input.repeat !== 'once') out.noticeDays = input.noticeDays
  if (input.remindDays) out.remindDays = input.remindDays
  if (input.cancelledOn) out.cancelledOn = input.cancelledOn
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

/** Hides something Pulse found, or gives it alerts; an empty change removes the override. */
export async function setUpcomingOverride(sourceKey: string, patch: Omit<UpcomingOverride, 'id'>, db: PulseDB = defaultDb): Promise<void> {
  const current = (await db.upcomingOverrides.get(sourceKey)) ?? { id: sourceKey }
  const next: UpcomingOverride = { ...current, ...patch }
  if (!next.hidden) delete next.hidden
  if (!next.noticeDays) delete next.noticeDays
  if (!next.remindDays) delete next.remindDays
  if (!next.cancelledOn) delete next.cancelledOn
  if (Object.keys(next).length === 1) await db.upcomingOverrides.delete(sourceKey)
  else await db.upcomingOverrides.put(next)
}

/** Sets a line's alerts: on your own item itself, or as an override on something Pulse found. 0 turns one off. */
export async function setUpcomingAlerts(
  line: { sourceKey: string; itemId?: string },
  alerts: { remindDays: number; noticeDays: number },
  db: PulseDB = defaultDb,
): Promise<void> {
  if (line.itemId) {
    const item = await db.upcomingItems.get(line.itemId)
    if (!item) throw new Error('That line no longer exists.')
    const { id, ...rest } = item
    await saveUpcomingItem({ ...rest, remindDays: alerts.remindDays || undefined, noticeDays: alerts.noticeDays || undefined }, id, db)
  } else {
    await setUpcomingOverride(line.sourceKey, { remindDays: alerts.remindDays || undefined, noticeDays: alerts.noticeDays || undefined }, db)
  }
}

/**
 * Ticks (or unticks) that you cancelled it. Your own item and things Pulse found keep the day;
 * a Wishlist subscription is marked as cancelled there, so it ends everywhere.
 */
export async function setUpcomingCancelled(
  line: { sourceKey: string; itemId?: string; wishId?: string; source: string },
  on: boolean,
  today: string,
  db: PulseDB = defaultDb,
): Promise<void> {
  if (line.source === 'subscription' && line.wishId) {
    await setOwnedStatus(line.wishId, on ? 'cancelled' : 'inUse', on ? today : undefined, db)
  } else if (line.itemId) {
    const item = await db.upcomingItems.get(line.itemId)
    if (!item) throw new Error('That line no longer exists.')
    const { id, ...rest } = item
    await saveUpcomingItem({ ...rest, cancelledOn: on ? today : undefined }, id, db)
  } else {
    await setUpcomingOverride(line.sourceKey, { cancelledOn: on ? today : undefined }, db)
  }
}
