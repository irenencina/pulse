import { localToday } from '../domain/lab'
import { ownShare, STARTER_WISH_CATEGORIES, type OwnedStatus, type WishItem } from '../domain/wishlist'
import { addTransaction, deleteTransaction } from './actions'
import { db as defaultDb, type PulseDB } from './db'

const newId = () => crypto.randomUUID()

/** The wishlist's own categories; the starter list is added the first time it's used. */
export async function ensureWishCategories(db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.wishCategories, async () => {
    if ((await db.wishCategories.count()) > 0) return
    await db.wishCategories.bulkAdd(STARTER_WISH_CATEGORIES.map((name, order) => ({ id: newId(), name, order })))
  })
}

export async function addWishCategory(name: string, db: PulseDB = defaultDb): Promise<string> {
  const clean = name.trim()
  if (!clean) throw new Error('Give the category a name.')
  return db.transaction('rw', db.wishCategories, async () => {
    const all = await db.wishCategories.toArray()
    const same = all.find((c) => c.name.toLowerCase() === clean.toLowerCase())
    if (same) return same.id
    const id = newId()
    await db.wishCategories.add({ id, name: clean, order: Math.max(-1, ...all.map((c) => c.order)) + 1 })
    return id
  })
}

export async function renameWishCategory(id: string, name: string, db: PulseDB = defaultDb): Promise<void> {
  const clean = name.trim()
  if (!clean) throw new Error('Give the category a name.')
  await db.wishCategories.update(id, { name: clean })
}

/** Removes a category; the items in it simply lose it. */
export async function deleteWishCategory(id: string, db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.wishCategories, db.wishItems, async () => {
    await db.wishCategories.delete(id)
    await db.wishItems.toCollection().modify((w) => {
      w.categoryIds = w.categoryIds.filter((c) => c !== id)
    })
  })
}

/** What a person fills in for a wish or an owned thing. */
export type WishInput = Pick<WishItem, 'name' | 'kind' | 'priceCents' | 'categoryIds' | 'tagIds' | 'desired'> &
  Partial<Pick<WishItem, 'url' | 'imageUrl' | 'brand' | 'paidFrom' | 'owned' | 'purchasedOn' | 'paidCents' | 'giftShare' | 'status' | 'giftFor'>>

function clean(input: Partial<WishInput>): Partial<WishItem> {
  const out: Partial<WishItem> = { ...input }
  if (input.name !== undefined) {
    out.name = input.name.trim()
    if (!out.name) throw new Error('Give it a name.')
  }
  for (const key of ['url', 'imageUrl', 'brand', 'giftFor'] as const) {
    if (key in input) {
      const v = input[key]?.trim()
      if (v) out[key] = v
      else delete out[key]
    }
  }
  if (input.priceCents !== undefined && input.priceCents !== null && input.priceCents < 0) throw new Error('The price can’t be below zero.')
  if (input.giftShare !== undefined && (input.giftShare < 0 || input.giftShare > 100)) throw new Error('The gift share goes from 0 to 100%.')
  return out
}

/** Adds a wish (or, with owned, something you already have) at the top of your order. */
export async function addWish(input: WishInput, db: PulseDB = defaultDb): Promise<string> {
  const id = newId()
  await db.transaction('rw', db.wishItems, async () => {
    const first = await db.wishItems.orderBy('order').first()
    await db.wishItems.add({
      owned: false,
      ...(clean(input) as WishInput),
      id,
      order: (first?.order ?? 1) - 1,
      addedOn: localToday(),
    } as WishItem)
  })
  return id
}

export async function updateWish(id: string, patch: Partial<WishInput>, db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.wishItems, async () => {
    const current = await db.wishItems.get(id)
    if (!current) throw new Error('That item no longer exists.')
    const next = { ...current, ...clean(patch) }
    for (const key of ['url', 'imageUrl', 'brand', 'giftFor'] as const) if (key in patch && !(key in clean(patch))) delete next[key]
    await db.wishItems.put(next)
  })
}

export async function deleteWish(id: string, db: PulseDB = defaultDb): Promise<void> {
  await db.wishItems.delete(id)
}

/** Moves a wish to sit just before `beforeId` (or at the end), keeping everyone else's order. */
export async function moveWish(id: string, beforeId: string | null, db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.wishItems, async () => {
    const list = (await db.wishItems.orderBy('order').toArray()).filter((w) => w.id !== id)
    const moving = await db.wishItems.get(id)
    if (!moving) return
    const at = beforeId === null ? list.length : list.findIndex((w) => w.id === beforeId)
    list.splice(at < 0 ? list.length : at, 0, moving)
    await db.wishItems.bulkPut(list.map((w, order) => ({ ...w, order })))
  })
}

export interface BoughtInput {
  date: string
  paidCents: number
  giftShare: number
  /** The expense category to record your part in Tracking; null records nothing. */
  recordIn: string | null
}

/**
 * Marks a wish as bought (or done): it moves to Owned, and your part of the price
 * (after the gift share) is added to Tracking with the wish's tags.
 */
export async function markBought(id: string, input: BoughtInput, db: PulseDB = defaultDb): Promise<void> {
  const wish = await db.wishItems.get(id)
  if (!wish) throw new Error('That item no longer exists.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Pick the date it was bought.')
  if (input.paidCents < 0) throw new Error('The price can’t be below zero.')
  const own = ownShare(input.paidCents, input.giftShare)
  let transactionId: string | undefined
  if (input.recordIn && own > 0) {
    const tags = (await db.tags.bulkGet(wish.tagIds)).filter((t) => t !== undefined).map((t) => `#${t.name}`)
    transactionId = await addTransaction(
      { date: input.date, block: 'expenses', categoryId: input.recordIn, cents: own, details: wish.name, tags: tags.join(' ') },
      db,
    )
  }
  const next: WishItem = {
    ...wish,
    owned: true,
    purchasedOn: input.date,
    paidCents: input.paidCents,
    status: wish.status ?? 'inUse',
  }
  if (input.giftShare > 0) next.giftShare = input.giftShare
  else delete next.giftShare
  if (transactionId) next.transactionId = transactionId
  await db.wishItems.put(next)
}

/** Back to the wishlist; the Tracking expense recorded when it was bought is removed too. */
export async function unmarkBought(id: string, db: PulseDB = defaultDb): Promise<void> {
  const wish = await db.wishItems.get(id)
  if (!wish) return
  if (wish.transactionId) await deleteTransaction(wish.transactionId, db)
  const { purchasedOn: _p, paidCents: _c, giftShare: _g, status: _s, transactionId: _t, ...rest } = wish
  await db.wishItems.put({ ...rest, owned: false })
}

export async function setOwnedStatus(id: string, status: OwnedStatus, db: PulseDB = defaultDb): Promise<void> {
  await db.wishItems.update(id, { status })
}
