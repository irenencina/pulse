import { localToday } from '../domain/lab'
import { isGone, type ResaleItem, type ResaleStatus } from '../domain/resale'
import { ownShare } from '../domain/wishlist'
import { addTransaction, deleteTransaction, getSettings, updateSettings } from './actions'
import { db as defaultDb, type PulseDB } from './db'
import { setOwnedStatus } from './wishlist'

const newId = () => crypto.randomUUID()
const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)

/** What a person fills in for a thing to sell. */
export type ResaleInput = Pick<ResaleItem, 'name' | 'askingCents' | 'sites' | 'tagIds'> &
  Partial<Pick<ResaleItem, 'brand' | 'imageUrl' | 'url' | 'lowestCents' | 'notes' | 'paidCents' | 'status' | 'postedOn'>>

const TEXT_FIELDS = ['brand', 'imageUrl', 'url', 'notes'] as const

function clean(input: Partial<ResaleInput>): Partial<ResaleItem> {
  const out: Partial<ResaleItem> = { ...input }
  if (input.name !== undefined) {
    out.name = input.name.trim()
    if (!out.name) throw new Error('Give it a name.')
  }
  for (const key of TEXT_FIELDS) {
    if (key in input) {
      const v = input[key]?.trim()
      if (v) out[key] = v
      else delete out[key]
    }
  }
  if (input.askingCents != null && input.askingCents < 0) throw new Error('The price can’t be below zero.')
  if ('lowestCents' in input) {
    if (input.lowestCents === undefined) delete out.lowestCents
    else if (input.lowestCents < 0) throw new Error('The lowest price can’t be below zero.')
  }
  if (input.lowestCents !== undefined && input.askingCents != null && input.lowestCents > input.askingCents)
    throw new Error('The lowest price you’d take is above what you ask.')
  if (input.postedOn !== undefined && !isDay(input.postedOn)) throw new Error('Pick the day it was posted.')
  if (input.sites) out.sites = [...new Set(input.sites.map((s) => s.trim()).filter(Boolean))]
  if (input.status && isGone(input.status)) throw new Error('Use Sold or Given away to finish it.')
  return out
}

/** Adds a thing to sell; it starts as "To post" unless it says otherwise. */
export async function addResale(input: ResaleInput, db: PulseDB = defaultDb): Promise<string> {
  const id = newId()
  const today = localToday()
  const item = { status: 'toPost', ...clean(input), id, addedOn: today } as ResaleItem
  if (item.status !== 'toPost' && !item.postedOn) item.postedOn = today
  await db.resaleItems.add(item)
  return id
}

/**
 * Changes a thing to sell. Posting it notes the day; lowering the price of one that's posted
 * notes that day too, so the "lower the price?" reminder starts again.
 */
export async function updateResale(id: string, patch: Partial<ResaleInput>, db: PulseDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.resaleItems, async () => {
    const current = await db.resaleItems.get(id)
    if (!current) throw new Error('That item no longer exists.')
    const cleaned = clean({ askingCents: current.askingCents, ...patch })
    const next: ResaleItem = { ...current, ...cleaned }
    for (const key of TEXT_FIELDS) if (key in patch && !(key in cleaned)) delete next[key]
    if ('lowestCents' in patch && patch.lowestCents === undefined) delete next.lowestCents
    const today = localToday()
    if (next.status !== 'toPost' && !next.postedOn) next.postedOn = today
    if (next.status === 'toPost') delete next.postedOn
    if (current.postedOn && current.askingCents !== null && next.askingCents !== null && next.askingCents < current.askingCents) next.loweredOn = today
    await db.resaleItems.put(next)
  })
}

/** Moves a thing along the board: to post, posted or reserved. */
export async function setResaleStatus(id: string, status: ResaleStatus, db: PulseDB = defaultDb): Promise<void> {
  await updateResale(id, { status }, db)
}

export async function deleteResale(id: string, db: PulseDB = defaultDb): Promise<void> {
  await db.resaleItems.delete(id)
}

/** The resale entry an owned thing already has, if it's still being sold. */
export async function resaleFor(wishId: string, db: PulseDB = defaultDb): Promise<ResaleItem | undefined> {
  return (await db.resaleItems.where('wishId').equals(wishId).toArray()).find((r) => !isGone(r.status))
}

/** Puts something you own on the Resale tab, with its name, brand, picture and what it cost. */
export async function sellFromWish(wishId: string, db: PulseDB = defaultDb): Promise<string> {
  const wish = await db.wishItems.get(wishId)
  if (!wish?.owned) throw new Error('Only things you own can be sold.')
  const already = await resaleFor(wishId, db)
  if (already) return already.id
  const paid = wish.paidCents ?? wish.priceCents
  const id = await addResale(
    {
      name: wish.name,
      askingCents: null,
      sites: [],
      tagIds: wish.tagIds,
      ...(wish.brand ? { brand: wish.brand } : {}),
      ...(wish.imageUrl ? { imageUrl: wish.imageUrl } : {}),
      ...(paid != null ? { paidCents: ownShare(paid, wish.giftShare) } : {}),
    },
    db,
  )
  await db.resaleItems.update(id, { wishId })
  return id
}

