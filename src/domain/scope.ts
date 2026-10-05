import { monthKey, type MonthKey } from './periods'

/** What the Tracking page shows, like the Year and Period pickers of the spreadsheet. */
export interface Scope {
  year: 'current' | number
  /** 'year' = the whole year, 'current' = this month, or a month number 1-12. */
  period: 'year' | 'current' | number
}

export const DEFAULT_SCOPE: Scope = { year: 'current', period: 'current' }

/** The months a scope covers, given today's month. */
export function scopeMonths(scope: Scope, today: MonthKey): MonthKey[] {
  const year = scope.year === 'current' ? Number(today.slice(0, 4)) : scope.year
  if (scope.period === 'year') return Array.from({ length: 12 }, (_, i) => monthKey(year, i + 1))
  const month = scope.period === 'current' ? Number(today.slice(5)) : scope.period
  return [monthKey(year, month)]
}
