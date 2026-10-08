/**
 * The Wishlist plug-in: things, experiences and subscriptions you'd like, and everything
 * you already own. Its categories are its own (Tech, Sport…), not the budget's.
 */

export type WishKind = 'item' | 'experience' | 'subscription'
export type OwnedStatus = 'inUse' | 'broken' | 'lost' | 'sold'
/** How a copy of something stopped being yours. */
export type EndReason = Exclude<OwnedStatus, 'inUse'>
export const END_REASONS: EndReason[] = ['broken', 'lost', 'sold']

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
}

/** One earlier copy of the same model: when you had it, what it cost and how it ended. */
export interface PastCopy {
  purchasedOn?: string
  paidCents?: number
  giftShare?: number
  /** Last day of that copy's warranty, "YYYY-MM-DD". */
  warrantyUntil?: string
  endedOn: string
  end: EndReason
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
  /** When the current copy broke, got lost or was sold. */
  endedOn?: string
  /** Last day of the current copy's warranty, "YYYY-MM-DD". Each copy has its own. */
  warrantyUntil?: string
  /** The copies you had before this one, oldest first. Buying the same model again adds to it. */
  history?: PastCopy[]
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

/** Every filter takes several values: an item shows when it matches any of them. Prices are a range in cents. */
export interface WishFilter {
  categoryIds?: string[]
  brands?: string[]
  tagIds?: string[]
  kinds?: WishKind[]
  statuses?: OwnedStatus[]
  /** Lowest and highest price, in cents; leave one out for no limit on that side. */
  price?: { min?: number; max?: number }
  desiredOnly?: boolean
  text?: string
}

export type FilterKey = 'categoryIds' | 'brands' | 'tagIds' | 'kinds' | 'statuses' | 'price'

/** The current copy's status; anything older or unknown counts as in use. */
export function statusOf(w: WishItem): OwnedStatus {
  return w.status === 'broken' || w.status === 'lost' || w.status === 'sold' ? w.status : 'inUse'
}

/** Owned, but broken, lost or sold: it goes to Archived when that setting is on. */
export const hasEnded = (w: WishItem) => w.owned && w.kind !== 'experience' && statusOf(w) !== 'inUse'

/** Every copy, past ones first: when bought, when it ended (if it did), what was paid. */
export function copiesOf(w: WishItem): Array<{ purchasedOn?: string; paidCents?: number; giftShare?: number; warrantyUntil?: string; endedOn?: string; end?: EndReason; current: boolean }> {
  const past = (w.history ?? []).map((c) => ({ ...c, current: false }))
  if (!w.owned) return past
  const now = statusOf(w)
  return [
    ...past,
    {
      purchasedOn: w.purchasedOn,
      paidCents: w.paidCents ?? w.priceCents ?? undefined,
      giftShare: w.giftShare,
      ...(w.warrantyUntil ? { warrantyUntil: w.warrantyUntil } : {}),
      ...(now !== 'inUse' && w.endedOn ? { endedOn: w.endedOn, end: now } : now !== 'inUse' ? { end: now } : {}),
      current: true,
    },
  ]
}

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** How long the copies that ended lasted, on average, as "11 months"; null when none ended with both dates. */
export function averageLifetime(w: WishItem): string | null {
  const days = copiesOf(w).flatMap((c) => (c.purchasedOn && c.endedOn ? [dayNumber(c.endedOn) - dayNumber(c.purchasedOn)] : []))
  if (days.length === 0) return null
  const avg = days.reduce((a, b) => a + b, 0) / days.length
  if (avg < 60) {
    const weeks = Math.max(1, Math.round(avg / 7))
    return weeks === 1 ? '1 week' : `${weeks} weeks`
  }
  const months = Math.round(avg / 30.44)
  if (months < 24) return `${months} months`
  const years = Math.round((avg / 365.25) * 2) / 2
  return `${years} years`
}

/** What you paid yourself across every copy. */
export const spentOnAllCopies = (w: WishItem) => copiesOf(w).reduce((sum, c) => sum + ownShare(c.paidCents ?? 0, c.giftShare), 0)

/** The price that counts for filters: what was paid once owned, otherwise the price when added. */
export const shownPrice = (w: WishItem): number | null => (w.owned ? (w.paidCents ?? w.priceCents) : w.priceCents)

const some = <T,>(picked: T[] | undefined, test: (v: T) => boolean) => !picked || picked.length === 0 || picked.some(test)

export function matchesFilter(w: WishItem, f: WishFilter): boolean {
  if (!some(f.categoryIds, (id) => w.categoryIds.includes(id))) return false
  if (!some(f.brands, (b) => (w.brand ?? '').toLowerCase() === b.toLowerCase())) return false
  if (!some(f.tagIds, (id) => w.tagIds.includes(id))) return false
  if (!some(f.kinds, (k) => w.kind === k)) return false
  if (!some(f.statuses, (st) => statusOf(w) === st)) return false
  if (f.price && (f.price.min !== undefined || f.price.max !== undefined)) {
    const p = shownPrice(w)
    if (p === null) return false
    if (f.price.min !== undefined && p < f.price.min) return false
    if (f.price.max !== undefined && p > f.price.max) return false
  }
  if (f.desiredOnly && !w.desired) return false
  if (f.text) {
    const t = f.text.toLowerCase()
    if (!w.name.toLowerCase().includes(t) && !(w.brand ?? '').toLowerCase().includes(t)) return false
  }
  return true
}

/**
 * The items a filter's own choices are picked from: those matching every other filter. So with
 * Tech picked, the brand list only holds brands that have something in Tech.
 */
export function facetItems(items: WishItem[], f: WishFilter, key: FilterKey): WishItem[] {
  return items.filter((w) => matchesFilter(w, { ...f, [key]: undefined }))
}

/** Whether any filter is set. */
export function isFiltering(f: WishFilter): boolean {
  return Object.entries(f).some(([, v]) =>
    Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? v.min !== undefined || v.max !== undefined : v !== undefined && v !== '' && v !== false,
  )
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
    row.spentCents += spentOnAllCopies(w)
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
const ART_COLOURS = ['#1b2550', '#2f6fd6', '#2aa775', '#e5197d', '#a3620b', '#6b3fa0', '#0f766e', '#b91c1c']

/** The picture a card shows until it has a real one: its initials on a gradient picked from its name. */
export function placeholderArt(name: string): { from: string; to: string; initials: string } {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  const initials = words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
  return { from: ART_COLOURS[hash % ART_COLOURS.length]!, to: ART_COLOURS[(hash + 3) % ART_COLOURS.length]!, initials }
}

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

/** The same day `years` later ("2026-02-29" plus one year is "2027-02-28"). */
export function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate()
  return `${y + years}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/** Whether a copy that ended broke while its warranty still ran, so it may be worth claiming. */
export const brokeUnderWarranty = (c: { end?: EndReason; endedOn?: string; warrantyUntil?: string }) =>
  c.end === 'broken' && !!c.endedOn && !!c.warrantyUntil && c.endedOn <= c.warrantyUntil
