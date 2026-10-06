import { evalAmount, isSum } from './money'
import { monthKey, type MonthKey } from './periods'
import type { Block, Category, Settings } from './types'

/**
 * One planned amount: a category in a month. Either a fixed amount, or a percentage of
 * that month's planned income (the spreadsheet's "ETF Investing = 15% of net income").
 */
export type BudgetCell =
  | { id: string; categoryId: string; month: MonthKey; kind: 'fixed'; cents: number; formula?: string; auto?: true }
  | { id: string; categoryId: string; month: MonthKey; kind: 'percent'; basisPoints: number }

/** A fixed amount can be typed as a sum ("350+300"); `formula` keeps it as typed. */
export type CellValue = { kind: 'fixed'; cents: number; formula?: string } | { kind: 'percent'; basisPoints: number }

export const cellId = (categoryId: string, month: MonthKey) => `${categoryId}|${month}`

/**
 * What a once-a-year category plans in a month it has nothing typed in: the amount in
 * its due month, 0 in the others. Never stored, so changing the amount changes every year.
 */
export function yearlyCell(category: Category, month: MonthKey): BudgetCell | undefined {
  if (!category.yearly) return undefined
  const cents = Number(month.slice(5)) === category.yearly.month ? category.yearly.cents : 0
  return { id: cellId(category.id, month), categoryId: category.id, month, kind: 'fixed', cents, auto: true }
}

/** A typed cell wins over the once-a-year amount, so any month can still be changed. */
export function plannedCell(byCell: Map<string, BudgetCell>, category: Category, month: MonthKey): BudgetCell | undefined {
  return byCell.get(cellId(category.id, month)) ?? yearlyCell(category, month)
}

export const MONTHS_IN_YEAR = 12
export const yearMonths = (year: number): MonthKey[] =>
  Array.from({ length: MONTHS_IN_YEAR }, (_, i) => monthKey(year, i + 1))

/**
 * Reads what someone typed into a planner cell. "15%" is a share of income, anything
 * else an amount or a sum like "350+300". Empty means "clear the cell". Returns undefined when it can't be read.
 */
