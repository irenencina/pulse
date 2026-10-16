/**
 * When a wish may be bought, and whether the money is there. "Not before" is a cooling-off
 * wait, a date or a sales period; affordability compares the price with what's left in the
 * planner category it's paid from (or, for a savings fund, what the fund holds).
 */
import type { BudgetCell } from './budget'
import type { MonthKey } from './periods'
import { categoryProgress } from './progress'
import { descendantIds } from './categories'
import type { Transaction } from './transactions'
import { DEFAULT_SALES, type Category, type Sale, type SaleDay, type Settings } from './types'
import { spentOnAllCopies, type WishItem } from './wishlist'
import { addMonths, balanceIn, type Account, type Balance } from './worth'

/** Wait a number of days after adding it, until a date, or for a sales period (by its id in Settings). */
export type NotBefore = { wait: number } | { date: string } | { sale: string }

const pad = (n: number) => String(n).padStart(2, '0')

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** The date a sale day falls on in a year: the start of a week for a first day, its end for a last day. */
export function saleDayIn(d: SaleDay, year: number, last: boolean): string {
  const length = daysIn(year, d.month)
  let day: number
  if (d.on === 'date') day = Math.min(d.day, length)
  else if (d.on === 'week') day = last ? (d.week === 4 ? length : d.week * 7) : (d.week - 1) * 7 + 1
  else {
    const first = new Date(Date.UTC(year, d.month - 1, 1)).getUTCDay()
    day = 1 + ((d.weekday - first + 7) % 7) + (d.nth - 1) * 7
    while (day > length) day -= 7
  }
  return `${year}-${pad(d.month)}-${pad(day)}`
}

/**
 * A sale's days starting in a year: Black Friday runs to Cyber Monday; the others run on the days
 * set in Settings (a last day before the first runs into the next year).
 */
export function saleWindow(sale: Sale, year: number): { from: string; to: string } {
  if (sale.rule !== 'blackFriday') {
    const { from, to } = sale
    const start = saleDayIn(from, year, false)
    const end = saleDayIn(to, year, true)
    return { from: start, to: end < start ? saleDayIn(to, year + 1, true) : end }
  }
  // The day after the fourth Thursday of November.
  const firstDay = new Date(Date.UTC(year, 10, 1)).getUTCDay()
  const firstThursday = 1 + ((4 - firstDay + 7) % 7)
  const friday = `${year}-11-${pad(firstThursday + 22)}`
  return { from: friday, to: addDays(friday, 3) }
}

/** The sale running today, or the next one. */
export function nextSale(sale: Sale, today: string): { from: string; to: string } {
  const year = Number(today.slice(0, 4))
  // One that started last year may still be running.
  return [year - 1, year, year + 1].map((y) => saleWindow(sale, y)).find((w) => w.to >= today)!
}

