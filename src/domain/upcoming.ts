/**
 * Upcoming: what will take money, or needs a decision, in the coming months. Most of it is
 * found in what Pulse already knows (once-a-year planner lines, payments that repeat in
 * Tracking, owned subscriptions, warranties); the rest are items you add yourself.
 */
import { plannedCell, cellId, type BudgetCell } from './budget'
import { monthKey, type MonthKey, type MonthRule } from './periods'
import { groupKey, monthlyPayments, nextMonthDate, previousMonth } from './recurring'
import { countsFor, type Transaction } from './transactions'
import type { Category } from './types'
import { addYears, statusOf, type WishItem } from './wishlist'

export type Repeat = 'once' | 'month' | 'year'

export const REPEAT_LABELS: Record<Repeat, string> = { once: 'Once', month: 'Every month', year: 'Every year' }

/** Notice periods offered, in days. */
export const NOTICE_OPTIONS: Array<[number, string]> = [
  [7, '1 week'],
  [14, '2 weeks'],
  [30, '1 month'],
  [61, '2 months'],
  [91, '3 months'],
]

/** Reminders before a payment, in days. */
export const REMIND_OPTIONS: Array<[number, string]> = [
  [1, '1 day'],
  [3, '3 days'],
  [7, '1 week'],
  [14, '2 weeks'],
  [30, '1 month'],
]

/** Something you added yourself: a birthday, an insurance renewal, an ID card to renew. */
export interface UpcomingItem {
  id: string
  name: string
  /** Null for a deadline that costs nothing, like renewing an ID card. */
  cents: number | null
  /** The first (or only) date, "YYYY-MM-DD". */
  date: string
  repeat: Repeat
  categoryId: string | null
  /** Days before each date by which it has to be cancelled, e.g. a contract that renews itself. */
  noticeDays?: number
  /** Days before each date to show it as due soon. */
  remindDays?: number
}

/** Your changes to something Pulse found itself: hide it, or give it alerts. Keyed by its sourceKey. */
export interface UpcomingOverride {
  id: string
  hidden?: boolean
  noticeDays?: number
  remindDays?: number
}

export type UpcomingSource = 'planner' | 'tracking' | 'subscription' | 'warranty' | 'own'

export interface UpcomingEvent {
  /** Unique per line. */
  key: string
  /** The thing it comes from, the same every month: an override uses it. */
  sourceKey: string
  source: UpcomingSource
  kind: 'payment' | 'cancelBy' | 'warranty'
  name: string
  cents: number | null
  date: string
  /** Planner lines only know the month. */
  monthOnly?: boolean
  repeat: Repeat
  categoryId: string | null
  /** Already paid this month (it showed up in Tracking). */
  done?: boolean
  /** It cost less last time. */
  priceUp?: { from: number; to: number }
  noticeDays?: number
  remindDays?: number
  /** Tags on the tracked payments it comes from. */
  tagIds?: string[]
  itemId?: string
  wishId?: string
  /** For a "last day to cancel" line: the date it renews on. */
  renewsOn?: string
}

export interface UpcomingInput {
  categories: Category[]
  cells: BudgetCell[]
  transactions: Transaction[]
  wishes: WishItem[]
  items: UpcomingItem[]
  overrides: UpcomingOverride[]
  settings: MonthRule
}

const addDays = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}

const advance = (iso: string, repeat: Repeat): string => (repeat === 'month' ? nextMonthDate(iso) : addYears(iso, 1))

/** The first date on or after `from`, starting at `date` and repeating; null for a one-off that's past. */
export function nextDate(date: string, repeat: Repeat, from: string): string | null {
  if (repeat === 'once') return date >= from ? date : null
  let d = date
  // Keep the day of the month: step from the original date, not from a shortened one.
  for (let n = 1; d < from && n < 1200; n++) d = repeat === 'month' ? monthsLater(date, n) : addYears(date, n)
  return d
}

function monthsLater(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const index = y * 12 + (m - 1) + n
  const ny = Math.floor(index / 12)
  const nm = (index % 12) + 1
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${monthKey(ny, nm)}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/** The renewal whose notice date is still ahead, and that notice date. */
function nextNotice(date: string, repeat: Repeat, noticeDays: number, today: string): { renewsOn: string; by: string } | null {
  let renews = nextDate(date, repeat, today)
  for (let n = 0; renews && n < 1200; n++) {
    const by = addDays(renews, -noticeDays)
    if (by >= today) return { renewsOn: renews, by }
    if (repeat === 'once') return null
    renews = advance(renews, repeat)
  }
  return null
}

const significantWords = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)

/**
 * Everything coming up from today until `months` months ahead, by date. A repeating thing shows
 * its next date only; one already paid this month also shows as done.
 */