export function parseCellInput(input: string): CellValue | null | undefined {
  const s = input.trim()
  if (s === '') return null
  if (s.endsWith('%')) {
    const n = Number(s.slice(0, -1).trim().replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return undefined
    return { kind: 'percent', basisPoints: Math.round(n * 100) }
  }
  const cents = evalAmount(s)
  if (cents === null) return undefined
  return isSum(s) ? { kind: 'fixed', cents, formula: s.replace(/^=/, '').replace(/\s+/g, '') } : { kind: 'fixed', cents }
}

/** How a cell looks while being edited: "486.50", "15%" or the sum as typed. */
export function formatCellInput(cell: CellValue | undefined): string {
  if (!cell) return ''
  if (cell.kind === 'percent') return `${cell.basisPoints / 100}%`
  return cell.formula ?? (cell.cents / 100).toFixed(2)
}

export interface MonthTotals {
  month: MonthKey
  /** False before the month budgeting starts in; such months count as zero. */
  active: boolean
  /**
   * Every category without subcategories has a value this month (0 counts, blank doesn't).
   * Until then, "save non-allocated" leaves the remainder unallocated instead of saving it.
   */
  complete: boolean
  /** True when "save non-allocated" would save the remainder, but the month isn't complete yet. */
  waitingForPlan: boolean
  income: number
  expenses: number
  /** Planned savings categories, without the Main Pot. */
  savings: number
  /** Income − expenses − savings, before the Main Pot takes any of it. */
  remainder: number
  /** What goes into (positive) or comes out of (negative) the Main Pot this month. */
  mainPot: number
  /** Income not given a job. 0 is the goal; negative means more is planned than there is. */
  toAllocate: number
  /** Main Pot balance at the end of the month, counted from the month budgeting starts. */
  potBalance: number
  /** Everything saved so far (savings categories plus the Main Pot), like the spreadsheet's "Pot Total". */
  savedTotal: number
}

export interface PlanYear {
  year: number
  months: MonthKey[]
  /** Planned cents per category per month, rolled up so a parent includes its subcategories. */
  amounts: Map<string, number[]>
  totals: MonthTotals[]
  /** How many months of this year are on or after the start; averages divide by this. */
  activeMonths: number
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/**
 * Turns the stored cells into the numbers the planner shows. Mirrors the spreadsheet:
 * the Main Pot ("Future") takes what's left of income after expenses and savings, and
 * when "allow dissaving" is on it also covers months where that is negative.
 */
export function computePlan(
  categories: Category[],
  cells: BudgetCell[],
  settings: Pick<Settings, 'startingYear' | 'startingMonth' | 'saveNonAllocated' | 'allowDissaving'>,
  year: number,
): PlanYear {
  const months = yearMonths(year)
  // Month keys are "YYYY-MM", so they compare in date order as strings.
  const start = startMonth(settings)
  const isActive = (month: MonthKey) => month >= start
  const byCell = new Map(cells.map((c) => [cellId(c.categoryId, c.month), c]))
  const live = categories.filter((c) => !c.archived)
  const parents = new Set(live.map((c) => c.parentId).filter((id): id is string => id !== null))
  const leaves = live.filter((c) => !parents.has(c.id))
  const isComplete = (month: MonthKey) => leaves.every((c) => plannedCell(byCell, c, month) !== undefined)

  // Each category's amount also counts for all its parents.
  const byId = new Map(categories.map((c) => [c.id, c]))
  const selfAndAncestors = (id: string): string[] => {
    const chain: string[] = []
    let current = byId.get(id)
    while (current && !chain.includes(current.id)) {
      chain.push(current.id)
      current = current.parentId === null ? undefined : byId.get(current.parentId)
    }
    return chain
  }

  const ownAmount = (category: Category, month: MonthKey, income: number): number => {
    // A category that got subcategories plans through them, even if it was once a year.
    const cell = parents.has(category.id) ? byCell.get(cellId(category.id, month)) : plannedCell(byCell, category, month)
    if (!cell) return 0
    if (cell.kind === 'fixed') return cell.cents
    // Percentages are of income, so they mean nothing on an income line itself.
    return category.block === 'income' ? 0 : Math.round((income * cell.basisPoints) / 10_000)
  }

  const monthTotals = (month: MonthKey) => {
    if (!isActive(month)) return { income: 0, own: new Map<string, number>(), expenses: 0, savings: 0, complete: false }
    // Income first, because percentage cells depend on it.
    const income = sum(live.filter((c) => c.block === 'income').map((c) => ownAmount(c, month, 0)))
    const own = new Map(live.map((c) => [c.id, ownAmount(c, month, income)]))
    const blockTotal = (block: Block) => sum(live.filter((c) => c.block === block).map((c) => own.get(c.id)!))
    return { income, own, expenses: blockTotal('expenses'), savings: blockTotal('savings'), complete: isComplete(month) }
  }

  // Balances carry over from the starting year, so earlier years are walked too.
  let potBalance = 0
  let savedTotal = 0
  for (let y = settings.startingYear; y < year; y++) {
    for (const m of yearMonths(y)) {
      const t = monthTotals(m)
      const pot = potMovement(t.income - t.expenses - t.savings, t.complete, settings)
      potBalance += pot
      savedTotal += t.savings + pot
    }
  }

  const amounts = new Map<string, number[]>(categories.map((c) => [c.id, months.map(() => 0)]))
  const totals: MonthTotals[] = months.map((month, i) => {
    const t = monthTotals(month)
    for (const [id, value] of t.own) {
      if (value === 0) continue
      for (const target of selfAndAncestors(id)) amounts.get(target)![i]! += value
    }
    const remainder = t.income - t.expenses - t.savings
    const counts = isActive(month)
    const mainPot = counts ? potMovement(remainder, t.complete, settings) : 0
    if (counts) {
      potBalance += mainPot
      savedTotal += t.savings + mainPot
    }
    return {
      month,
      active: counts,
      complete: t.complete,
      waitingForPlan: counts && !t.complete && remainder > 0 && settings.saveNonAllocated,
      income: t.income,
      expenses: t.expenses,
      savings: t.savings,
      remainder,
      mainPot,
      toAllocate: remainder - mainPot,
      potBalance,
      savedTotal,
    }
  })

  return { year, months, amounts, totals, activeMonths: months.filter(isActive).length }
}

/** The first month budgeting counts, as a month key. */
export function startMonth(settings: Pick<Settings, 'startingYear' | 'startingMonth'>): MonthKey {
  return monthKey(settings.startingYear, settings.startingMonth)
}

function potMovement(
  remainder: number,
  complete: boolean,
  settings: Pick<Settings, 'saveNonAllocated' | 'allowDissaving'>,
): number {
  // Leftover income is only saved once the month is fully planned, so it isn't saved by accident.
  if (remainder > 0) return settings.saveNonAllocated && complete ? remainder : 0
  return settings.allowDissaving ? remainder : 0
}

/**
 * Average per month, for costs paid once a year (a 240 membership is 20/month). In the
 * year budgeting starts, only the months from the start count.
 */
export function monthlyAverage(values: number[], months: number = MONTHS_IN_YEAR): number {
  return months > 0 ? Math.round(sum(values) / months) : 0
}
