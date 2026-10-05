import { effectiveMonth, monthPeriod, type MonthKey, type MonthRule } from './periods'
import { merchantKey, type MerchantRule, type Transaction } from './transactions'

export interface LearnedMerchant {
  /** merchantKey, the same for "DECATHLON 123" and "Decathlon". */
  merchant: string
  /** The latest description, to show. */
  name: string
  /** The category used most recently for this merchant, or the rule's. */
  categoryId: string | null
  count: number
  /** How many of its transactions have another category than categoryId. */
  differing: number
  rule: boolean
}

/** Every merchant Pulse has seen, with what it learned for it, most frequent first. */
export function learnedMerchants(transactions: Transaction[], rules: MerchantRule[]): LearnedMerchant[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const key = merchantKey(t.details)
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  const byRule = new Map(rules.map((r) => [r.merchant, r.categoryId]))
  const result: LearnedMerchant[] = []
  for (const [merchant, list] of groups) {
    const latest = list.reduce((a, b) => (b.createdAt > a.createdAt ? b : a))
    const lastCategorised = list.filter((t) => t.categoryId !== null).reduce<Transaction | null>((a, b) => (!a || b.createdAt > a.createdAt ? b : a), null)
    const categoryId = byRule.get(merchant) ?? lastCategorised?.categoryId ?? null
    result.push({
      merchant,
      name: latest.details,
      categoryId,
      count: list.length,
      differing: categoryId === null ? 0 : list.filter((t) => t.categoryId !== categoryId).length,
      rule: byRule.has(merchant),
    })
  }
  return result.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export interface CalendarDay {
  /** "YYYY-MM-DD" */
  date: string
  /** Expenses that day, in cents. */
  spent: number
  count: number
}

/**
 * The days of a tracking month (following the whole-month shift setting), each with what
 * was spent on it, grouped in weeks starting on Monday. Days outside the month are null.
 */
export function spendingCalendar(transactions: Transaction[], month: MonthKey, settings: MonthRule): Array<Array<CalendarDay | null>> {
  const { from, to } = monthPeriod(month, settings)
  const days = new Map<string, CalendarDay>()
  for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10)
    days.set(date, { date, spent: 0, count: 0 })
  }
  for (const t of transactions) {
    if (t.block !== 'expenses' || effectiveMonth(t.date, false, settings) !== month) continue
    const day = days.get(t.date)
    if (!day) continue
    day.spent += t.cents
    day.count++
  }
  const list = [...days.values()]
  // Monday = 0 … Sunday = 6
  const lead = (new Date(`${from}T12:00:00Z`).getUTCDay() + 6) % 7
  const cells: Array<CalendarDay | null> = [...Array<null>(lead).fill(null), ...list]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: Array<Array<CalendarDay | null>> = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}