export function upcomingEvents(input: UpcomingInput, today: string, months = 12): UpcomingEvent[] {
  const until = monthsLater(today, months)
  const overrides = new Map(input.overrides.map((o) => [o.id, o]))
  const events: UpcomingEvent[] = []
  const thisMonth = today.slice(0, 7) as MonthKey
  const live = input.categories.filter((c) => !c.archived)
  const parents = new Set(live.map((c) => c.parentId).filter((id): id is string => id !== null))

  // Once-a-year planner lines, in their month.
  const byCell = new Map(input.cells.map((c) => [cellId(c.categoryId, c.month), c]))
  for (const c of live) {
    if (!c.yearly || parents.has(c.id) || c.block === 'income') continue
    const year = Number(today.slice(0, 4)) + (c.yearly.month < Number(today.slice(5, 7)) ? 1 : 0)
    const month = monthKey(year, c.yearly.month)
    const cell = plannedCell(byCell, c, month)
    const cents = cell?.kind === 'fixed' ? cell.cents : c.yearly.cents
    if (cents <= 0) continue
    events.push({
      key: `planner:${c.id}:${month}`,
      sourceKey: `planner:${c.id}`,
      source: 'planner',
      kind: 'payment',
      name: c.name,
      cents,
      date: `${month}-01`,
      monthOnly: true,
      repeat: 'year',
      categoryId: c.id,
    })
  }

  // Payments that came every month lately: the next one, and this month's if it came already.
  // A price rise (Spotify €10.99 to €12.99) still counts as the same payment here.
  const recurring = monthlyPayments(input.transactions, thisMonth, input.settings, 0.3).filter((r) => r.block === 'expenses')
  const lastMonth = previousMonth(thisMonth)
  for (const r of recurring) {
    const before = input.transactions.find((t) => groupKey(t) === r.key && countsFor(t, input.settings) === previousMonth(thisMonth, 2))
    const priceUp = before && before.cents < r.cents ? { from: before.cents, to: r.cents } : undefined
    const tagIds = [...new Set(input.transactions.filter((t) => groupKey(t) === r.key).flatMap((t) => t.tagIds))]
    const base = {
      sourceKey: `tracking:${r.key}`,
      source: 'tracking' as const,
      kind: 'payment' as const,
      name: r.details,
      repeat: 'month' as const,
      categoryId: r.categoryId,
      ...(tagIds.length > 0 ? { tagIds } : {}),
    }
    if (r.seenIn) {
      const paid = input.transactions.find((t) => groupKey(t) === r.key && countsFor(t, input.settings) === thisMonth)!
      events.push({ ...base, key: `tracking:${r.key}:done`, cents: paid.cents, date: paid.date, done: true, ...(paid.cents > r.cents ? { priceUp: { from: r.cents, to: paid.cents } } : {}) })
      events.push({ ...base, key: `tracking:${r.key}:next`, cents: paid.cents, date: nextMonthDate(paid.date) })
    } else {
      const last = input.transactions.find((t) => groupKey(t) === r.key && countsFor(t, input.settings) === lastMonth)
      events.push({ ...base, key: `tracking:${r.key}:next`, cents: r.cents, date: last ? nextMonthDate(last.date) : r.date, ...(priceUp ? { priceUp } : {}) })
    }
  }
  const recurringWords = recurring.map((r) => new Set(significantWords(r.details)))

  for (const w of input.wishes) {
    if (!w.owned || statusOf(w) !== 'inUse') continue
    // Owned subscriptions, unless Tracking already shows the payment.
    if (w.kind === 'subscription' && w.purchasedOn) {
      const words = significantWords(`${w.name} ${w.brand ?? ''}`)
      const tracked = recurringWords.some((set) => words.some((x) => set.has(x)))
      const cents = w.paidCents ?? w.priceCents
      const date = nextDate(w.purchasedOn, 'month', today)
      if (!tracked && cents !== null && cents !== undefined && date) {
        events.push({ key: `wish:${w.id}`, sourceKey: `wish:${w.id}`, source: 'subscription', kind: 'payment', name: w.name, cents, date, repeat: 'month', categoryId: w.paidFrom ?? null, wishId: w.id })
      }
    }
    // Warranties still running.
    if (w.warrantyUntil && w.warrantyUntil >= today) {
      events.push({ key: `warranty:${w.id}`, sourceKey: `warranty:${w.id}`, source: 'warranty', kind: 'warranty', name: w.name, cents: null, date: w.warrantyUntil, repeat: 'once', categoryId: null, wishId: w.id })
    }
  }

  for (const item of input.items) {
    const date = nextDate(item.date, item.repeat, today)
    if (!date) continue
    events.push({
      key: `own:${item.id}`,
      sourceKey: `own:${item.id}`,
      source: 'own',
      kind: 'payment',
      name: item.name,
      cents: item.cents,
      date,
      repeat: item.repeat,
      categoryId: item.categoryId,
      itemId: item.id,
      ...(item.noticeDays ? { noticeDays: item.noticeDays } : {}),
      ...(item.remindDays ? { remindDays: item.remindDays } : {}),
    })
  }

  const shown: UpcomingEvent[] = []
  for (const e of events) {
    const o = overrides.get(e.sourceKey)
    if (o?.hidden) continue
    const noticeDays = e.source === 'own' ? e.noticeDays : o?.noticeDays
    const remindDays = e.source === 'own' ? e.remindDays : o?.remindDays
    const line = { ...e, ...(noticeDays ? { noticeDays } : {}), ...(remindDays ? { remindDays } : {}) }
    if (!e.done && line.date <= until) shown.push(line)
    else if (e.done) shown.push(line)
    // A notice period adds its own line: the last day to cancel before it renews.
    if (noticeDays && !e.done && e.kind === 'payment') {
      const notice = nextNotice(e.date, e.repeat, noticeDays, today)
      if (notice && notice.by <= until) {
        shown.push({ ...line, key: `${e.key}:cancel`, kind: 'cancelBy', date: notice.by, renewsOn: notice.renewsOn, monthOnly: false })
      }
    }
  }
  return shown.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}