export interface WishTiming {
  /** The first day it may be bought. */
  from: string
  /** The last day of a sale. */
  until?: string
  ready: boolean
  /** What the badge says while waiting ("Wait 12 days", "From Dec 01", "Black Friday"), or during a sale. */
  label: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDay = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(8)}`

/** When a wish may be bought; null when it has no "Not before", is already owned, or waits for a sale that was deleted. */
export function wishTiming(w: Pick<WishItem, 'notBefore' | 'addedOn' | 'owned'>, today: string, sales: Sale[] = DEFAULT_SALES): WishTiming | null {
  const nb = w.notBefore
  if (!nb || w.owned) return null
  if ('wait' in nb) {
    const from = addDays(w.addedOn, nb.wait)
    const left = daysBetween(today, from)
    return { from, ready: left <= 0, label: left <= 0 ? 'Wait over' : `Wait ${left} ${left === 1 ? 'day' : 'days'}` }
  }
  if ('date' in nb) {
    return { from: nb.date, ready: nb.date <= today, label: `From ${shortDay(nb.date)}` }
  }
  const sale = sales.find((s) => s.id === nb.sale)
  if (!sale) return null
  const s = nextSale(sale, today)
  const on = s.from <= today
  return { from: s.from, until: s.to, ready: on, label: on ? `${sale.name} now` : sale.name }
}

export type Affordability = { state: 'now' } | { state: 'later'; month: MonthKey } | { state: 'over' }

export interface AffordInput {
  categories: Category[]
  cells: BudgetCell[]
  transactions: Transaction[]
  settings: Settings
  accounts?: Account[]
  balances?: Balance[]
}

/** How far ahead "Fits in …" looks for a savings fund. */
const HORIZON = 24

/**
 * Whether each wish's price fits in the planner category it's paid from, taking the wishes paid
 * from the same category in your own order, like a queue: the second one only fits once the first
 * one is paid for, and never before it. For an expense category that's the budget left this month,
 * then next month's whole budget; for a savings fund, what it holds, growing by its monthly plan.
 * One that doesn't fit at all doesn't hold up the ones after it. Null without a price or a
 * category to pay from.
 */
export function wishAffordability(wishes: WishItem[], input: AffordInput, today: string): Map<string, Affordability | null> {
  const result = new Map<string, Affordability | null>()
  const queues = new Map<string, WishItem[]>()
  for (const w of wishes) {
    result.set(w.id, null)
    if (w.owned || w.priceCents === null || w.priceCents <= 0 || !w.paidFrom) continue
    queues.set(w.paidFrom, [...(queues.get(w.paidFrom) ?? []), w])
  }
  const month = today.slice(0, 7) as MonthKey
  const rows = new Map<MonthKey, ReturnType<typeof categoryProgress>>()
  const row = (category: Category, m: MonthKey) => {
    if (!rows.has(m)) rows.set(m, categoryProgress(input.categories, input.cells, input.transactions, input.settings, m))
    return rows.get(m)![category.block].find((r) => r.category.id === category.id && !r.other)
  }
  for (const [categoryId, queue] of queues) {
    const category = input.categories.find((c) => c.id === categoryId)
    if (!category || category.block === 'income') continue
    queue.sort((a, b) => a.order - b.order)
    if (category.block === 'expenses') {
      // This month's leftover first; once one doesn't fit, the rest wait for next month's budget.
      let left = row(category, month)?.left ?? 0
      let next: MonthKey | null = null
      for (const w of queue) {
        const price = w.priceCents!
        if (next === null && price <= left) {
          left -= price
          result.set(w.id, { state: 'now' })
          continue
        }
        if (next === null) {
          next = addMonths(month, 1)
          left = row(category, next)?.planned ?? 0
        }
        if (price <= left) {
          left -= price
          result.set(w.id, { state: 'later', month: next })
        } else result.set(w.id, { state: 'over' })
      }
      continue
    }
    // A savings fund: the balance of a Wealth account saved through it, or everything tracked into
    // it less what was bought from it on the wishlist.
    const account = input.accounts?.find((a) => a.categoryId === category.id)
    let held = account ? balanceIn(input.balances ?? [], account.id, month)?.cents : undefined
    if (held === undefined) {
      const ids = descendantIds(input.categories, category.id)
      const saved = input.transactions.filter((t) => t.categoryId !== null && ids.has(t.categoryId) && t.date <= today && !t.pretend).reduce((sum, t) => sum + t.cents, 0)
      const spent = wishes.filter((w) => w.owned && w.paidFrom && ids.has(w.paidFrom)).reduce((sum, w) => sum + spentOnAllCopies(w), 0)
      held = Math.max(0, saved - spent)
    }
    const monthly = row(category, month)?.planned ?? 0
    let needed = 0
    let lastMonths = 0
    for (const w of queue) {
      const total = needed + w.priceCents!
      const months = total <= held ? 0 : monthly > 0 ? Math.max(lastMonths, Math.ceil((total - held) / monthly)) : Infinity
      if (months > HORIZON) {
        result.set(w.id, { state: 'over' })
        continue
      }
      needed = total
      lastMonths = months
      result.set(w.id, months === 0 ? { state: 'now' } : { state: 'later', month: addMonths(month, months) })
    }
  }
  return result
}

/** One wish on its own, as if nothing else on the wishlist were paid from its category. */
export function affordability(w: WishItem, input: AffordInput, today: string): Affordability | null {
  return wishAffordability([w], input, today).get(w.id) ?? null
}

/** Ready to buy: any wait is over and the money is there. A wish with neither set has nothing to say. */
export const readyToBuy = (timing: WishTiming | null, afford: Affordability | null) =>
  (timing !== null || afford !== null) && (timing?.ready ?? true) && (afford?.state ?? 'now') === 'now'
