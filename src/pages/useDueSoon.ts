import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings } from '../db/actions'
import { db } from '../db/db'
import { dueSoon, upcomingEvents } from '../domain/upcoming'
import { todayIso } from './tracking/format'
import { useLastBackup } from '../db/autoBackup'

/** How many Upcoming lines fall in the next 7 days, for the count on its tab. */
export function useDueSoon(): number {
  const lastBackup = useLastBackup()
  return (
    useLiveQuery(async () => {
      const settings = await getSettings()
      const [categories, cells, transactions, wishes, resale, items, overrides, accounts, balances] = await Promise.all([
        db.categories.toArray(),
        db.budgetCells.toArray(),
        db.transactions.toArray(),
        settings.pluginWishlist ? db.wishItems.toArray() : [],
        settings.pluginResale ? db.resaleItems.toArray() : [],
        db.upcomingItems.toArray(),
        db.upcomingOverrides.toArray(),
        db.accounts.toArray(),
        db.balances.toArray(),
      ])
      const today = todayIso()
      return dueSoon(upcomingEvents({ categories, cells, transactions, wishes, resale, items, overrides, settings, accounts, balances, lastBackup }, today), today)
    }, [lastBackup]) ?? 0
  )
}
