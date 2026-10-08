import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings } from '../db/actions'
import { db } from '../db/db'
import { dueSoon, upcomingEvents } from '../domain/upcoming'
import { todayIso } from './tracking/format'

/** How many Upcoming lines fall in the next 7 days, for the count on its tab. */
export function useDueSoon(): number {
  return (
    useLiveQuery(async () => {
      const settings = await getSettings()
      const [categories, cells, transactions, wishes, items, overrides] = await Promise.all([
        db.categories.toArray(),
        db.budgetCells.toArray(),
        db.transactions.toArray(),
        settings.pluginWishlist ? db.wishItems.toArray() : [],
        db.upcomingItems.toArray(),
        db.upcomingOverrides.toArray(),
      ])
      const today = todayIso()
      return dueSoon(upcomingEvents({ categories, cells, transactions, wishes, items, overrides, settings }, today), today)
    }, []) ?? 0
  )
}
