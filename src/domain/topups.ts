/**
 * Pocket top-ups: what to move into each Revolut pocket on payday, for Upcoming.
 */
import type { BudgetCell } from './budget'
import type { MonthKey } from './periods'
import { pocketBudgets } from './pocketBudgets'
import type { Pocket, Transaction } from './transactions'
import type { Category, Settings } from './types'
import { addMonths, balanceIn, pocketColour, topUpCents, type Account, type Balance } from './worth'

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
  const thisMonth = today.slice(0, 7) as MonthKey
  return pocketBudgets(pockets, categories, cells, transactions, settings, month, accounts)
    .map((b, i) => {
      const account = accounts.find((a) => a.bankName === b.pocket)
      const inPocket = account ? (balanceIn(balances, account.id, thisMonth)?.cents ?? null) : null
      return { pocket: b.pocket, cents: topUpCents(b.leftovers, b.budgetCents, inPocket), date, month, colour: pocketColour(settings.pocketColours ?? {}, b.pocket, i) }
    })
    .filter((t) => t.cents > 0)
}
