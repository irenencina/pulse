/**
 * Pocket top-ups: what to move into each Revolut pocket on payday, for Upcoming.
 */
import type { BudgetCell } from './budget'
import type { MonthKey } from './periods'
import { categoryProgress } from './progress'
import type { Pocket, Transaction } from './transactions'
import type { Category, Settings } from './types'
import { addMonths, pocketChecks, pocketColour, topUpCents, type Account, type Balance } from './worth'

export interface TopUp {
  pocket: string
  cents: number
  /** Payday, "YYYY-MM-DD". */
  date: string
  /** The month the money is for. */
  month: MonthKey
  colour: string
}

/** Payday: the day income shifts to the next month on, else the 1st. The next one on or after `today`. */
export function nextPayday(settings: Pick<Settings, 'shiftLateIncome' | 'lateIncomeDay'>, today: string): string {
  const day = settings.shiftLateIncome ? settings.lateIncomeDay : 1
  const on = (month: MonthKey) => {
    const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()
    return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`
  }
  const thisMonth = today.slice(0, 7) as MonthKey
  return on(thisMonth) >= today ? on(thisMonth) : on(addMonths(thisMonth, 1))
}

const plannedBy = (categories: Category[], cells: BudgetCell[], transactions: Transaction[], settings: Settings, month: MonthKey) =>
  new Map(
    Object.values(categoryProgress(categories, cells, transactions, settings, month)).flatMap((rows) =>
      rows.filter((r) => !r.other).map((r) => [r.category.id, r] as const),
    ),
  )

export function pocketTopUps(
  input: { pockets: Pocket[]; accounts: Account[]; balances: Balance[]; categories: Category[]; cells: BudgetCell[]; transactions: Transaction[]; settings: Settings },
  today: string,
): TopUp[] {
  const { pockets, accounts, balances, categories, cells, transactions, settings } = input
  if (pockets.length === 0) return []
  const date = nextPayday(settings, today)
  const paydayMonth = date.slice(0, 7) as MonthKey
  // Income on a shifted payday is for the next month.
  const month = settings.shiftLateIncome ? addMonths(paydayMonth, 1) : paydayMonth
  const before = addMonths(month, -1)
  const now = pocketChecks(pockets, accounts, balances, categories, plannedBy(categories, cells, transactions, settings, before), before, settings.pocketOrder, settings.pocketLeftovers)
  const next = plannedBy(categories, cells, transactions, settings, month)
  return now
    .map((check, i) => {
      const nextBudget = check.spent.reduce((sum, s) => sum + (next.get(s.categoryId)?.planned ?? 0), 0)
      return { pocket: check.pocket, cents: topUpCents(check, nextBudget, before), date, month, colour: pocketColour(settings.pocketColours ?? {}, check.pocket, i) }
    })
    .filter((t) => t.cents > 0)
}