export type UpcomingFlag = 'priceUp' | 'cancelSoon' | 'warrantySoon' | 'dueSoon'

/**
 * Lines that need a look: a last day to cancel within two weeks, a warranty ending within a
 * month, a payment inside its reminder, or a price rise.
 */
export function flagOf(e: UpcomingEvent, today: string): UpcomingFlag | null {
  if (e.done) return null
  if (e.kind === 'cancelBy' && e.date <= addDays(today, 14)) return 'cancelSoon'
  if (e.kind === 'warranty' && e.date <= addDays(today, 30)) return 'warrantySoon'
  if (e.kind === 'payment' && e.remindDays && e.date <= addDays(today, e.remindDays)) return 'dueSoon'
  if (e.priceUp) return 'priceUp'
  return null
}

/** Whether you set an alert on it. */
export const hasAlert = (e: UpcomingEvent) => e.kind === 'payment' && !!(e.remindDays || e.noticeDays)

/**
 * The lines falling in a month, for the calendar: a monthly payment shows in every month, not
 * only its next one. Lines that only know the month (once-a-year planner lines) are `anyDay`.
 */
export function inMonth(events: UpcomingEvent[], month: MonthKey): { days: Map<string, UpcomingEvent[]>; anyDay: UpcomingEvent[] } {
  const days = new Map<string, UpcomingEvent[]>()
  const anyDay: UpcomingEvent[] = []
  for (const e of events) {
    if (e.done) continue
    const date = e.repeat === 'month' && e.kind === 'payment' ? nextDate(e.date, 'month', `${month}-01`) : e.date
    if (!date || date.slice(0, 7) !== month) continue
    if (e.monthOnly) anyDay.push(e)
    else days.set(date, [...(days.get(date) ?? []), { ...e, date }])
  }
  return { days, anyDay }
}

/** How many lines fall in the next 7 days, for the count on the tab. */
export const dueSoon = (events: UpcomingEvent[], today: string) => events.filter((e) => !e.done && e.date <= addDays(today, 7)).length

export type UpcomingGroup = 'thisMonth' | 'nextMonth' | 'later'

export function groupOf(e: UpcomingEvent, today: string): UpcomingGroup {
  const month = e.date.slice(0, 7)
  if (month <= today.slice(0, 7)) return 'thisMonth'
  if (month === monthsLater(today, 1).slice(0, 7)) return 'nextMonth'
  return 'later'
}

/** A payment seen in Tracking, offered to start an Upcoming line from. */
export interface TrackedPayment {
  key: string
  name: string
  categoryId: string | null
  /** The latest amount. */
  cents: number
  /** The latest day it was paid. */
  lastDate: string
  times: number
  /** A guess from the gap between the last two payments; you can change it. */
  repeat: Repeat
  /** When it would come next with that repeat. */
  nextDate: string
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

/**
 * Everything paid in Tracking (expenses and savings), one line per shop or payee, latest
 * first, so a line in Upcoming can be made from it instead of typed again.
 */
export function trackedPayments(transactions: Transaction[], today: string): TrackedPayment[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (t.block === 'income' || t.pretend) continue
    const key = groupKey({ ...t, cents: t.details.trim() ? 0 : t.cents })
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      list.sort((a, b) => b.date.localeCompare(a.date))
      const last = list[0]!
      const gap = list.length > 1 ? daysBetween(list[1]!.date, last.date) : null
      // Monthly when the last two are about a month apart, otherwise once a year.
      const repeat: Repeat = gap !== null && gap >= 20 && gap <= 45 ? 'month' : 'year'
      return {
        key,
        name: last.details.trim() || 'Payment',
        categoryId: last.categoryId,
        cents: last.cents,
        lastDate: last.date,
        times: list.length,
        repeat,
        nextDate: nextDate(last.date, repeat, addDays(today, 1))!,
      }
    })
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
}
