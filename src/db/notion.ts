/** TEMPORARY: see src/domain/notion.ts. */
import { localToday } from '../domain/lab'
import type { NotionItem } from '../domain/notion'
import type { WishItem } from '../domain/wishlist'
import { addTag } from './actions'
import { db as defaultDb, type PulseDB } from './db'
import { addWishCategory, ensureWishCategories } from './wishlist'

const newId = () => crypto.randomUUID()

/**
 * Adds the items from a Notion export. Categories and tags are created as needed, and rows
 * already imported are skipped, so importing the same file twice is safe. Returns how many were added.
 */
export async function importNotionItems(items: NotionItem[], db: PulseDB = defaultDb): Promise<number> {
  await ensureWishCategories(db)
  let added = 0
  const known = new Set((await db.wishItems.toArray()).map((w) => w.importKey).filter(Boolean))
  const fresh = items.filter((i) => !known.has(i.importKey))
  const categoryIds = new Map<string, string>()
  for (const name of new Set(fresh.flatMap((i) => i.categories))) categoryIds.set(name, await addWishCategory(name, db))
  const tagIds = new Map<string, string>()
  for (const name of new Set(fresh.flatMap((i) => i.tags))) tagIds.set(name, await addTag(name, db))
  await db.transaction('rw', db.wishItems, async () => {
    const last = await db.wishItems.orderBy('order').last()
    let order = (last?.order ?? -1) + 1
    const today = localToday()
    for (const i of fresh) {
      const kind = i.kind ?? (i.categories.some((c) => /subscription/i.test(c)) ? 'subscription' : i.categories.some((c) => /experience/i.test(c)) ? 'experience' : 'item')
      const w: WishItem = {
        id: newId(),
        name: i.name,
        kind,
        priceCents: i.priceCents,
        categoryIds: i.categories.map((c) => categoryIds.get(c)!),
        tagIds: i.tags.map((t) => tagIds.get(t)!),
        desired: i.desired,
        order: order++,
        addedOn: i.addedOn ?? today,
        owned: i.owned,
        importKey: i.importKey,
      }
      if (i.url) w.url = i.url
      if (i.brand) w.brand = i.brand
      if (i.giftFor) w.giftFor = i.giftFor
      if (i.imageUrl) w.imageUrl = i.imageUrl
      if (i.history) w.history = i.history
      if (i.owned) {
        w.status = i.status ?? 'inUse'
        if (i.status && i.status !== 'inUse') w.endedOn = i.endedOn ?? today
        if (i.purchasedOn) w.purchasedOn = i.purchasedOn
        if (i.priceCents !== null) w.paidCents = i.priceCents
        if (i.giftShare) w.giftShare = i.giftShare
      }
      await db.wishItems.add(w)
      added++
    }
  })
  return added
}
