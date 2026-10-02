import type { Settings } from './types'

/** A budget month as "YYYY-MM". */
export type MonthKey = string

export function monthKey(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * The month a transaction counts towards. With "shift late income" on, income received
 * on or after the cut-off day counts for the next month (a salary paid on the 25th
 * pays for next month). Everything else counts in the month it happened.
 */
export function effectiveMonth(
  isoDate: string,
  isIncome: boolean,
  settings: Pick<Settings, 'shiftLateIncome' | 'lateIncomeDay'>,
): MonthKey {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  if (isIncome && settings.shiftLateIncome && d >= settings.lateIncomeDay) {
    return m === 12 ? monthKey(y + 1, 1) : monthKey(y, m + 1)
  }
  return monthKey(y, m)
}
