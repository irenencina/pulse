/**
 * The three fixed main blocks. Everything you budget or track belongs to one of them.
 * Blocks are not categories: categories and subcategories live inside a block.
 */
export const BLOCKS = ['income', 'expenses', 'savings'] as const
export type Block = (typeof BLOCKS)[number]

export const BLOCK_LABELS: Record<Block, string> = {
  income: 'Income',
  expenses: 'Expenses',
  savings: 'Savings',
}

/** What happens to unspent expense budget at the end of a month. */
export type CarryOverMode = 'carry' | 'toMainPot'

export interface Category {
  id: string
  block: Block
  /** null for a top-level category directly inside its block. */
  parentId: string | null
  name: string
  /** Position among siblings, ascending. */
  order: number
  archived: boolean
  /** Expenses only. Undefined means "use the default from Settings". */
  carryOver?: CarryOverMode
}

export type TagBudgetPeriod = 'total' | 'month' | 'year'

export interface Tag {
  id: string
  /** Normalised: lowercase, no leading '#', words joined by '-'. */
  name: string
  /** Optional amount to aim for with this tag, e.g. a trip, over budgetPeriod. */
  budgetCents?: number
  /** How long the budget lasts: everything ever tagged (the default), each month, or each year. */
  budgetPeriod?: TagBudgetPeriod
  /** Finished tags (an old trip) stay on their transactions but aren't suggested any more. */
  archived?: boolean
  /**
   * Days the tag covers ("YYYY-MM-DD", both included), e.g. a trip. Every expense on these
   * days gets the tag, also ones added or imported later.
   */
  from?: string
  to?: string
}

export type SavingsRateMode = 'allocated' | 'notSpent'

export interface Settings {
  /** First year shown in the planner. Mirrors "Starting Year" in the Excel. */
  startingYear: number
  /** Month (1-12) of the starting year in which budgeting starts. Earlier months count as zero. */
  startingMonth: number
  /** ISO 4217 code. Only EUR is offered for now, but every amount is stored with its currency. */
  currency: string
  /** Treat income received on or after `lateIncomeDay` as income for the next month. */
  shiftLateIncome: boolean
  lateIncomeDay: number
  /** Also shift everything else from that day in tracking, so a tracking month runs from day N to day N−1. */
  shiftWholeMonth: boolean
  /** Income left after expenses and savings goes to the Main Pot automatically. */
  saveNonAllocated: boolean
  /** The Main Pot may cover months where expenses exceed income. */
  allowDissaving: boolean
  /**
   * allocated: savings rate = savings / income.
   * notSpent:  savings rate = (income - expenses) / income.
   */
  savingsRateMode: SavingsRateMode
  /** Default for expense categories that don't set their own carry-over. */
  carryOverDefault: CarryOverMode
  /** Lab: the day weeks start on, 0 Sunday, 1 Monday … 6 Saturday. */
  labWeekStart: number
  /** Lab: a week starting below this is shown in red, above labHigh in green (cents). */
  labLow: number
  labHigh: number
  /** Lab: the money in the account at the start of the first week (cents). */
  labStartCents: number
  /** Lab: first day of the first week ("YYYY-MM-DD"); null means the current week. */
  labFirstWeek: string | null
  /** Lab: how many columns are shown. */
  labWeeks: number
  /** Lab: what one column covers. */
  labColumns: 'split' | 'week' | 'fortnight'
  /** Dashboard: add the playground's pretend amounts as a forecast. */
  dashPlayground: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  startingYear: new Date().getFullYear(),
  startingMonth: 1,
  currency: 'EUR',
  shiftLateIncome: true,
  lateIncomeDay: 20,
  shiftWholeMonth: false,
  saveNonAllocated: true,
  allowDissaving: true,
  savingsRateMode: 'allocated',
  carryOverDefault: 'carry',
  labWeekStart: 1,
  labLow: 0,
  labHigh: 100000,
  labStartCents: 0,
  labFirstWeek: null,
  labWeeks: 12,
  labColumns: 'week',
  dashPlayground: false,
}
