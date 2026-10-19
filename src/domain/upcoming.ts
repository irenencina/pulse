/**
 * Upcoming: what will take money, or needs a decision, in the coming months. Most of it is
 * found in what Pulse already knows (once-a-year planner lines, payments that repeat in
 * Tracking, owned subscriptions, warranties, loan payments from Worth); the rest are items you add yourself.
 */
import { CHECK_NOTICE_DAYS, nextCheck, sheetBills, sheetChanges, type EmergencySheet } from './emergency'
import { plannedCell, cellId, type BudgetCell } from './budget'
import { monthKey, type MonthKey, type MonthRule } from './periods'
import { groupKey, monthlyPayments, nextMonthDate, previousMonth } from './recurring'
import { countsFor, type Transaction } from './transactions'
import { salesOf, type Category, type Sale, type SaleDates } from './types'
import { addYears, statusOf, type WishItem } from './wishlist'
import { wishTiming } from './wishTiming'
import { backupDueOn, type BackupEvery } from './backupPlan'
import type { TopUp } from './topups'
import { RESALE_STATUS_LABELS, resaleNudge, type ResaleItem } from './resale'
import { balanceIn, sideOf, type Account, type Balance } from './worth'

export type Repeat = 'once' | 'month' | 'year'

export const REPEAT_LABELS: Record<Repeat, string> = { once: 'Once', month: 'Monthly', year: 'Yearly' }

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
  /** The day you ticked that you cancelled it; it then leaves Upcoming. */
  cancelledOn?: string
}

/** Your changes to something Pulse found itself: hide it, or give it alerts. Keyed by its sourceKey. */
export interface UpcomingOverride {
  id: string
  hidden?: boolean
  noticeDays?: number
  remindDays?: number
  /** You cancelled it: it leaves Upcoming, and Tracking stops expecting it. */
  cancelledOn?: string
}

export type UpcomingSource = 'planner' | 'tracking' | 'subscription' | 'warranty' | 'loan' | 'pocket' | 'wishlist' | 'resale' | 'own' | 'emergency' | 'backup'

export interface UpcomingEvent {
  /** Unique per line. */
  key: string
  /** The thing it comes from, the same every month: an override uses it. */
  sourceKey: string
  source: UpcomingSource
  /** A top-up moves your own money into a pocket on payday: not a payment, so it adds to no total. */
  kind: 'payment' | 'cancelBy' | 'warranty' | 'topUp' | 'wishReady' | 'resaleNudge' | 'checkUp'
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
  accountId?: string
  /** For a "last day to cancel" line: the date it renews on. */
  renewsOn?: string
  /** For a top-up: the pocket's colour. */
  colour?: string
  /** For a wish: what it waits for ("Black Friday", "Cooling-off wait over"); for a thing to sell, how it's going. */
  note?: string
  /** A thing to sell that needs posting, or a lower price. */
  resaleId?: string
  nudge?: 'post' | 'lower' | 'pickup'
  /** A resale pick-up day that has passed while it isn't marked as sold. */
  late?: boolean
}

export interface UpcomingInput {
  categories: Category[]
  cells: BudgetCell[]
  transactions: Transaction[]
  wishes: WishItem[]
  items: UpcomingItem[]
  overrides: UpcomingOverride[]
  settings: MonthRule & { sales?: Sale[]; saleDates?: SaleDates; emergency?: EmergencySheet; backupEvery?: BackupEvery }
  /** Worth's accounts and balances: loans with terms add their payments. */
  accounts?: Account[]
  balances?: Balance[]
  /** What to move into each pocket on the next payday. */
  topUps?: TopUp[]
  /** The Resale plug-in's things: a nudge to post one, or to lower its price. */
  resale?: ResaleItem[]
  /** The day of the last backup from this browser (null: none yet). Left out, there's no backup reminder. */
  lastBackup?: string | null
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

  // Things to sell that have waited a week to be posted, a month posted without a buyer, or a buyer coming to pick
  // them up: a nudge from a week before, then on today's line until it's done. The asking price is shown, but it's
  // no payment.
  for (const r of input.resale ?? []) {
    const n = resaleNudge(r, today)
    if (!n || n.from > addDays(today, 7)) continue
    const where = r.sites.length > 0 ? ` on ${r.sites.join(', ')}` : ''
    const note =
      n.kind === 'pickup'
        ? n.days < 0
          ? 'Picked up? Mark it as sold'
          : (r.notes ?? 'Buyer picks it up')
        : n.kind === 'post'
        ? `Not posted yet, added ${n.days === 1 ? '1 day' : `${n.days} days`} ago`
        : `${RESALE_STATUS_LABELS.posted}${where} ${n.days === 1 ? '1 day' : `${n.days} days`} ago`
    events.push({
      key: `resale:${r.id}`,
      sourceKey: `resale:${r.id}`,
      source: 'resale',
      kind: 'resaleNudge',
      name: r.name,
      cents: r.askingCents,
      date: n.from < today ? today : n.from,
      repeat: 'once',
      categoryId: null,
      resaleId: r.id,
      nudge: n.kind,
      ...(n.kind === 'pickup' && n.days < 0 ? { late: true } : {}),
      note,
    })
  }

