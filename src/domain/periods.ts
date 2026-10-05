import type { Settings } from './types'

/** The settings that decide which month a transaction counts for. */
export type MonthRule = Pick<Settings, 'shiftLateIncome' | 'lateIncomeDay'> & Partial<Pick<Settings, 'shiftWholeMonth'>>

/** A budget month as "YYYY-MM". */
export type MonthKey = string

export function monthKey(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * The month a transaction counts towards. With "shift late income" on, income received
 * on or after the cut-off day counts for the next month (a salary paid on the 25th
 * pays for next month). With "shift whole month" on as well, everything from that day
 * does, so October runs from 24 September to 23 October. Otherwise a transaction counts
 * in the month it happened.
 */
export function effectiveMonth(
  isoDate: string,
  isIncome: boolean,
  settings: MonthRule,
): MonthKey {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  if ((isIncome || settings.shiftWholeMonth) && settings.shiftLateIncome && d >= settings.lateIncomeDay) {
    return m === 12 ? monthKey(y + 1, 1) : monthKey(y, m + 1)
  }
  return monthKey(y, m)
}

/** The first and last day ("YYYY-MM-DD") of the dates that count for a month, for non-income. */
export function monthPeriod(month: MonthKey, settings: MonthRule): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const iso = (year: number, mon: number, day: number) => `${monthKey(year, mon)}-${String(day).padStart(2, '0')}`
  const daysIn = (year: number, mon: number) => new Date(year, mon, 0).getDate()
  if (!(settings.shiftWholeMonth && settings.shiftLateIncome) || settings.lateIncomeDay <= 1) {
    return { from: iso(y, m, 1), to: iso(y, m, daysIn(y, m)) }
  }
  const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1]
  const day = settings.lateIncomeDay
  // A cut-off day the previous month doesn't have (the 31st after September) shifts nothing from it.
  const from = day > daysIn(py, pm) ? iso(y, m, 1) : iso(py, pm, day)
  return { from, to: iso(y, m, Math.min(day - 1, daysIn(y, m))) }
}