export interface SoldInput {
  date: string
  cents: number
  /** The income category to add the money to in Tracking; null adds nothing. */
  recordIn: string | null
}

/** Sold: the money goes into Tracking as income, and the thing it came from on the Wishlist is marked as sold. */
export async function markSold(id: string, input: SoldInput, db: PulseDB = defaultDb): Promise<void> {
  const item = await db.resaleItems.get(id)
  if (!item) throw new Error('That item no longer exists.')
  if (!isDay(input.date)) throw new Error('Pick the day it was sold.')
  if (!Number.isFinite(input.cents) || input.cents < 0) throw new Error('Type what it sold for, or 0.')
  let transactionId: string | undefined
  if (input.recordIn && input.cents > 0) {
    const tags = (await db.tags.bulkGet(item.tagIds)).filter((t) => t !== undefined).map((t) => `#${t.name}`)
    transactionId = await addTransaction(
      { date: input.date, block: 'income', categoryId: input.recordIn, cents: input.cents, details: `Sold: ${item.name}`, tags: tags.join(' ') },
      db,
    )
    await updateSettings({ resaleIncomeCategory: input.recordIn }, db)
  }
  const next: ResaleItem = { ...item, status: 'sold', soldOn: input.date, soldCents: input.cents }
  if (transactionId) next.transactionId = transactionId
  else delete next.transactionId
  await db.resaleItems.put(next)
  if (item.wishId && (await db.wishItems.get(item.wishId))?.owned) await setOwnedStatus(item.wishId, 'sold', input.date, db)
}

/** Given away: gone without money, so nothing goes into Tracking. */
export async function markGiven(id: string, date: string, db: PulseDB = defaultDb): Promise<void> {
  const item = await db.resaleItems.get(id)
  if (!item) throw new Error('That item no longer exists.')
  if (!isDay(date)) throw new Error('Pick the day it went.')
  const { soldCents: _c, transactionId: _t, ...rest } = item
  if (item.transactionId) await deleteTransaction(item.transactionId, db)
  await db.resaleItems.put({ ...rest, status: 'given', soldOn: date })
  if (item.wishId && (await db.wishItems.get(item.wishId))?.owned) await setOwnedStatus(item.wishId, 'given', date, db)
}

/** Back to selling: the income added to Tracking is removed, and the Wishlist thing is yours again. */
export async function backToSelling(id: string, db: PulseDB = defaultDb): Promise<void> {
  const item = await db.resaleItems.get(id)
  if (!item) return
  if (item.transactionId) await deleteTransaction(item.transactionId, db)
  const { soldOn: _s, soldCents: _c, transactionId: _t, ...rest } = item
  await db.resaleItems.put({ ...rest, status: item.postedOn ? 'posted' : 'toPost' })
  const wish = item.wishId ? await db.wishItems.get(item.wishId) : undefined
  if (wish?.owned && (wish.status === 'sold' || wish.status === 'given')) await setOwnedStatus(wish.id, 'inUse', undefined, db)
}

/** Adds a site to post things on, at the end of the list. */
export async function addResaleSite(name: string, db: PulseDB = defaultDb): Promise<void> {
  const clean = name.trim()
  if (!clean) throw new Error('Type the site’s name.')
  const sites = (await getSettings(db)).resaleSites
  if (sites.some((s) => s.toLowerCase() === clean.toLowerCase())) return
  await updateSettings({ resaleSites: [...sites, clean] }, db)
}

/** Renames a site, on everything posted there too. */
export async function renameResaleSite(from: string, to: string, db: PulseDB = defaultDb): Promise<void> {
  const clean = to.trim()
  if (!clean) throw new Error('Type the site’s name.')
  await db.transaction('rw', db.settings, db.resaleItems, async () => {
    const sites = (await getSettings(db)).resaleSites
    await updateSettings({ resaleSites: [...new Set(sites.map((s) => (s === from ? clean : s)))] }, db)
    await db.resaleItems.toCollection().modify((i) => {
      if (i.sites.includes(from)) i.sites = [...new Set(i.sites.map((s) => (s === from ? clean : s)))]
    })
  })
}

/** Takes a site off the list; things already posted there keep it. */
export async function deleteResaleSite(name: string, db: PulseDB = defaultDb): Promise<void> {
  const sites = (await getSettings(db)).resaleSites
  await updateSettings({ resaleSites: sites.filter((s) => s !== name) }, db)
}
