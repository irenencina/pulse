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
import type { Category, Settings } from './types'
import type { WishItem } from './wishlist'
import { addMonths, balanceIn, type Account, type Balance } from './worth'

export type SalePeriod = 'blackFriday' | 'januarySales' | 'summerSales'

export const SALE_LABELS: Record<SalePeriod, string> = {
  blackFriday: 'Black Friday',
  januarySales: 'January sales',
  summerSales: 'Summer sales',
}

/** Wait a number of days after adding it, until a date, or for a sales period. */
export type NotBefore = { wait: number } | { date: string } | { sale: SalePeriod }

const pad = (n: number) => String(n).padStart(2, '0')

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/** A sale's days in a year: Black Friday runs to Cyber Monday; the January and summer sales are their months. */
export function saleWindow(sale: SalePeriod, year: number): { from: string; to: string } {
  if (sale === 'januarySales') return { from: `${year}-01-02`, to: `${year}-01-31` }
  if (sale === 'summerSales') return { from: `${year}-07-01`, to: `${year}-07-31` }
  // The day after the fourth Thursday of November.
  const firstDay = new Date(Date.UTC(year, 10, 1)).getUTCDay()
  const firstThursday = 1 + ((4 - firstDay + 7) % 7)
  const friday = `${year}-11-${pad(firstThursday + 22)}`
  return { from: friday, to: addDays(friday, 3) }
}

/** The sale running today, or the next one. */
export function nextSale(sale: SalePeriod, today: string): { from: string; to: string } {
  const year = Number(today.slice(0, 4))
  const now = saleWindow(sale, year)
  return now.to >= today ? now : saleWindow(sale, year + 1)
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

/** When a wish may be bought; null when it has no "Not before" or is already owned. */
export function wishTiming(w: Pick<WishItem, 'notBefore' | 'addedOn' | 'owned'>, today: string): WishTiming | null {
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
  const s = nextSale(nb.sale, today)
  const on = s.from <= today
  return { from: s.from, until: s.to, ready: on, label: on ? `${SALE_LABELS[nb.sale]} now` : SALE_LABELS[nb.sale] }
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
 * Whether its price fits in the planner category it's paid from: an expense category's budget
 * left this month (or next month's whole budget), or what a savings fund holds (growing by its
 * monthly plan). Null without a price or a category to pay from.
 */
export function affordability(w: Pick<WishItem, 'priceCents' | 'paidFrom' | 'owned'>, input: AffordInput, today: string): Affordability | null {
  if (w.owned || w.priceCents === null || w.priceCents <= 0 || !w.paidFrom) return null
  const category = input.categories.find((c) => c.id === w.paidFrom)
  if (!category || category.block === 'income') return null
  const price = w.priceCents
  const month = today.slice(0, 7) as MonthKey
  const row = (m: MonthKey) => categoryProgress(input.categories, input.cells, input.transactions, input.settings, m)[category.block].find((r) => r.category.id === category.id && !r.other)
  const now = row(month)
  if (category.block === 'expenses') {
    if ((now?.left ?? 0) >= price) return { state: 'now' }
    const next = addMonths(month, 1)
    return (row(next)?.planned ?? 0) >= price ? { state: 'later', month: next } : { state: 'over' }
  }
  // A savings fund: the balance of a Wealth account saved through it, or everything tracked into it.
  const account = input.accounts?.find((a) => a.categoryId === category.id)
  const noted = account ? balanceIn(input.balances ?? [], account.id, month) : undefined
  let held = noted?.cents
  if (held === undefined) {
    const ids = descendantIds(input.categories, category.id)
    held = input.transactions.filter((t) => t.categoryId !== null && ids.has(t.categoryId) && t.date <= today && !t.pretend).reduce((sum, t) => sum + t.cents, 0)
  }
  if (held >= price) return { state: 'now' }
  const monthly = now?.planned ?? 0
  if (monthly <= 0) return { state: 'over' }
  const months = Math.ceil((price - held) / monthly)
  return months <= HORIZON ? { state: 'later', month: addMonths(month, months) } : { state: 'over' }
}

/** Ready to buy: any wait is over and the money is there. A wish with neither set has nothing to say. */
export const readyToBuy = (timing: WishTiming | null, afford: Affordability | null) =>
  (timing !== null || afford !== null) && (timing?.ready ?? true) && (afford?.state ?? 'now') === 'now'
