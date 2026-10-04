import { effectiveMonth, type MonthKey } from './periods'
import type { Block, Settings } from './types'

export type TransactionSource = 'manual' | 'revolut'

/**
 * One tracked movement of money, like a row of the spreadsheet's tracking ledger.
 * The amount is always positive; the block says whether it is income, an expense or savings.
 */
export interface Transaction {
  id: string
  /** The day it happened, "YYYY-MM-DD". */
  date: string
  block: Block
  /** null while an imported transaction still needs a category. */
  categoryId: string | null
  cents: number
  details: string
  tagIds: string[]
  source: TransactionSource
  /** The Revolut pocket it was paid from, if any. */
  pocket?: string
  /** Identifies an imported bank row, so importing the same file twice adds nothing. */
  importKey?: string
  createdAt: number
}

/** The month a transaction counts for, after the late-income shift from Settings. */
export function countsFor(t: Pick<Transaction, 'date' | 'block'>, settings: Pick<Settings, 'shiftLateIncome' | 'lateIncomeDay'>): MonthKey {
  return effectiveMonth(t.date, t.block === 'income', settings)
}

export interface TrackedTotals {
  income: number
  expenses: number
  savings: number
  count: number
}

/** Adds up the transactions that count for one month. */
export function trackedTotals(
  transactions: Transaction[],
  month: MonthKey | null,
  settings: Pick<Settings, 'shiftLateIncome' | 'lateIncomeDay'>,
): TrackedTotals {
  const totals: TrackedTotals = { income: 0, expenses: 0, savings: 0, count: 0 }
  for (const t of transactions) {
    if (month !== null && countsFor(t, settings) !== month) continue
    totals[t.block] += t.cents
    totals.count++
  }
  return totals
}

/** Splits "#football club-fees, #kids" into tag names. */
export function parseTagList(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((s) => s.replace(/^#+/, '').trim())
    .filter(Boolean)
}

/** "DECATHLON Madrid 1234" and "Decathlon madrid" both become "decathlon madrid". */
export function merchantKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/[0-9*#/\\._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A Revolut pocket and the categories its money is meant for (e.g. Bills: Rent, Subscriptions). */
export interface Pocket {
  name: string
  categoryIds: string[]
}

type History = Array<Pick<Transaction, 'details' | 'categoryId' | 'block' | 'createdAt' | 'pocket'>>

/**
 * Suggests a category for a bank row, in this order:
 * 1. the category last used for the same merchant paid from the same pocket;
 * 2. the pocket's category, when the pocket is linked to just one;
 * 3. the category last used for the same merchant anywhere, if it fits the pocket's categories
 *    (or the pocket has none linked).
 * So a gym fee paid from Bills goes to Sports once it was put there, while groceries
 * from Mind & Fun don't inherit the Groceries category of the Household pocket.
 */
export function suggestCategory(
  description: string,
  pocket: string | null,
  history: History,
  pockets: Pocket[] = [],
): { block: Block; categoryId: string } | null {
  const key = merchantKey(description)
  const linked = pocket ? (pockets.find((p) => p.name === pocket)?.categoryIds ?? []) : []
  const latest = (match: (t: History[number]) => boolean) => {
    let best: History[number] | null = null
    for (const t of history) {
      if (t.categoryId === null || merchantKey(t.details) !== key || !match(t)) continue
      if (!best || t.createdAt > best.createdAt) best = t
    }
    return best ? { block: best.block, categoryId: best.categoryId! } : null
  }
  if (key) {
    const samePocket = latest((t) => (t.pocket ?? null) === pocket)
    if (samePocket) return samePocket
  }
  if (linked.length === 1) return { block: 'expenses', categoryId: linked[0]! }
  if (!key) return null
  return latest((t) => linked.length === 0 || linked.includes(t.categoryId!))
}
