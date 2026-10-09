import { monthKey, type MonthKey, type MonthRule } from './periods'
import { countsFor, merchantKey, type Transaction } from './transactions'
import type { Block } from './types'

/** A payment that came every month lately but hasn't shown up yet this month (rent, a subscription). */
export interface Expected {
  /** Same for the same payment every month, to remember a skip. */
  key: string
  block: Block
  categoryId: string
  details: string
  cents: number
  /** The date it would have this month, following last month's day. */
  date: string
  pocket?: string
}

export function previousMonth(month: MonthKey, by = 1): MonthKey {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const index = y * 12 + (m - 1) - by
  return monthKey(Math.floor(index / 12), (index % 12) + 1)
}

/** The same day one month later, or the month's last day when it is shorter. */
export function nextMonthDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const [ny, nm] = m === 12 ? [y + 1, 1] : [y, m + 1]
  const last = new Date(ny, nm, 0).getDate()
  return `${monthKey(ny, nm)}-${String(Math.min(d, last)).padStart(2, '0')}`
}

export const groupKey = (t: Pick<Transaction, 'block' | 'categoryId' | 'details' | 'cents'>) =>
  `${t.block}|${t.categoryId}|${merchantKey(t.details) || `€${t.cents}`}`

/**
 * Payments that came exactly once in each of the two months before `month`, with about the
 * same amount (within 10%), and not yet in `month`. Groceries at the same shop several times a
 * month don't count, a monthly rent or gym fee does.
 */
export function expectedPayments(
  transactions: Transaction[],
  month: MonthKey,
  settings: MonthRule,
  skipped: Set<string> = new Set(),
): Expected[] {
  return monthlyPayments(transactions, month, settings).filter((e) => !e.seenIn && !skipped.has(`${e.key}|${month}`)).map(({ seenIn: _, ...e }) => e)
}

/**
 * The usual monthly payments (rent, a gym fee, the salary): ones that came exactly once in each
 * of the two months before `month`, with about the same amount. `seenIn` tells whether one has
 * shown up in `month` already.
 */
export function monthlyPayments(
  transactions: Transaction[],
  month: MonthKey,
  settings: MonthRule,
  /** How much the amount may change between the two months, as a share (0.1 is 10%). */
  tolerance = 0.1,
): Array<Expected & { seenIn: boolean }> {
  const recent = [previousMonth(month, 2), previousMonth(month, 1)]
  const groups = new Map<string, Map<MonthKey, Transaction[]>>()
  for (const t of transactions) {
    if (t.categoryId === null) continue
    const counts = countsFor(t, settings)
    if (counts !== month && !recent.includes(counts)) continue
    const key = groupKey(t)
    const byMonth = groups.get(key) ?? new Map<MonthKey, Transaction[]>()
    byMonth.set(counts, [...(byMonth.get(counts) ?? []), t])
    groups.set(key, byMonth)
  }
  const result: Array<Expected & { seenIn: boolean }> = []
  for (const [key, byMonth] of groups) {
    const [older, last] = recent.map((m) => byMonth.get(m) ?? [])
    if (older!.length !== 1 || last!.length !== 1) continue
    const a = older![0]!
    const b = last![0]!
    if (Math.abs(a.cents - b.cents) > Math.max(a.cents, b.cents) * tolerance) continue
    result.push({
      key,
      block: b.block,
      categoryId: b.categoryId!,
      details: b.details,
      cents: b.cents,
      date: nextMonthDate(b.date),
      ...(b.pocket ? { pocket: b.pocket } : {}),
      seenIn: byMonth.has(month),
    })
  }
  return result.sort((x, y) => x.date.localeCompare(y.date) || y.cents - x.cents)
}

/** Days between two "YYYY-MM-DD" dates. */
function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
}

/**
 * A transaction that looks like the same one: same block and amount, within a few days.
 * Used to warn before adding a duplicate by hand, and to match imported rows with ones typed in before.
 */
export function findDuplicate<T extends Pick<Transaction, 'id' | 'date' | 'block' | 'cents'>>(
  candidate: Pick<Transaction, 'date' | 'block' | 'cents'>,
  transactions: T[],
  options: { days?: number; exclude?: Set<string> } = {},
): T | null {
  const days = options.days ?? 3
  let best: T | null = null
  for (const t of transactions) {
    if (t.block !== candidate.block || t.cents !== candidate.cents || options.exclude?.has(t.id)) continue
    const gap = daysApart(t.date, candidate.date)
    if (gap > days) continue
    if (!best || gap < daysApart(best.date, candidate.date)) best = t
  }
  return best
}
