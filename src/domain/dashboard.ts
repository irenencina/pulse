import { computePlan, type BudgetCell } from './budget'
import { monthPeriod, type MonthKey, type MonthRule } from './periods'
import type { CategoryProgress } from './progress'
import { trackedTotals, type Transaction } from './transactions'
import { BLOCKS, type Block, type Category, type Settings } from './types'

const DAY = 24 * 60 * 60 * 1000
const dayNumber = (iso: string) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY)

/** How much of the period has passed, 0 to 1: days passed ÷ days in the period, today included. */
export function periodCompletion(months: MonthKey[], today: string, settings: MonthRule): number {
  if (months.length === 0) return 0
  const from = dayNumber(monthPeriod(months[0]!, settings).from)
  const to = dayNumber(monthPeriod(months[months.length - 1]!, settings).to)
  const now = dayNumber(today)
  return Math.min(1, Math.max(0, (now - from + 1) / (to - from + 1)))
}

/** Savings rate as set in Settings. null when there is no income to divide by. */
export function savingsRate(totals: Record<Block, number>, mode: Settings['savingsRateMode']): number | null {
  if (totals.income <= 0) return null
  return mode === 'allocated' ? totals.savings / totals.income : (totals.income - totals.expenses) / totals.income
}

export interface Slice {
  id: string
  name: string
  cents: number
}

/**
 * The biggest top-level categories, and the rest added up as "Other", like the spreadsheet's pie charts.
 * Transactions still without a category are a slice of their own, so the ring adds up to the total.
 */
export function topSlices(rows: CategoryProgress[], uncategorised = 0, count = 5): Slice[] {
  const top = rows
    .filter((r) => r.depth === 0 && r.tracked > 0)
    .map((r) => ({ id: r.category.id, name: r.category.name, cents: r.tracked }))
    .concat(uncategorised > 0 ? [{ id: 'none', name: 'No category yet', cents: uncategorised }] : [])
    .sort((a, b) => b.cents - a.cents)
  if (top.length <= count + 1) return top
  const rest = top.slice(count).reduce((sum, s) => sum + s.cents, 0)
  return [...top.slice(0, count), { id: 'other', name: 'Other', cents: rest }]
}

export interface MonthBars {
  month: MonthKey
  planned: Record<Block, number>
  tracked: Record<Block, number>
}

/** Planned and tracked per block for every month of a year. */
export function monthBars(
  categories: Category[],
  cells: BudgetCell[],
  transactions: Transaction[],
  settings: Settings,
  year: number,
): MonthBars[] {
  const plan = computePlan(categories, cells, settings, year)
  return plan.totals.map((t) => {
    const tracked = trackedTotals(transactions, t.month, settings)
    return {
      month: t.month,
      planned: Object.fromEntries(BLOCKS.map((b) => [b, t[b]])) as Record<Block, number>,
      tracked: Object.fromEntries(BLOCKS.map((b) => [b, tracked[b]])) as Record<Block, number>,
    }
  })
}
