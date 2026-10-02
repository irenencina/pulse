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

export interface Tag {
  id: string
  /** Normalised: lowercase, no leading '#', words joined by '-'. */
  name: string
}

export type SavingsRateMode = 'allocated' | 'notSpent'

export interface Settings {
  /** First year shown in the planner. Mirrors "Starting Year" in the Excel. */
  startingYear: number
  /** ISO 4217 code. Only EUR is offered for now, but every amount is stored with its currency. */
  currency: string
  /** Treat income received on or after `lateIncomeDay` as income for the next month. */
  shiftLateIncome: boolean
  lateIncomeDay: number
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
}

export const DEFAULT_SETTINGS: Settings = {
  startingYear: new Date().getFullYear(),
  currency: 'EUR',
  shiftLateIncome: true,
  lateIncomeDay: 20,
  saveNonAllocated: true,
  allowDissaving: true,
  savingsRateMode: 'allocated',
  carryOverDefault: 'carry',
}