  // Wishes whose "Not before" comes up soon, or came in the last week (a sale while it runs): a nudge, not a payment.
  const sales = salesOf(input.settings)
  for (const w of input.wishes) {
    const t = wishTiming(w, today, sales)
    if (!t || !w.notBefore) continue
    if (t.ready && !(t.until && t.until >= today) && t.from < addDays(today, -7)) continue
    const nb = w.notBefore
    const note = 'sale' in nb ? (sales.find((s) => s.id === nb.sale)?.name ?? 'Sales') : 'wait' in nb ? 'Cooling-off wait over' : 'Wishlist'
    events.push({
      key: `wishReady:${w.id}`,
      sourceKey: `wishReady:${w.id}`,
      source: 'wishlist',
      kind: 'wishReady',
      name: w.name,
      cents: w.priceCents,
      date: t.from,
      repeat: 'once',
      categoryId: w.paidFrom ?? null,
      wishId: w.id,
      note,
    })
  }

  // Loan payments from Worth, unless Tracking already shows them.
  for (const a of input.accounts ?? []) {
    if (!a.loan || sideOf(a.kind) !== 'owe') continue
    const owed = balanceIn(input.balances ?? [], a.id, thisMonth)?.cents ?? 0
    if (owed <= 0 || a.loan.paymentCents <= 0) continue
    const words = significantWords(a.name)
    const tracked = recurring.some((r, i) => (a.categoryId !== undefined && r.categoryId === a.categoryId) || words.some((x) => recurringWords[i]!.has(x)))
    if (tracked) continue
    // Its day this month, or next month's once that has passed (the 31st is a short month's last day).
    const thisOne = monthsLater(`${thisMonth}-${String(a.loan.day).padStart(2, '0')}`, 0)
    const date = thisOne >= today ? thisOne : monthsLater(`${thisMonth}-${String(a.loan.day).padStart(2, '0')}`, 1)
    events.push({
      key: `loan:${a.id}`,
      sourceKey: `loan:${a.id}`,
      source: 'loan',
      kind: 'payment',
      name: a.name,
      cents: Math.min(a.loan.paymentCents, owed),
      date,
      repeat: 'month',
      categoryId: a.categoryId ?? null,
      accountId: a.id,
    })
  }

  for (const t of input.topUps ?? []) {
    events.push({
      key: `pocket:${t.pocket}:${t.month}`,
      sourceKey: `pocket:${t.pocket}`,
      source: 'pocket',
      kind: 'topUp',
      name: t.pocket,
      cents: t.cents,
      date: t.date,
      repeat: 'once',
      categoryId: null,
      colour: t.colour,
    })
  }

  for (const item of input.items) {
    if (item.cancelledOn) continue
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
    if (o?.hidden || o?.cancelledOn) continue
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
  // The emergency sheet, six months after it was last checked: from two weeks before, until it's checked again.
  // Sooner when an account or a bill was added or removed since: it's due now.
  const sheet = input.settings.emergency
  const check = nextCheck(sheet)
  const changed = sheetChanges(sheet, input.accounts ?? [], sheetBills(shown, input.accounts ?? [])) !== null
  if (check && !overrides.get('emergency:check')?.hidden && (changed || check <= addDays(today, CHECK_NOTICE_DAYS))) {
    shown.push({
      key: 'emergency:check',
      sourceKey: 'emergency:check',
      source: 'emergency',
      kind: 'checkUp',
      name: 'Emergency sheet',
      cents: null,
      date: changed || check < today ? today : check,
      repeat: 'once',
      categoryId: null,
      note: changed ? 'Changed since you last checked' : 'Check it’s still right',
    })
  }
  // A backup, from the day it's due by Settings → Your data, until one is saved.
  const backupOn = input.lastBackup === undefined ? null : backupDueOn(input.settings.backupEvery, input.lastBackup, today)
  if (backupOn && backupOn <= today && !overrides.get('backup:due')?.hidden) {
    const last = input.lastBackup
    shown.push({
      key: 'backup:due',
      sourceKey: 'backup:due',
      source: 'backup',
      kind: 'checkUp',
      name: 'Backup',
      cents: null,
      date: today,
      repeat: 'once',
      categoryId: null,
      note: last ? `Last one on ${Number(last.slice(8, 10))} ${MONTH_NAMES[Number(last.slice(5, 7)) - 1]}` : 'None yet',
    })
  }
  return shown.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type UpcomingFlag = 'priceUp' | 'cancelSoon' | 'warrantySoon' | 'dueSoon' | 'readySoon' | 'resaleSoon' | 'checkSoon'

/**
 * Lines that need a look: a last day to cancel, a warranty ending within a
 * month, a payment inside its reminder, or a price rise.
 */
export function flagOf(e: UpcomingEvent, today: string): UpcomingFlag | null {
  if (e.done) return null
  // A cancel line always says how long is left: that is what it is for.
  if (e.kind === 'cancelBy') return 'cancelSoon'
  // A wish says when it's ready to buy, from a week before.
  if (e.kind === 'wishReady') return e.date <= addDays(today, 7) ? 'readySoon' : null
  if (e.kind === 'resaleNudge') return 'resaleSoon'
  if (e.kind === 'checkUp') return 'checkSoon'
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
 * Everything paid in Tracking (expenses and savings), one line per payee and amount (Spotify
 * at €10.99 and at €12.99 are two lines), so a line in Upcoming can be made from it instead of
 * typed again. `repeatsOnly` keeps the ones paid more than once, like a subscription.
 */
export function trackedPayments(transactions: Transaction[], today: string, repeatsOnly = false): TrackedPayment[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (t.block === 'income' || t.pretend) continue
    const key = `${groupKey({ ...t, cents: 0 })}|${t.cents}`
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
    .filter((p) => !repeatsOnly || p.times > 1)
    .sort((a, b) => b.times - a.times || b.lastDate.localeCompare(a.lastDate))
}
