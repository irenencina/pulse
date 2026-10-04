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

/**
 * Suggests a category for a bank row from earlier transactions with the same merchant.
 * The most recent match wins, so correcting a category once teaches it for next time.
 */
export function suggestCategory(
  description: string,
  history: Array<Pick<Transaction, 'details' | 'categoryId' | 'block' | 'createdAt'>>,
): { block: Block; categoryId: string } | null {
  const key = merchantKey(description)
  if (!key) return null
  let best: (typeof history)[number] | null = null
  for (const t of history) {
    if (t.categoryId === null || merchantKey(t.details) !== key) continue
    if (!best || t.createdAt > best.createdAt) best = t
  }
  return best ? { block: best.block, categoryId: best.categoryId! } : null
}
