/**
 * The Dashboard's view of the pockets: each pocket's budget (what its categories planned),
 * what was tracked in those categories (from any account) and, for pockets whose leftovers
 * carry over, what last month's plan left over. Only the plan and Tracking count here; the
 * bank's numbers are Wealth's.
 */
import type { BudgetCell } from './budget'
import { monthKey, type MonthKey } from './periods'
import { categoryProgress } from './progress'
import type { Pocket, Transaction } from './transactions'
import type { Category, PocketLeftovers, Settings } from './types'
import { addMonths, sortPockets, type Account } from './worth'

export interface PocketBudget {
  pocket: string
  account: Account | null
  leftovers: PocketLeftovers
  /** What its categories planned this month. Never changed by what carries over. */
  budgetCents: number
  /** Left over from last month's plan (budget plus its own carried over, minus tracked), on top. 0 with "Reset each month". */
  carriedCents: number
  /** Tracked this month per linked category (top ones only; subcategories count in their parent). */
  spent: Array<{ categoryId: string; cents: number }>
  spentCents: number
}

/** The linked categories, leaving out any under another linked one (its parent's total includes it). */
export function topCategories(pocket: Pocket, categories: Category[]): string[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const linked = new Set(pocket.categoryIds.filter((id) => byId.has(id)))
  return [...linked].filter((id) => {
    for (let c = byId.get(byId.get(id)!.parentId ?? ''), n = 0; c && n < 50; c = byId.get(c.parentId ?? ''), n++) if (linked.has(c.id)) return false
    return true
  })
}

/** How far back leftovers are followed. */
const CARRY_MONTHS = 24

export function pocketBudgets(
  pockets: Pocket[],
  categories: Category[],
  cells: BudgetCell[],
  transactions: Transaction[],
  settings: Settings,
  month: MonthKey,
  /** Wealth's accounts, so the pockets come in the same order as there. */
  accounts: Account[] = [],
): PocketBudget[] {
  const cache = new Map<MonthKey, Map<string, { planned: number; tracked: number }>>()
  const totals = (m: MonthKey) => {
    let by = cache.get(m)
    if (!by) {
      by = new Map(Object.values(categoryProgress(categories, cells, transactions, settings, m)).flatMap((rows) => rows.filter((r) => !r.other).map((r) => [r.category.id, r] as const)))
      cache.set(m, by)
    }
    return by
  }
  const planStart = monthKey(settings.startingYear, settings.startingMonth)
  const first = [planStart, addMonths(month, -CARRY_MONTHS)].sort().at(-1)!
  return sortPockets(
    pockets.map((p) => {
      const top = topCategories(p, categories)
      const budgetIn = (m: MonthKey) => top.reduce((sum, id) => sum + (totals(m).get(id)?.planned ?? 0), 0)
      const trackedIn = (m: MonthKey) => top.reduce((sum, id) => sum + Math.max(0, totals(m).get(id)?.tracked ?? 0), 0)
      const leftovers = settings.pocketLeftovers?.[p.name] ?? 'reset'
      // Each month's leftover adds to the next; overspending carries nothing and takes nothing off.
      let carriedCents = 0
      if (leftovers === 'carry') for (let m = first; m < month; m = addMonths(m, 1)) carriedCents = Math.max(0, budgetIn(m) + carriedCents - trackedIn(m))
      const spent = top.map((id) => ({ categoryId: id, cents: Math.max(0, totals(month).get(id)?.tracked ?? 0) }))
      return { pocket: p.name, account: accounts.find((a) => a.bankName === p.name) ?? null, leftovers, budgetCents: budgetIn(month), carriedCents, spent, spentCents: spent.reduce((sum, s) => sum + s.cents, 0) }
    }),
    settings.pocketOrder,
  )
}
