/**
 * The Resale plug-in: things you mean to sell second hand, where each one is posted, what you
 * ask for it and how it's going, so selling doesn't keep getting put off.
 */
import { addDays } from './wishTiming'

export type ResaleStatus = 'toPost' | 'posted' | 'reserved' | 'sold' | 'given'

export const RESALE_STATUS_LABELS: Record<ResaleStatus, string> = {
  toPost: 'To post',
  posted: 'Posted',
  reserved: 'Reserved',
  sold: 'Sold',
  given: 'Given away',
}

/** Still to go, in the order the board shows them. */
export const SELLING: ResaleStatus[] = ['toPost', 'posted', 'reserved']
export const isGone = (s: ResaleStatus) => s === 'sold' || s === 'given'

/** The sites a new list starts with; you can change them in Settings → Plug-ins. */
export const STARTER_RESALE_SITES = ['Wallapop', 'Vinted', 'eBay', 'Facebook Marketplace']

export interface ResaleItem {
  id: string
  name: string
  brand?: string
  imageUrl?: string
  /** The listing's page, on one of the sites. */
  url?: string
  /** What you ask for it, in cents. Null while you haven't decided. */
  askingCents: number | null
  /** The least you'd take. */
  lowestCents?: number
  /** Where it's posted. */
  sites: string[]
  status: ResaleStatus
  /** The same tags as in Tracking. */
  tagIds: string[]
  notes?: string
  /** "YYYY-MM-DD" */
  addedOn: string
  /** The first day it was posted. */
  postedOn?: string
  /** The last day you lowered the price. */
  loweredOn?: string
  /** The day the buyer comes to pick it up. */
  pickupOn?: string
  soldOn?: string
  soldCents?: number
  /** The Tracking income recorded when it was sold. */
  transactionId?: string
  /** The owned thing on the Wishlist it came from: selling it marks that one as sold. */
  wishId?: string
  /** What it cost you, for comparing. */
  paidCents?: number
}

/** Days a thing may wait to be posted before Upcoming reminds you. */
export const POST_NUDGE_DAYS = 7
/** Days posted (or since the last price drop) before Upcoming suggests lowering the price. */
export const PRICE_NUDGE_DAYS = 30

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

export type ResaleNudge = { kind: 'post' | 'lower' | 'pickup'; from: string; days: number }

/**
 * What to do about a thing that hasn't sold: hand it over on its pick-up day, post it once it has
 * waited a week, or lower its price once it has been posted a month without a buyer. `from` is
 * the day the nudge starts; for a pick-up, `days` is how many are left.
 */
export function resaleNudge(item: Pick<ResaleItem, 'status' | 'addedOn' | 'postedOn' | 'loweredOn' | 'pickupOn'>, today: string): ResaleNudge | null {
  if (isGone(item.status)) return null
  if (item.pickupOn) return { kind: 'pickup', from: item.pickupOn, days: daysBetween(today, item.pickupOn) }
  if (item.status === 'toPost') {
    const from = addDays(item.addedOn, POST_NUDGE_DAYS)
    return { kind: 'post', from, days: daysBetween(item.addedOn, today) }
  }
  if (item.status === 'posted' && item.postedOn) {
    const since = item.loweredOn && item.loweredOn > item.postedOn ? item.loweredOn : item.postedOn
    return { kind: 'lower', from: addDays(since, PRICE_NUDGE_DAYS), days: daysBetween(since, today) }
  }
  return null
}

/** "3 days", "1 day", "today" */
export const daysText = (days: number) => (days <= 0 ? 'today' : `${days} ${days === 1 ? 'day' : 'days'}`)

export interface ResaleFilter {
  text?: string
  sites?: string[]
  statuses?: ResaleStatus[]
}

export const isResaleFiltering = (f: ResaleFilter) => !!(f.text || f.sites?.length || f.statuses?.length)

export function matchesResale(item: ResaleItem, f: ResaleFilter): boolean {
  const words = (f.text ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const haystack = `${item.name} ${item.brand ?? ''} ${item.notes ?? ''}`.toLowerCase()
  if (!words.every((w) => haystack.includes(w))) return false
  if (f.sites?.length && !item.sites.some((s) => f.sites!.includes(s))) return false
  if (f.statuses?.length && !f.statuses.includes(item.status)) return false
  return true
}

export interface ResaleTotals {
  /** Asking prices of what's still to sell. */
  askingCents: number
  /** What sold for, this calendar year. */
  earnedThisYearCents: number
  earnedCents: number
}

export function resaleTotals(items: ResaleItem[], today: string): ResaleTotals {
  const year = today.slice(0, 4)
  let askingCents = 0
  let earnedThisYearCents = 0
  let earnedCents = 0
  for (const i of items) {
    if (!isGone(i.status)) askingCents += i.askingCents ?? 0
    if (i.status === 'sold' && i.soldCents) {
      earnedCents += i.soldCents
      if (i.soldOn?.startsWith(year)) earnedThisYearCents += i.soldCents
    }
  }
  return { askingCents, earnedThisYearCents, earnedCents }
}
