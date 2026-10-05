import { computePlan, type BudgetCell } from './budget'
import { buildTree, flattenTree } from './categories'
import type { MonthKey } from './periods'
import { countsFor, type Transaction } from './transactions'
import { BLOCKS, type Block, type Category, type Settings } from './types'

export interface CategoryProgress {
  category: Category
  depth: number
  /** Planned this month, including subcategories. */
  planned: number
  /** Tracked this month, including subcategories. */
  tracked: number
  /** planned − tracked: left to spend, still to come in, or still to put away. */
  left: number
}

/**
 * Planned against tracked for each category over one or more months of one year (a month,
 * or the whole year), as a tree in planner order.
 * Categories with nothing planned and nothing tracked are left out.
 */
export function categoryProgress(
  categories: Category[],
  cells: BudgetCell[],
  transactions: Transaction[],
  settings: Settings,
  months: MonthKey | MonthKey[],
): Record<Block, CategoryProgress[]> {
  const list = Array.isArray(months) ? months : [months]
  const wanted = new Set(list)
  const plan = computePlan(categories, cells, settings, Number(list[0]!.slice(0, 4)))
  const indexes = list.map((m) => Number(m.slice(5)) - 1)
  const byId = new Map(categories.map((c) => [c.id, c]))
  const tracked = new Map<string, number>()
  for (const t of transactions) {
    if (t.categoryId === null || !wanted.has(countsFor(t, settings))) continue
    // Count it for the category and every parent, like the planner's roll-up.
    const seen = new Set<string>()
    let current = byId.get(t.categoryId)
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      tracked.set(current.id, (tracked.get(current.id) ?? 0) + t.cents)
      current = current.parentId === null ? undefined : byId.get(current.parentId)
    }
  }
  const result = {} as Record<Block, CategoryProgress[]>
  for (const block of BLOCKS) {
    result[block] = flattenTree(buildTree(categories, block, true))
      .map(({ category, depth }) => {
        const amounts = plan.amounts.get(category.id)
        const planned = amounts ? indexes.reduce((sum, i) => sum + amounts[i]!, 0) : 0
        const spent = tracked.get(category.id) ?? 0
        return { category, depth, planned, tracked: spent, left: planned - spent }
      })
      .filter((row) => row.planned !== 0 || row.tracked !== 0)
  }
  return result
}
