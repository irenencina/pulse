import type { MonthKey, MonthRule } from './periods'
import { countsFor, type Transaction } from './transactions'
import type { Category, Tag } from './types'

export interface TagStats {
  tag: Tag
  /** Transactions with this tag in the months asked for, of any block. */
  count: number
  /** Expenses with this tag in those months. */
  spent: number
  /** Those expenses per top-level category, biggest first. null = no category yet. */
  byCategory: { categoryId: string | null; name: string; cents: number }[]
  /** Expenses with this tag ever. */
  spentAllTime: number
  /** The budget for the months asked for, and what counts against it; null without a budget. */
  budget: { cap: number; used: number; label: string } | null
}

/** What a tag's budget allows in the given months, and what is spent against it. */
function tagBudget(tag: Tag, expenses: Transaction[], months: MonthKey[], settings: MonthRule): TagStats['budget'] {
  if (tag.budgetCents === undefined) return null
  const sum = (list: Transaction[]) => list.reduce((total, t) => total + t.cents, 0)
  const period = tag.budgetPeriod ?? 'total'
  if (period === 'month') {
    const inMonths = new Set(months)
    return {
      cap: tag.budgetCents * months.length,
      used: sum(expenses.filter((t) => inMonths.has(countsFor(t, settings)))),
      label: months.length === 1 ? 'this month' : `over ${months.length} months`,
    }
  }
  if (period === 'year') {
    const years = new Set(months.map((m) => m.slice(0, 4)))
    return {
      cap: tag.budgetCents * years.size,
      used: sum(expenses.filter((t) => years.has(countsFor(t, settings).slice(0, 4)))),
      label: years.size === 1 ? `in ${[...years][0]}` : `over ${years.size} years`,
    }
  }
  return { cap: tag.budgetCents, used: sum(expenses), label: 'in total' }
}

/** What each tag adds up to in the given months. Tags with nothing there are left out, unless they have a budget. */
export function tagStats(
  transactions: Transaction[],
  tags: Tag[],
  categories: Category[],
  months: MonthKey[],
  settings: MonthRule,
): TagStats[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const topOf = (id: string | null): Category | undefined => {
    let current = id === null ? undefined : byId.get(id)
    const seen = new Set<string>()
    while (current && current.parentId !== null && !seen.has(current.id)) {
      seen.add(current.id)
      const parent = byId.get(current.parentId)
      if (!parent) break
      current = parent
    }
    return current
  }
  const inMonths = new Set(months)
  const result: TagStats[] = []
  for (const tag of tags) {
    const tagged = transactions.filter((t) => t.tagIds.includes(tag.id))
    const shown = tagged.filter((t) => inMonths.has(countsFor(t, settings)))
    const expenses = shown.filter((t) => t.block === 'expenses')
    const split = new Map<string | null, { categoryId: string | null; name: string; cents: number }>()
    for (const t of expenses) {
      const top = topOf(t.categoryId)
      const key = top?.id ?? null
      const entry = split.get(key) ?? { categoryId: key, name: top?.name ?? 'No category', cents: 0 }
      entry.cents += t.cents
      split.set(key, entry)
    }
    const stats: TagStats = {
      tag,
      count: shown.length,
      spent: expenses.reduce((sum, t) => sum + t.cents, 0),
      byCategory: [...split.values()].sort((a, b) => b.cents - a.cents),
      spentAllTime: tagged.filter((t) => t.block === 'expenses').reduce((sum, t) => sum + t.cents, 0),
      budget: tagBudget(tag, tagged.filter((t) => t.block === 'expenses'), months, settings),
    }
    if (stats.count > 0 || tag.budgetCents !== undefined) result.push(stats)
  }
  return result.sort((a, b) => b.spent - a.spent || a.tag.name.localeCompare(b.tag.name))
}

/** The expenses dated from `from` to `to` (both included), e.g. the days of a trip. */
export function expensesBetween(transactions: Transaction[], from: string, to: string): Transaction[] {
  if (!from || !to || from > to) return []
  return transactions.filter((t) => t.block === 'expenses' && t.date >= from && t.date <= to)
}
