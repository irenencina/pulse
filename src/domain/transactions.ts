import { effectiveMonth, type MonthKey, type MonthRule } from './periods'
import type { Block } from './types'

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
  /** The import (see the imports table) that added it. */
  importId?: string
  createdAt: number
  /** Last time it was changed by hand after being added. */
  editedAt?: number
  /** Only for the Playground's pretend amounts on the Dashboard: never stored. */
  pretend?: boolean
  /** Forces the month it counts for (pretend amounts count for the month most of their column is in). */
  month?: MonthKey
}

/** The month a transaction counts for, after the late-income shift from Settings. */
export function countsFor(t: Pick<Transaction, 'date' | 'block' | 'month'>, settings: MonthRule): MonthKey {
  return t.month ?? effectiveMonth(t.date, t.block === 'income', settings)
}

export interface TrackedTotals {
  income: number
  expenses: number
  savings: number
  count: number
}

/** Adds up the transactions that count for a month, several months, or (null) all of them. */
export function trackedTotals(
  transactions: Transaction[],
  months: MonthKey | MonthKey[] | null,
  settings: MonthRule,
): TrackedTotals {
  const totals: TrackedTotals = { income: 0, expenses: 0, savings: 0, count: 0 }
  const wanted = months === null ? null : new Set(Array.isArray(months) ? months : [months])
  for (const t of transactions) {
    if (wanted !== null && !wanted.has(countsFor(t, settings))) continue
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

/** "Always put this merchant in this category", set on the merchant rules tool. */
export interface MerchantRule {
  /** merchantKey of the description. */
  merchant: string
  /** Set by hand: imports always use it. */
  categoryId?: string
  /** Deleted rule: what was learned before this moment is forgotten. */
  forgottenAt?: number
}

type History = Array<Pick<Transaction, 'details' | 'categoryId' | 'block' | 'createdAt' | 'pocket'>>

/**
 * Suggests a category for a bank row, in this order:
 * 0. a merchant rule set by hand;
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
  rules: MerchantRule[] = [],
  categories: Array<{ id: string; block: Block }> = [],
): { block: Block; categoryId: string } | null {
  const key = merchantKey(description)
  const rule = key ? rules.find((r) => r.merchant === key) : undefined
  const ruled = rule && categories.find((c) => c.id === rule.categoryId)
  if (ruled) return { block: ruled.block, categoryId: ruled.id }
  const linked = pocket ? (pockets.find((p) => p.name === pocket)?.categoryIds ?? []) : []
  const latest = (match: (t: History[number]) => boolean) => {
    let best: History[number] | null = null
    for (const t of history) {
      if (t.categoryId === null || merchantKey(t.details) !== key || !match(t)) continue
      if (rule?.forgottenAt !== undefined && t.createdAt <= rule.forgottenAt) continue
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
