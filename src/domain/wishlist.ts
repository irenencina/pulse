/**
 * The Wishlist plug-in: things, experiences and subscriptions you'd like, and everything
 * you already own. Its categories are its own (Tech, Sport…), not the budget's.
 */

export type WishKind = 'item' | 'experience' | 'subscription'
export type OwnedStatus = 'inUse' | 'broken' | 'lost' | 'sold' | 'rebought'

export const KIND_LABELS: Record<WishKind, string> = {
  item: 'Item',
  experience: 'Experience',
  subscription: 'Subscription',
}

export const STATUS_LABELS: Record<OwnedStatus, string> = {
  inUse: 'In use',
  broken: 'Broken',
  lost: 'Lost',
  sold: 'Sold',
  rebought: 'Bought again',
}

export interface WishItem {
  id: string
  name: string
  kind: WishKind
  /** The price when added, in cents (per month for a subscription). Null when not known. */
  priceCents: number | null
  url?: string
  imageUrl?: string
  /** Wishlist categories (several allowed). */
  categoryIds: string[]
  brand?: string
  /** The same tags as in Tracking. */
  tagIds: string[]
  /** The planner category it will be paid from. */
  paidFrom?: string
  desired: boolean
  /** Position in your own order, ascending. */
  order: number
  /** When it was added, "YYYY-MM-DD". */
  addedOn: string
  /** Bought (an item or subscription) or done (an experience). */
  owned: boolean
  purchasedOn?: string
  paidCents?: number
  /** 0–100: the part of the price that was a gift. Who gave it is never stored. */
  giftShare?: number
  status?: OwnedStatus
  /** The Tracking expense recorded when it was bought. */
  transactionId?: string
  /** Who it's meant for, when it's a present (kept for the Gifts plug-in). */
  giftFor?: string
  /** Identifies a row imported from Notion, so importing twice adds nothing. */
  importKey?: string
}

export interface WishCategory {
  id: string
  name: string
  order: number
}

/** The categories a new wishlist starts with. */
export const STARTER_WISH_CATEGORIES = [
  'Tech',
  'Sport',
  'Home',
  'Lifestyle',
  'Apparel',
  'Accessories',
  'Books',
  'Experiences',
  'Subscriptions',
  'Miscellaneous',
]

export type PriceRange = 'under50' | '50to100' | 'over100'
export const PRICE_RANGES: Record<PriceRange, string> = {
  under50: 'Under 50',
  '50to100': '50–100',
  over100: 'Over 100',
}

export function priceRangeOf(cents: number | null): PriceRange | null {
  if (cents === null) return null
  if (cents < 5000) return 'under50'
  if (cents <= 10000) return '50to100'
  return 'over100'
}

export interface WishFilter {
  categoryId?: string
  brand?: string
  tagId?: string
  kind?: WishKind
  price?: PriceRange
  desiredOnly?: boolean
  status?: OwnedStatus
  text?: string
}

/** The price that counts for filters: what was paid once owned, otherwise the price when added. */
export const shownPrice = (w: WishItem): number | null => (w.owned ? (w.paidCents ?? w.priceCents) : w.priceCents)

export function matchesFilter(w: WishItem, f: WishFilter): boolean {
  if (f.categoryId && !w.categoryIds.includes(f.categoryId)) return false
  if (f.brand && (w.brand ?? '').toLowerCase() !== f.brand.toLowerCase()) return false
  if (f.tagId && !w.tagIds.includes(f.tagId)) return false
  if (f.kind && w.kind !== f.kind) return false
  if (f.price && priceRangeOf(shownPrice(w)) !== f.price) return false
  if (f.desiredOnly && !w.desired) return false
  if (f.status && (w.status ?? 'inUse') !== f.status) return false
  if (f.text) {
    const t = f.text.toLowerCase()
    if (!w.name.toLowerCase().includes(t) && !(w.brand ?? '').toLowerCase().includes(t)) return false
  }
  return true
}

/** What you paid yourself: the price paid minus the part that was a gift. */
export function ownShare(cents: number, giftShare = 0): number {
  return Math.round((cents * (100 - Math.min(100, Math.max(0, giftShare)))) / 100)
}

/** Brands in use, with how many items and how much was spent on owned ones. */
export function brandSummary(items: WishItem[]): Array<{ brand: string; count: number; spentCents: number }> {
  const byKey = new Map<string, { brand: string; count: number; spentCents: number }>()
  for (const w of items) {
    const brand = w.brand?.trim()
    if (!brand) continue
    const key = brand.toLowerCase()
    const row = byKey.get(key) ?? { brand, count: 0, spentCents: 0 }
    row.count++
    if (w.owned) row.spentCents += ownShare(w.paidCents ?? w.priceCents ?? 0, w.giftShare)
    byKey.set(key, row)
  }
  return [...byKey.values()].sort((a, b) => a.brand.localeCompare(b.brand))
}

/** "3 weeks", "6 months", "1 year 2 months": how long something has been owned. */
export function ownedFor(purchasedOn: string, today: string): string {
  const [y1, m1, d1] = purchasedOn.split('-').map(Number) as [number, number, number]
  const [y2, m2, d2] = today.split('-').map(Number) as [number, number, number]
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
  if (months < 1) {
    const days = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
    if (days < 1) return 'today'
    if (days < 7) return days === 1 ? '1 day' : `${days} days`
    const weeks = Math.floor(days / 7)
    return weeks === 1 ? '1 week' : `${weeks} weeks`
  }
  const years = Math.floor(months / 12)
  months -= years * 12
  const parts = []
  if (years > 0) parts.push(years === 1 ? '1 year' : `${years} years`)
  if (months > 0) parts.push(months === 1 ? '1 month' : `${months} months`)
  return parts.join(' ')
}

/** A web image search for an item, opened in a new tab by "Find image". */
export function imageSearchUrl(w: Pick<WishItem, 'name' | 'brand'>): string {
  const q = [w.brand, w.name].filter(Boolean).join(' ')
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`
}

/** The picture address in something dropped or pasted: a link, or an <img> copied from a page. */
export function imageFromDrop(uriList: string, html: string, text: string): string | null {
  const fromHtml = /<img[^>]+src="([^"]+)"/i.exec(html)?.[1]
  const candidates = [fromHtml, ...uriList.split(/\r?\n/).filter((l) => l && !l.startsWith('#')), text.trim()]
  for (const c of candidates) {
    if (c && /^(https?:|data:image\/)/i.test(c)) return c.replace(/&amp;/g, '&')
  }
  return null
}
